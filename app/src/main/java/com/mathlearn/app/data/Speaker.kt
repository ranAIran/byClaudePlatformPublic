package com.mathlearn.app.data

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.mathlearn.core.SpeechText
import java.util.Locale

/**
 * Reads text aloud in Hebrew and exposes which on-screen word is being spoken, so the UI can
 * highlight it. Uses the engine's word-range callbacks; if an engine doesn't send them, the
 * highlight advances on an estimate of speaking speed instead.
 */
class Speaker(context: Context) {
    enum class Status { STARTING, READY, NO_HEBREW, FAILED }

    var status by mutableStateOf(Status.STARTING)
        private set
    /** Key of the text block being read (null when silent). */
    var activeKey by mutableStateOf<String?>(null)
        private set
    /** Index of the word being read within [activePlan], -1 for none. */
    var activeToken by mutableIntStateOf(-1)
        private set
    var activePlan: SpeechText.Plan? = null
        private set

    /** Slower speech for children who need more time. */
    var slow by mutableStateOf(false)

    private val main = Handler(Looper.getMainLooper())
    private var gotRealRanges = false
    private var estimateStep: Runnable? = null
    private var counter = 0

    private val tts: TextToSpeech = TextToSpeech(context.applicationContext) { code ->
        main.post { onInit(code) }
    }

    private fun onInit(code: Int) {
        if (code != TextToSpeech.SUCCESS) { status = Status.FAILED; return }
        val result = listOf(Locale("he", "IL"), Locale("iw", "IL"), Locale("he"))
            .map { tts.setLanguage(it) }
            .firstOrNull { it >= TextToSpeech.LANG_AVAILABLE }
        status = if (result == null) Status.NO_HEBREW else Status.READY
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String) { main.post { startEstimate(utteranceId) } }
            override fun onDone(utteranceId: String) { main.post { finished(utteranceId) } }
            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String) { main.post { finished(utteranceId) } }
            override fun onStop(utteranceId: String, interrupted: Boolean) { main.post { finished(utteranceId) } }
            override fun onRangeStart(utteranceId: String, start: Int, end: Int, frame: Int) {
                main.post {
                    if (utteranceId != currentId) return@post
                    gotRealRanges = true
                    stopEstimate()
                    activeToken = activePlan?.tokenAtSpoken(start) ?: -1
                }
            }
        })
    }

    private var currentId: String? = null

    /** Reads [text] (as displayed); [key] identifies the block so only it is highlighted. */
    fun speak(key: String, text: String) {
        if (status != Status.READY) return
        val plan = SpeechText.plan(text)
        start(key, plan, plan.spoken)
    }

    /** Reads one word of [text] (the token at [tokenIndex]), e.g. when the child taps it. */
    fun speakWord(key: String, text: String, tokenIndex: Int) {
        if (status != Status.READY) return
        val plan = SpeechText.plan(text)
        val t = plan.tokens.getOrNull(tokenIndex) ?: return
        start(key, plan, plan.spoken.substring(t.spokenStart, t.spokenEnd), fixedToken = tokenIndex)
    }

    private var fixedToken = -1

    private fun start(key: String, plan: SpeechText.Plan, utterance: String, fixedToken: Int = -1) {
        stopEstimate()
        activeKey = key
        activePlan = plan
        this.fixedToken = fixedToken
        activeToken = if (fixedToken >= 0) fixedToken else 0
        gotRealRanges = fixedToken >= 0
        val id = "u${++counter}"
        currentId = id
        tts.setSpeechRate(if (slow) 0.6f else 0.9f)
        tts.speak(utterance, TextToSpeech.QUEUE_FLUSH, null, id)
    }

    fun stop() {
        tts.stop()
        clear()
    }

    private fun finished(id: String) { if (id == currentId) clear() }

    private fun clear() {
        stopEstimate()
        currentId = null
        activeKey = null
        activeToken = -1
        activePlan = null
    }

    /** Fallback highlight timing: about 70 ms per spoken character (slower when [slow]). */
    private fun startEstimate(id: String) {
        if (id != currentId || gotRealRanges) return
        val plan = activePlan ?: return
        val perChar = if (slow) 105L else 70L
        var i = 0
        val step = object : Runnable {
            override fun run() {
                if (id != currentId || gotRealRanges || i >= plan.tokens.size) return
                activeToken = i
                val t = plan.tokens[i]
                i++
                main.postDelayed(this, (t.spokenEnd - t.spokenStart + 1) * perChar)
            }
        }
        estimateStep = step
        main.postDelayed(step, 350) // give the engine a moment to report real ranges first
    }

    private fun stopEstimate() {
        estimateStep?.let { main.removeCallbacks(it) }
        estimateStep = null
    }

    fun shutdown() {
        stopEstimate()
        tts.shutdown()
    }
}
