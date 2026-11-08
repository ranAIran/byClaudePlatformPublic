package com.mathlearn.core

/**
 * The hints a child can open one at a time in practice mode: the written hints first, then the
 * first step of the worked solution (when the solution has more than one step, so the step does
 * not give the whole answer away). The full solution stays behind its own button.
 */
object HintLadder {

    fun steps(e: Exercise): List<String> {
        val written = (listOfNotNull(e.hint) + e.hints).map { it.trim() }.filter { it.isNotEmpty() }
        val step = firstStep(e.explanation)?.let { "צעד ראשון: $it" }
        return (written + listOfNotNull(step)).distinct()
    }

    /** The first clause of a multi-step explanation, or null if it has only one step. */
    fun firstStep(explanation: String?): String? {
        val text = explanation?.trim().orEmpty()
        if (text.isEmpty()) return null
        // Split after a sentence end, a semicolon or a comma that is followed by a space
        // (decimal commas like "2,5" and thousands like "3,467" have no space after them).
        val parts = text.split(Regex("(?<=[.;])\\s+|;\\s*|,\\s+")).map { it.trim().trimEnd('.', ',', ';') }.filter { it.isNotEmpty() }
        if (parts.size < 2) return null
        return parts.first()
    }
}

/** Formats seconds as m:ss (or h:mm:ss for very long sessions). */
fun formatDuration(totalSeconds: Int): String {
    val s = maxOf(0, totalSeconds)
    val h = s / 3600; val m = (s % 3600) / 60; val sec = s % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, sec) else "%d:%02d".format(m, sec)
}
