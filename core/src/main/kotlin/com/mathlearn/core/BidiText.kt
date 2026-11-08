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
    fun isolateMath(text: String): String = isolateMathMapped(text).first

    /**
     * Like [isolateMath], plus a function from an index in [text] to the same position in the
     * returned string, so a highlight computed on the original text lands on the right characters.
     */
    fun isolateMathMapped(text: String): Pair<String, (Int) -> Int> {
        if (!containsHebrew(text) || text.indexOf(LRI) >= 0) return text to { i: Int -> i }
        val inserts = mutableListOf<Int>() // positions in the original text where a mark was inserted
        val out = StringBuilder()
        var last = 0
        for (m in mathRun.findAll(text)) {
            // A lone number needs no isolation; only runs mixing numbers with operators do.
            if (m.value.all { it.isDigit() || it == '.' || it == ',' }) continue
            out.append(text, last, m.range.first).append(LRI).append(m.value).append(PDI)
            inserts += m.range.first
            inserts += m.range.last + 1
            last = m.range.last + 1
        }
        out.append(text, last, text.length)
        return out.toString() to { i: Int -> i + inserts.count { it <= i } }
    }
}
