package com.lifearchipelago.app

import org.junit.Assert.assertEquals
import org.junit.Test

/** R20: keep the newest 14 daily backups, never touch other files in the folder. */
class BackupsTest {
    @Test fun keepsTheNewestFourteen() {
        val names = (1..20).map { "life-backup-2026-11-%02d.json".format(it) } + listOf("holiday.jpg", "notes.json")
        assertEquals((1..6).map { "life-backup-2026-11-%02d.json".format(it) }, Backups.toDelete(names))
    }

    @Test fun nothingToDeleteWhenFew() {
        assertEquals(emptyList<String>(), Backups.toDelete(listOf("life-backup-2026-11-01.json")))
    }
}
