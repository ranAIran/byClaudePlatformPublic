package com.lifearchipelago.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.ZoneId
import java.time.ZonedDateTime

/** R11: reminders ring at 09:00 on the due day, never for a moment that has passed. */
class RemindersTest {
    private val tz = ZoneId.of("Asia/Jerusalem")
    private fun at(s: String) = ZonedDateTime.parse(s).toInstant().toEpochMilli()

    @Test fun ringsAtNineOnTheDueDay() {
        val now = at("2026-11-06T08:00:00+02:00[Asia/Jerusalem]")
        assertEquals(at("2026-11-06T09:00:00+02:00[Asia/Jerusalem]"), Reminders.triggerAt("2026-11-06", now, tz))
        assertEquals(at("2026-11-20T09:00:00+02:00[Asia/Jerusalem]"), Reminders.triggerAt("2026-11-20", now, tz))
    }

    @Test fun nothingForAMomentThatHasPassed() {
        val now = at("2026-11-06T10:00:00+02:00[Asia/Jerusalem]")
        assertNull(Reminders.triggerAt("2026-11-06", now, tz))
        assertNull(Reminders.triggerAt("2026-11-01", now, tz))
        assertNull(Reminders.triggerAt("not a date", now, tz))
    }

    // R59: an exact time when the item has one; still 09:00 when it has none.
    @Test fun ringsAtTheItemsOwnTime() {
        val now = at("2026-11-28T16:30:00+02:00[Asia/Jerusalem]")
        assertEquals(at("2026-11-28T17:03:00+02:00[Asia/Jerusalem]"), Reminders.triggerAt("2026-11-28", now, tz, "17:03"))
        assertNull(Reminders.triggerAt("2026-11-28", now, tz, "16:00"))
        assertEquals(at("2026-11-29T09:00:00+02:00[Asia/Jerusalem]"), Reminders.triggerAt("2026-11-29", now, tz, ""))
        assertEquals(at("2026-11-29T09:00:00+02:00[Asia/Jerusalem]"), Reminders.triggerAt("2026-11-29", now, tz, "nonsense"))
    }

    @Test fun snoozeIsTenMinutesLater() {
        assertEquals(1_000_000L + 600_000L, Reminders.snoozeAt(1_000_000L))
    }

    @Test fun cancelsTasksThatLeftTheList() {
        assertEquals(setOf("b"), Reminders.stale(setOf("a", "b"), setOf("a", "c")))
    }
}
