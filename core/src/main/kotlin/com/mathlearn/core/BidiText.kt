package com.mathlearn.core

/**
 * Inside a Hebrew (right-to-left) sentence, the Unicode bidi algorithm lays out a run like
 * "0.56 ☐ 0.098" or "63 − 36 : 4 = ?" right-to-left, which swaps the numbers. Wrapping each
 * math run in LEFT-TO-RIGHT ISOLATE ... POP DIRECTIONAL ISOLATE keeps it in written order.
 */
object BidiText {
    private const val LRI = '⁦'
    private const val PDI = '⁩'

    private val hebrew = Regex("[\\u0590-\\u05FF]")
    private val mathRun = Regex("[0-9(☐][0-9.,:+\\-−–×·*/=()☐?<>%_ ]*[0-9)?☐_]|[0-9]")

    fun containsHebrew(text: String): Boolean = hebrew.containsMatchIn(text)

    /** Returns [text] with math runs isolated; text without Hebrew is returned unchanged. */
    fun isolateMath(text: String): String {
        if (!containsHebrew(text) || text.indexOf(LRI) >= 0) return text
        return mathRun.replace(text) { m ->
            // A lone number needs no isolation; only runs mixing numbers with operators do.
            if (m.value.all { it.isDigit() || it == '.' || it == ',' }) m.value else "$LRI${m.value}$PDI"
        }
    }
}
