package com.mathlearn.core

import java.util.UUID

/**
 * Turns raw OCR text from a photographed worksheet into exercises.
 *
 * It recognises numbered items ("1.", "2)", "(3)", "א.", "Q4:"), joins continuation lines,
 * picks up multiple-choice options ("a) 12  b) 15") and, for pure arithmetic items such as
 * "3/4 + 1/8 = ___", computes the answer key automatically.
 */
object ExerciseParser {

    private val itemMarker = Regex(
        "^\\s*(?:(?:q|ex|exercise|question|שאלה|תרגיל)\\s*)?" +
            "(?:\\(?(\\d{1,3})[.):]|\\(?([א-ת])[.)]|\\((\\d{1,3})\\))\\s+(.*)$",
        RegexOption.IGNORE_CASE,
    )
    private val choiceMarker = Regex("(?:^|\\s)\\(?([a-dA-Dא-ד])[).]\\s*")
    private val blanks = Regex("(_{2,}|\\.{3,}|…+|\\?|□|☐)")
    private val answerKeyLine = Regex("^\\s*(answers?|answer key|תשובות)\\b", RegexOption.IGNORE_CASE)

    fun parse(ocrText: String, title: String = "דף עבודה"): ExerciseSet {
        val items = splitItems(ocrText)
        val exercises = items.mapNotNull { toExercise(it) }
        return ExerciseSet(
            id = UUID.randomUUID().toString(),
            title = title,
            kind = SetKind.EXERCISES,
            source = SetSource.IMAGE_OCR,
            createdAt = System.currentTimeMillis(),
            exercises = exercises,
        )
    }

    /** Splits text into item strings. If no numbering is found, every arithmetic line is an item. */
    internal fun splitItems(text: String): List<String> {
        val lines = text.lines().map { it.trim() }.filter { it.isNotEmpty() }
        val cut = lines.indexOfFirst { answerKeyLine.containsMatchIn(it) }
        val body = if (cut > 0) lines.subList(0, cut) else lines

        val items = mutableListOf<StringBuilder>()
        var sawMarker = false
        for (line in body) {
            val m = itemMarker.matchEntire(line)
            if (m != null) {
                sawMarker = true
                items += StringBuilder(m.groupValues[4].trim())
            } else if (sawMarker && items.isNotEmpty()) {
                items.last().append('\n').append(line)
            }
        }
        if (sawMarker) return items.map { it.toString().trim() }.filter { it.isNotEmpty() }

        // No numbering: treat each line holding an arithmetic expression as an exercise.
        return body.filter { line ->
            val expr = line.substringBefore('=').trim()
            ExpressionEvaluator.looksLikeArithmetic(expr)
        }
    }

    internal fun toExercise(item: String): Exercise? {
        val (stem, choices) = extractChoices(item)
        val prompt = stem.trim().ifEmpty { return null }
        val answer = computeAnswer(prompt)
        var shown = prompt.replace(blanks, "?").replace(Regex("\\?(\\s*\\?)+"), "?")
        if (answer != null && !shown.contains('=')) shown = "$shown = ?"
        else if (answer != null && shown.trimEnd().endsWith("=")) shown = shown.trimEnd() + " ?"
        return Exercise(
            id = UUID.randomUUID().toString(),
            prompt = shown,
            answer = answer,
            choices = choices,
            topic = guessTopic(prompt),
        )
    }

    /** Splits "What is 2+3?  a) 4  b) 5  c) 6" into the stem and its options. */
    internal fun extractChoices(item: String): Pair<String, List<String>> {
        val matches = choiceMarker.findAll(item).toList()
        // Need at least 2 sequential option letters to treat them as multiple choice.
        if (matches.size < 2) return item to emptyList()
        val letters = matches.map { it.groupValues[1].lowercase() }
        val sequential = letters.zipWithNext().all { (a, b) -> b[0] - a[0] == 1 }
        if (!sequential) return item to emptyList()
        val stem = item.substring(0, matches.first().range.first)
        val options = matches.mapIndexed { i, m ->
            val end = if (i + 1 < matches.size) matches[i + 1].range.first else item.length
            item.substring(m.range.last + 1, end).trim()
        }.filter { it.isNotEmpty() }
        return stem to options
    }

    /** Computes the answer for items like "3/4 + 1/8 =" or "12 × 4 = ___". */
    internal fun computeAnswer(prompt: String): String? {
        val oneLine = prompt.replace('\n', ' ')
        val lhs = oneLine.substringBefore('=').replace(blanks, "").trim()
        if (!ExpressionEvaluator.looksLikeArithmetic(lhs)) return null
        // If there is something other than a blank after "=", the item isn't "compute the left side".
        if (oneLine.contains('=')) {
            val rhs = oneLine.substringAfter('=').replace(blanks, "").trim()
            if (rhs.isNotEmpty()) return null
        }
        val value = ExpressionEvaluator.tryEvaluate(lhs) ?: return null
        val preferDecimal = lhs.contains('.') || lhs.contains(',')
        return value.display(preferDecimal)
    }

    fun guessTopic(text: String): Topic {
        val t = text.lowercase()
        return when {
            t.contains('%') || "percent" in t || "אחוז" in t -> Topic.PERCENT
            "ratio" in t || "יחס" in t || "proportion" in t -> Topic.RATIO
            "area" in t || "perimeter" in t || "שטח" in t || "היקף" in t -> Topic.GEOMETRY
            "gcd" in t || "lcm" in t || "divisible" in t || "מחלק" in t || "כפולה" in t -> Topic.DIVISIBILITY
            Regex("[a-z]\\s*[+\\-*/=]|=\\s*[a-z]|\\d[a-z]\\b").containsMatchIn(t) && t.contains('=') -> Topic.EQUATIONS
            Regex("(^|[^\\d])-\\d|\\(-").containsMatchIn(t) -> Topic.NEGATIVE_NUMBERS
            Regex("\\d+\\s*/\\s*\\d+").containsMatchIn(t) -> Topic.FRACTIONS
            Regex("\\d[.,]\\d").containsMatchIn(t) -> Topic.DECIMALS
            t.contains('(') && Regex("[+\\-]").containsMatchIn(t) && Regex("[*×x÷:/]").containsMatchIn(t) -> Topic.ORDER_OF_OPERATIONS
            else -> Topic.OTHER
        }
    }
}
