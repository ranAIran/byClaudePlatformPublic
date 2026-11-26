package com.lifearchipelago.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.documentfile.provider.DocumentFile

/**
 * R20 automatic backups: one JSON file a day in a folder the owner picked once (for example
 * Google Drive or Downloads). Only the newest 14 backup files are kept.
 */
object Backups {
    const val KEEP = 14
    private const val PREFS = "backups"

    /** Which backup files to delete so only the newest [keep] remain. Pure, so it is unit-tested. */
    fun toDelete(names: List<String>, keep: Int = KEEP): List<String> =
        names.filter { it.startsWith("life-backup-") && it.endsWith(".json") }.sorted().dropLast(keep)

    fun folder(context: Context): Uri? {
        val s = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("folder", null) ?: return null
        val uri = Uri.parse(s)
        val ok = context.contentResolver.persistedUriPermissions.any { it.uri == uri && it.isWritePermission }
        return if (ok) uri else null
    }

    fun setFolder(context: Context, uri: Uri) {
        context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("folder", uri.toString()).apply()
    }

    /** Writes today's file (replacing one of the same name) and removes the oldest beyond [KEEP]. */
    fun write(context: Context, name: String, json: String): Boolean = try {
        val dir = folder(context)?.let { DocumentFile.fromTreeUri(context, it) } ?: throw IllegalStateException("no folder")
        dir.findFile(name)?.delete()
        val file = dir.createFile("application/json", name) ?: throw IllegalStateException("cannot create")
        context.contentResolver.openOutputStream(file.uri, "wt")?.use { it.write(json.toByteArray(Charsets.UTF_8)) } ?: throw IllegalStateException("cannot write")
        val names = dir.listFiles().mapNotNull { it.name }
        for (old in toDelete(names)) dir.findFile(old)?.delete()
        true
    } catch (e: Exception) {
        false
    }
}
