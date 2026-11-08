package com.mathlearn.app

import android.app.Application
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.mathlearn.app.data.ImageTools
import com.mathlearn.app.data.Repository
import com.mathlearn.app.data.Speaker
import com.mathlearn.core.AnswerChecker
import com.mathlearn.core.AnswerRecord
import com.mathlearn.core.BuiltInSheets
import com.mathlearn.core.ClaudeExtractor
import com.mathlearn.core.Exercise
import com.mathlearn.core.ExerciseGenerator
import com.mathlearn.core.ExerciseParser
import com.mathlearn.core.ExerciseSet
import com.mathlearn.core.SessionResult
import com.mathlearn.core.SetKind
import com.mathlearn.core.SetSource
import com.mathlearn.core.Topic
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID

sealed interface Screen {
    data object Home : Screen
    data class Import(val initialUri: Uri? = null) : Screen
    data class Review(val draft: ExerciseSet, val rawText: String? = null) : Screen
    data class Session(val state: SessionState) : Screen
    data class Result(val result: SessionResult, val set: ExerciseSet) : Screen
    data object History : Screen
    data object Settings : Screen
}

enum class ExtractMethod { ON_DEVICE, CLAUDE }

/** Live state of one practice/test run. Kept in the ViewModel so it survives rotation. */
class SessionState(val set: ExerciseSet) {
    var index by mutableIntStateOf(0)
    val answers = mutableStateMapOf<String, String>()
    /** Practice: outcome of the latest check (true/false). */
    val lastCheck = mutableStateMapOf<String, Boolean>()
    /** First-attempt correctness, which is what the score counts. */
    val firstTry = mutableStateMapOf<String, Boolean>()
    val wrongAttempts = mutableStateMapOf<String, Int>()
    /** How many rungs of the hint ladder are open, per question. */
    val hintLevel = mutableStateMapOf<String, Int>()
    val solutionShown = mutableStateMapOf<String, Boolean>()
    /** Self-grades for exercises without an answer key. */
    val selfGrade = mutableStateMapOf<String, Boolean>()
    val startedAt: Long = System.currentTimeMillis()

    /** Milliseconds spent on each question so far (all visits added up). */
    val timeMs = mutableStateMapOf<String, Long>()
    private var openId: String? = null
    private var openSince = 0L

    /** The screen shows question [id] from now on. */
    fun enter(id: String) { leave(); openId = id; openSince = System.currentTimeMillis() }

    /** The current question is no longer on screen: add the time it was shown. */
    fun leave() {
        val id = openId ?: return
        timeMs[id] = (timeMs[id] ?: 0L) + (System.currentTimeMillis() - openSince)
        openId = null
    }

    /** Time on [id] including the visit in progress. */
    fun msOn(id: String, now: Long = System.currentTimeMillis()): Long =
        (timeMs[id] ?: 0L) + if (id == openId) now - openSince else 0L

    val current: Exercise get() = set.exercises[index]
    val isLast: Boolean get() = index == set.exercises.lastIndex
}

class AppViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = Repository(app)
    private val generator = ExerciseGenerator()

    /** Hebrew read-aloud with word highlighting, shared by all screens. */
    val speaker = Speaker(app).apply { slow = repo.slowSpeech }

    /** The chosen look (colors, buttons, text style). */
    var skin by mutableStateOf(com.mathlearn.app.ui.Skin.fromName(repo.skin))
        private set

    fun updateSkin(s: com.mathlearn.app.ui.Skin) { skin = s; repo.skin = s.name }

    /** Read each new question aloud automatically. */
    var autoRead by mutableStateOf(repo.autoRead)
        private set

    fun updateAutoRead(on: Boolean) { autoRead = on; repo.autoRead = on }
    fun toggleSlow() { speaker.slow = !speaker.slow; repo.slowSpeech = speaker.slow }

    override fun onCleared() { speaker.shutdown() }

    val backStack = mutableStateListOf<Screen>(Screen.Home)
    val screen: Screen get() = backStack.last()

    val sets = mutableStateListOf<ExerciseSet>().apply { addAll(repo.loadSets()) }

    init {
        // Add worksheets that ship with the app (e.g. the weekly class sheet) once.
        val added = repo.builtInsAdded
        val fresh = BuiltInSheets.all.filter { it.id !in added && sets.none { s -> s.id == it.id } }
        if (fresh.isNotEmpty()) {
            sets.addAll(0, fresh)
            repo.saveSets(sets.toList())
        }
        repo.builtInsAdded = added + BuiltInSheets.all.map { it.id }
    }
    val results = mutableStateListOf<SessionResult>().apply { addAll(repo.loadResults()) }

    var apiKey by mutableStateOf(repo.apiKey)
        private set
    var model by mutableStateOf(repo.model)
        private set

    // Import screen state
    /** Pages to read: one for a photo, several for a PDF. */
    var importPages by mutableStateOf<List<Bitmap>>(emptyList())
        private set
    var importBusy by mutableStateOf(false)
        private set
    var importError by mutableStateOf<String?>(null)
        private set

    // ---------- navigation ----------
    fun navigate(s: Screen) { speaker.stop(); backStack.add(s) }
    fun back(): Boolean {
        speaker.stop()
        if (backStack.size <= 1) return false
        backStack.removeAt(backStack.lastIndex)
        return true
    }
    private fun replaceTop(s: Screen) { backStack[backStack.lastIndex] = s }
    fun goHome() { backStack.clear(); backStack.add(Screen.Home) }

    // ---------- practice ----------
    fun startTopic(topic: Topic, kind: SetKind) =
        navigate(Screen.Session(SessionState(generator.generateSet(topic, if (kind == SetKind.TEST) 10 else 8, kind))))

    fun startMixedTest() = navigate(Screen.Session(SessionState(generator.generateMixedTest())))

    fun startSet(set: ExerciseSet, kind: SetKind = set.kind) =
        navigate(Screen.Session(SessionState(set.copy(kind = kind))))

    /** Practice mode: checks the current answer and records the first attempt. */
    fun check(state: SessionState) {
        val ex = state.current
        val given = state.answers[ex.id].orEmpty()
        val expected = ex.answer ?: return
        val ok = AnswerChecker.isCorrect(expected, given)
        state.lastCheck[ex.id] = ok
        if (ex.id !in state.firstTry) state.firstTry[ex.id] = ok
        if (!ok) state.wrongAttempts[ex.id] = (state.wrongAttempts[ex.id] ?: 0) + 1
    }

    fun finish(state: SessionState) {
        state.leave()
        val records = state.set.exercises.map { ex ->
            val given = state.answers[ex.id].orEmpty()
            val correct: Boolean? = when {
                ex.answer == null -> state.selfGrade[ex.id]
                state.set.kind == SetKind.EXERCISES -> state.firstTry[ex.id] ?: false
                else -> AnswerChecker.isCorrect(ex.answer!!, given)
            }
            AnswerRecord(ex.id, given, correct, seconds = ((state.timeMs[ex.id] ?: 0L) / 1000).toInt())
        }
        val result = SessionResult(
            id = UUID.randomUUID().toString(),
            setId = state.set.id,
            setTitle = state.set.title,
            kind = state.set.kind,
            finishedAt = System.currentTimeMillis(),
            answers = records,
            totalSeconds = ((System.currentTimeMillis() - state.startedAt) / 1000).toInt(),
        )
        results.add(0, result)
        repo.saveResults(results.toList())
        replaceTop(Screen.Result(result, state.set))
    }

    /** Builds a practice set from the questions missed in [result]. */
    fun practiceMistakes(result: SessionResult, set: ExerciseSet) {
        val wrong = result.answers.filter { it.correct == false }.map { it.exerciseId }.toSet()
        val exercises = set.exercises.filter { it.id in wrong }
        if (exercises.isEmpty()) return
        replaceTop(Screen.Session(SessionState(set.copy(
            id = set.id, title = "${set.title} – תיקון טעויות", kind = SetKind.EXERCISES, exercises = exercises,
        ))))
    }

    // ---------- import ----------
    fun loadImage(uri: Uri) {
        importError = null
        viewModelScope.launch {
            try {
                val app = getApplication<Application>()
                val isPdf = app.contentResolver.getType(uri) == "application/pdf" ||
                    uri.toString().endsWith(".pdf", ignoreCase = true)
                importPages = withContext(Dispatchers.IO) {
                    if (isPdf) ImageTools.loadPdfPages(app, uri) else listOf(ImageTools.loadBitmap(app, uri))
                }
                if (importPages.isEmpty()) importError = "בקובץ אין עמודים"
            } catch (e: Exception) {
                importError = "לא הצלחנו לפתוח את התמונה: ${e.message}"
            }
        }
    }

    fun clearImport() { importPages = emptyList(); importError = null; importBusy = false }

    fun extract(method: ExtractMethod, note: String) {
        val pages = importPages.ifEmpty { return }
        importBusy = true
        importError = null
        viewModelScope.launch {
            try {
                val (draft, raw) = withContext(Dispatchers.Default) {
                    when (method) {
                        ExtractMethod.ON_DEVICE -> {
                            val text = pages.map { ImageTools.recognizeText(it) }.joinToString("\n")
                            ExerciseParser.parse(text) to text
                        }
                        ExtractMethod.CLAUDE -> {
                            val jpegs = pages.map { ImageTools.toJpeg(it) }
                            val set = withContext(Dispatchers.IO) {
                                ClaudeExtractor(apiKey, model).extract(jpegs, "image/jpeg", note)
                            }
                            set to null
                        }
                    }
                }
                importBusy = false
                if (draft.exercises.isEmpty() && raw.isNullOrBlank()) {
                    importError = "לא נמצאו תרגילים. נסו תמונה חדה יותר ובתאורה טובה."
                } else {
                    replaceTop(Screen.Review(draft, raw))
                    importPages = emptyList()
                }
            } catch (e: Exception) {
                importBusy = false
                importError = e.message ?: "החילוץ נכשל"
            }
        }
    }

    fun newManualSet() = navigate(Screen.Review(ExerciseSet(
        id = UUID.randomUUID().toString(), title = "התרגילים שלי", kind = SetKind.EXERCISES,
        source = SetSource.MANUAL, createdAt = System.currentTimeMillis(), exercises = emptyList(),
    )))

    // ---------- saved sets ----------
    fun saveSet(set: ExerciseSet) {
        val i = sets.indexOfFirst { it.id == set.id }
        if (i >= 0) sets[i] = set else sets.add(0, set)
        repo.saveSets(sets.toList())
    }

    fun deleteSet(set: ExerciseSet) {
        sets.removeAll { it.id == set.id }
        repo.saveSets(sets.toList())
    }

    fun saveAndStart(set: ExerciseSet) {
        saveSet(set)
        replaceTop(Screen.Session(SessionState(set)))
    }

    fun saveAndClose(set: ExerciseSet) {
        saveSet(set)
        back()
    }

    // ---------- settings ----------
    fun updateSettings(key: String, modelId: String) {
        repo.apiKey = key; repo.model = modelId
        apiKey = repo.apiKey; model = repo.model
    }

    fun clearHistory() {
        results.clear()
        repo.saveResults(emptyList())
    }
}
