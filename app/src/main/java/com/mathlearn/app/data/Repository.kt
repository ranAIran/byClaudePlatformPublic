package com.mathlearn.app.data

import android.content.Context
import com.mathlearn.core.ExerciseSet
import com.mathlearn.core.SessionResult
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.io.File

/** Stores worksheets and results as JSON files in the app's private storage. */
class Repository(context: Context) {
    private val dir = context.filesDir
    private val setsFile = File(dir, "sets.json")
    private val resultsFile = File(dir, "results.json")
    private val prefs = context.getSharedPreferences("settings", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = false }

    fun loadSets(): List<ExerciseSet> = read(setsFile) { json.decodeFromString(ListSerializer(ExerciseSet.serializer()), it) }
    fun saveSets(sets: List<ExerciseSet>) = write(setsFile, json.encodeToString(ListSerializer(ExerciseSet.serializer()), sets))

    fun loadResults(): List<SessionResult> = read(resultsFile) { json.decodeFromString(ListSerializer(SessionResult.serializer()), it) }
    fun saveResults(results: List<SessionResult>) = write(resultsFile, json.encodeToString(ListSerializer(SessionResult.serializer()), results))

    var apiKey: String
        get() = prefs.getString("api_key", "") ?: ""
        set(v) = prefs.edit().putString("api_key", v.trim()).apply()

    var model: String
        get() = prefs.getString("model", null)?.takeIf { it.isNotBlank() } ?: com.mathlearn.core.ClaudeExtractor.DEFAULT_MODEL
        set(v) = prefs.edit().putString("model", v.trim()).apply()

    var skin: String?
        get() = prefs.getString("skin", null)
        set(v) = prefs.edit().putString("skin", v).apply()

    var autoRead: Boolean
        get() = prefs.getBoolean("auto_read", false)
        set(v) = prefs.edit().putBoolean("auto_read", v).apply()

    var slowSpeech: Boolean
        get() = prefs.getBoolean("slow_speech", false)
        set(v) = prefs.edit().putBoolean("slow_speech", v).apply()

    /** Built-in sheets already offered once, so a sheet the user deleted does not come back. */
    var builtInsAdded: Set<String>
        get() = prefs.getStringSet("builtins_added", emptySet()) ?: emptySet()
        set(v) = prefs.edit().putStringSet("builtins_added", v).apply()

    private fun <T> read(file: File, decode: (String) -> List<T>): List<T> =
        try { if (file.exists()) decode(file.readText()) else emptyList() } catch (_: Exception) { emptyList() }

    private fun write(file: File, text: String) {
        val tmp = File(file.parentFile, file.name + ".tmp")
        tmp.writeText(text)
        tmp.renameTo(file)
    }
}
