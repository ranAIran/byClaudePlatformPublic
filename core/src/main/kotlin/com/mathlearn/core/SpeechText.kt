package com.mathlearn.core

/**
 * Turns a question as displayed ("3/4 + 1/8 = ?") into Hebrew text a speech engine reads well
 * ("3 רבעים ועוד שמינית שווה כמה"), and keeps a map between the two so the word being spoken
 * can be highlighted on screen. Each whitespace-separated word on screen is one token.
 */
object SpeechText {

    /** One on-screen word: its range in the displayed text and in the spoken text (end exclusive). */
    data class Token(val displayStart: Int, val displayEnd: Int, val spokenStart: Int, val spokenEnd: Int)

    class Plan(val spoken: String, val tokens: List<Token>) {
        /** Index of the token being read at [spokenIndex] (a speech engine's boundary offset), or -1. */
        fun tokenAtSpoken(spokenIndex: Int): Int {
            var found = -1
            for ((i, t) in tokens.withIndex()) if (t.spokenStart <= spokenIndex) found = i else break
            return found
        }

        /** Index of the token under [displayIndex] (a tap on the screen), or -1. */
        fun tokenAtDisplay(displayIndex: Int): Int =
            tokens.indexOfFirst { displayIndex >= it.displayStart && displayIndex < it.displayEnd }
    }

    private val word = Regex("\\S+")

    fun plan(display: String): Plan {
        val tokens = mutableListOf<Token>()
        val sb = StringBuilder()
        var prevEnd = 0
        var prevWasInteger = false
        for (m in word.findAll(display)) {
            if (sb.isNotEmpty()) sb.append(if (display.substring(prevEnd, m.range.first).contains('\n')) ". " else " ")
            val raw = m.value
            val spoken = speakWord(raw, afterInteger = prevWasInteger)
            val start = sb.length
            sb.append(spoken)
            tokens += Token(m.range.first, m.range.last + 1, start, sb.length)
            prevEnd = m.range.last + 1
            prevWasInteger = raw.matches(Regex("\\d+"))
        }
        return Plan(sb.toString(), tokens)
    }

    private val ones = listOf("", "", "חצי", "שליש", "רבע", "חמישית", "שישית", "שביעית", "שמינית", "תשיעית", "עשירית")
    private val plurals = listOf("", "", "חצאים", "שלישים", "רבעים", "חמישיות", "שישיות", "שביעיות", "שמיניות", "תשיעיות", "עשיריות")

    /** "3/4" -> "3 רבעים", "1/2" -> "חצי", "7/12" -> "7 חלקי 12". */
    fun fraction(num: String, den: String): String {
        val d = den.toIntOrNull() ?: return "$num חלקי $den"
        return when {
            d in 2..10 && num == "1" -> ones[d]
            d in 2..10 -> "$num ${plurals[d]}"
            else -> "$num חלקי $den"
        }
    }

    private val units = mapOf(
        "סמ״ר" to "סנטימטר רבוע", "סמ\"ר" to "סנטימטר רבוע", "מ״ר" to "מטר רבוע", "מ\"ר" to "מטר רבוע",
        "ס״מ" to "סנטימטר", "ס\"מ" to "סנטימטר", "ק״מ" to "קילומטר", "ק\"מ" to "קילומטר",
        "מ׳" to "מטר", "₪" to "שקלים", "ש״ח" to "שקלים", "ש\"ח" to "שקלים",
    )
    private val operators = mapOf(
        "+" to "ועוד", "-" to "פחות", "−" to "פחות", "–" to "פחות", "·" to "כפול", "×" to "כפול", "*" to "כפול",
        ":" to "חלקי", "÷" to "חלקי", "=" to "שווה", "?" to "כמה", "☐" to "משבצת", "□" to "משבצת",
        ">" to "גדול מ", "<" to "קטן מ", "←" to "", "→" to "",
    )

    internal fun speakWord(raw: String, afterInteger: Boolean = false): String {
        operators[raw]?.let { return it }
        // Emoji and decorations ("💡", "🎉") are not read.
        if (raw.none { it.isLetterOrDigit() }) return ""
        units[raw]?.let { return it }

        var w = raw
        val prefix = StringBuilder()
        val suffix = StringBuilder()
        // Brackets around a negative number are just notation: "(-7)" reads "מינוס 7".
        Regex("^\\((?:-|−)(\\d+(?:\\.\\d+)?)\\)([.,?!:]?)$").matchEntire(w)?.let { return "מינוס ${it.groupValues[1]}${it.groupValues[2]}" }
        while (w.startsWith("(")) { prefix.append("פותחים סוגריים "); w = w.drop(1) }
        // Keep trailing punctuation so the voice pauses, but read closing brackets.
        var trail = ""
        while (w.isNotEmpty() && w.last() in ".,?!;") { trail = w.last() + trail; w = w.dropLast(1) }
        while (w.endsWith(")")) { suffix.insert(0, " סוגרים סוגריים"); w = w.dropLast(1) }
        units[w]?.let { return "$prefix$it$suffix$trail" }
        // A unit with a Hebrew prefix letter: "במ״ר" -> "במטר רבוע", "בס״מ" -> "בסנטימטר"
        for (n in 1..2) if (w.length > n && w.take(n).all { it in "בלוהכשמ" }) {
            units[w.drop(n)]?.let { return "$prefix${w.take(n)}$it$suffix$trail" }
        }

        val body = when {
            w.isEmpty() -> ""
            // Hebrew prefix letter + hyphen + number ("ו-2", "ב-3") -> "ו2"
            Regex("^([א-ת]{1,3})[-־](.+)$").matches(w) -> {
                val (p, rest) = Regex("^([א-ת]{1,3})[-־](.+)$").matchEntire(w)!!.destructured
                p + speakWord(rest)
            }
            Regex("^-?\\d+/\\d+$").matches(w) -> {
                val neg = w.startsWith("-")
                val (n, d) = w.removePrefix("-").split("/")
                (if (neg) "מינוס " else if (afterInteger) "ו" else "") + fraction(n, d)
            }
            Regex("^[-−]\\d+(\\.\\d+)?$").matches(w) -> "מינוס " + w.drop(1)
            Regex("^\\d{1,3}(,\\d{3})+(\\.\\d+)?$").matches(w) -> w.replace(",", "")
            Regex("^\\d+(\\.\\d+)?%$").matches(w) -> w.dropLast(1) + " אחוז"
            Regex("^\\d+x$").matches(w) -> w.dropLast(1) + " איקס"
            w == "x" -> "איקס"
            else -> w
        }
        return "$prefix$body$suffix$trail".trim()
    }
}
