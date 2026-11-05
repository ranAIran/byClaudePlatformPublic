package com.mathlearn.core

/**
 * Compares a student's answer to the expected one. Numeric answers are compared by value,
 * so "0.5", "1/2", "2/4" and "50%" all match an expected "1/2". Text answers are compared
 * case- and whitespace-insensitively. The expected answer may list alternatives with "|".
 */
object AnswerChecker {

    fun isCorrect(expected: String, given: String): Boolean {
        if (given.isBlank()) return false
        return expected.split('|').any { matchesOne(it, given) }
    }

    private fun matchesOne(expected: String, given: String): Boolean {
        val e = stripLabel(expected)
        val g = stripLabel(given)
        val ev = parseValue(e)
        val gv = parseValue(g)
        if (ev != null && gv != null) return ev == gv
        // Ratios such as "2:3" vs "4:6" are compared by value above (':' is division),
        // everything else falls back to normalized text.
        return normalizeText(e) == normalizeText(g)
    }

    /** Parses a numeric answer (number, fraction, mixed number, percent or expression). */
    fun parseValue(text: String): Rational? {
        val t = stripUnits(stripLabel(text))
        if (t.isEmpty()) return null
        if (t.any { it.isLetter() }) return null
        return ExpressionEvaluator.tryEvaluate(t)
    }

    /** Removes a leading "x =" / "Answer:" style label. */
    private fun stripLabel(s: String): String {
        var t = s.trim()
        t = t.replace(Regex("^(answer|ans|תשובה)\\s*[:=]\\s*", RegexOption.IGNORE_CASE), "")
        t = t.replace(Regex("^[a-zA-Z]\\s*=\\s*"), "")
        return t.trim()
    }

    /** Drops trailing measurement units so "24 cm²" matches "24". */
    private fun stripUnits(s: String): String =
        s.replace(Regex("\\s*(cm|mm|km|m|kg|g|ml|l|sq|units?|ס\"מ|מ\"ר|ש\"ח|₪|\\$)\\s*[²³^0-9]*\\s*$", RegexOption.IGNORE_CASE), "")
            .replace("₪", "").replace("$", "").trim()

    private fun normalizeText(s: String): String {
        val t = s.lowercase().replace(Regex("\\s+"), "").replace(Regex("[.。!]$"), "")
        return when (t) { "yes", "y", "כן" -> "כן"; "no", "n", "לא" -> "לא"; else -> t }
    }
}
