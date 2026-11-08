package com.mathlearn.core

import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ExpressionEvaluatorTest {
    private fun ev(s: String) = ExpressionEvaluator.evaluate(s).toFractionString()

    @Test fun basics() {
        assertEquals("14", ev("2 + 3 × 4"))
        assertEquals("20", ev("(2 + 3) × 4"))
        assertEquals("5/4", ev("3/4 + 1/2"))
        assertEquals("1/2", ev("1/3 + 1/6"))
        assertEquals("3", ev("12 : 4"))
        assertEquals("3", ev("12 ÷ 4"))
        assertEquals("-3", ev("−7 + 4"))
        assertEquals("28", ev("(-7) × (-4)"))
        assertEquals("12", ev("3x4"))
        assertEquals("14", ev("2(3+4)"))
        assertEquals("25", ev("5²"))
        assertEquals("20", ev("25% × 80"))
        assertEquals("11/4", ev("2 3/4"))
        assertEquals("3", ev("2 3/4 + 1/4"))
        assertEquals("7/2", ev("2,5 + 1"))
        assertEquals("2000", ev("1,000 × 2"))
        assertEquals("23/4", ev("5.75"))
        assertEquals("8/3", ev("2/3 ÷ 1/4"))
        assertEquals("1/6", ev("2/3 * 1/4"))
        assertEquals("1", ev("6 / 2 / 3"))
    }

    @Test fun invalid() {
        assertNull(ExpressionEvaluator.tryEvaluate("5 / 0"))
        assertNull(ExpressionEvaluator.tryEvaluate("2 +"))
        assertNull(ExpressionEvaluator.tryEvaluate("hello"))
    }
}

class AnswerCheckerTest {
    @Test fun numericEquivalence() {
        assertTrue(AnswerChecker.isCorrect("1/2", "0.5"))
        assertTrue(AnswerChecker.isCorrect("1/2", "2/4"))
        assertTrue(AnswerChecker.isCorrect("1/2", "50%"))
        assertTrue(AnswerChecker.isCorrect("5/4", "1 1/4"))
        assertTrue(AnswerChecker.isCorrect("7", "x = 7"))
        assertTrue(AnswerChecker.isCorrect("24", "24 cm²"))
        assertTrue(AnswerChecker.isCorrect("-3", "−3"))
        assertTrue(AnswerChecker.isCorrect("2.5", "2,5"))
        assertFalse(AnswerChecker.isCorrect("1/2", "0.6"))
        assertFalse(AnswerChecker.isCorrect("1/2", ""))
    }

    @Test fun textAndAlternatives() {
        assertTrue(AnswerChecker.isCorrect("yes", " Yes "))
        assertTrue(AnswerChecker.isCorrect("כן", "yes"))
        assertTrue(AnswerChecker.isCorrect("לא", "לא."))
        assertFalse(AnswerChecker.isCorrect("כן", "לא"))
        assertFalse(AnswerChecker.isCorrect("yes", "no"))
    }
}

class ExerciseParserTest {
    @Test fun numberedWorksheet() {
        val ocr = """
            Fractions worksheet
            1. 3/4 + 1/8 = ____
            2) 12 x 4 =
            3. What is the area of a square
            with side 5 cm?
            4. Which is bigger? a) 0.5 b) 0.45 c) 0.05
            Answers
            1. 7/8
        """.trimIndent()
        val set = ExerciseParser.parse(ocr)
        assertEquals(4, set.exercises.size)
        assertEquals("7/8", set.exercises[0].answer)
        assertEquals("3/4 + 1/8 = ?", set.exercises[0].prompt)
        assertEquals("48", set.exercises[1].answer)
        assertNull(set.exercises[2].answer)
        assertTrue(set.exercises[2].prompt.contains("side 5 cm"))
        assertEquals(listOf("0.5", "0.45", "0.05"), set.exercises[3].choices)
        assertEquals(Topic.FRACTIONS, set.exercises[0].topic)
    }

    @Test fun unnumberedLines() {
        val set = ExerciseParser.parse("Solve:\n2.5 + 1.25 =\n(3 + 4) × 2 =\nGood luck!")
        assertEquals(2, set.exercises.size)
        assertEquals("3.75", set.exercises[0].answer)
        assertEquals("14", set.exercises[1].answer)
    }

    @Test fun hebrewMarkers() {
        val set = ExerciseParser.parse("א. 15 - 20 =\nב. 7 × 8 =")
        assertEquals(listOf("-5", "56"), set.exercises.map { it.answer })
    }
}

class ExerciseGeneratorTest {
    @Test fun everyGeneratedAnswerIsSelfConsistent() {
        val gen = ExerciseGenerator(Random(42))
        for (topic in Topic.practiceTopics) repeat(200) {
            val e = gen.generate(topic)
            assertNotNull(e.answer, "$topic: ${e.prompt}")
            assertTrue(AnswerChecker.isCorrect(e.answer!!, e.answer!!), "$topic: ${e.prompt} -> ${e.answer}")
            // Arithmetic prompts must agree with the evaluator.
            val lhs = e.prompt.substringBefore("=").trim()
            if (e.prompt.endsWith("= ?") && ExpressionEvaluator.looksLikeArithmetic(lhs)) {
                assertTrue(AnswerChecker.isCorrect(e.answer!!, lhs), "$topic: ${e.prompt} -> ${e.answer}")
            }
        }
    }
}

class ClaudeExtractorParsingTest {
    @Test fun buildsRequestWithImageAndSchema() {
        val params = ClaudeExtractor(apiKey = "test").buildParams(listOf(byteArrayOf(1, 2, 3), byteArrayOf(4)), "image/png", "only Q1-3")
        val body = params._body().toString()
        assertTrue(body.contains("claude-opus-5-5"), body)
        assertTrue(body.contains("image/png"), body)
        assertTrue(body.contains("only Q1-3"), body)
        assertTrue(body.contains("these 2 pages"), body)
        assertTrue(body.contains("FRACTIONS"), body)
        assertTrue(params._additionalBodyProperties().containsKey("fallbacks"))
    }

    @Test fun parsesStructuredJson() {
        val ex = ClaudeExtractor(apiKey = "test")
        val set = ex.toExerciseSet(
            """{"title":"Quiz 3","kind":"TEST","exercises":[
              {"prompt":"1/2 + 1/4 = ?","answer":"3/4","choices":[],"hint":"common denominator","explanation":"2/4+1/4","topic":"FRACTIONS"},
              {"prompt":"Explain why","answer":"","choices":[],"hint":"","explanation":"","topic":"weird"}]}"""
        )
        assertEquals(SetKind.TEST, set.kind)
        assertEquals(2, set.exercises.size)
        assertEquals("3/4", set.exercises[0].answer)
        assertNull(set.exercises[1].answer)
        assertEquals(Topic.OTHER, set.exercises[1].topic)
    }
}

class BuiltInSheetsTest {
    @Test fun weekly4AnswerKeyIsConsistent() {
        val set = BuiltInSheets.weekly4
        assertEquals(set.exercises.size, set.exercises.map { it.id }.toSet().size, "ids must be unique")
        for (e in set.exercises) {
            if (e.choices.isNotEmpty()) assertTrue(e.answer in e.choices, "${e.id}: answer must be one of the choices")
        }
        val byId = set.exercises.associateBy { it.id.removePrefix("weekly4-") }
        // Arithmetic items: the key must match what the evaluator computes from the printed expression.
        for (id in listOf("4a", "4b", "4c", "4d")) {
            val e = byId.getValue(id)
            val expr = e.prompt.substringAfter(". ").substringBefore("=")
            assertTrue(AnswerChecker.isCorrect(e.answer!!, expr), "$id: ${e.prompt}")
        }
        assertTrue(AnswerChecker.isCorrect(byId.getValue("1").answer!!, "3,015"))
        assertEquals(ExpressionEvaluator.evaluate("3467 + 2815"), ExpressionEvaluator.evaluate("3267 + 3015"))
        assertEquals(ExpressionEvaluator.evaluate("18*10 - 4*4 - 6*3"), ExpressionEvaluator.evaluate(byId.getValue("10").answer!!))
    }
}

class BidiTextTest {
    @Test fun isolatesMathRunsInHebrew() {
        assertEquals("איזה סימן מתאים?\n⁦0.56 ☐ 0.098⁩", BidiText.isolateMath("איזה סימן מתאים?\n0.56 ☐ 0.098"))
        assertEquals("4ב. ⁦63 − 36 : 4 = ?⁩", BidiText.isolateMath("4ב. 63 − 36 : 4 = ?"))
        assertEquals("קנו 3 מחברות", BidiText.isolateMath("קנו 3 מחברות"))
        assertEquals("3/4 + 1/8 = ?", BidiText.isolateMath("3/4 + 1/8 = ?")) // no Hebrew: untouched
    }
}

class BuiltInSheetsExportTest {
    /** Writes the built-in sheets as JSON (build/builtins.json) so the web version can embed the same content. */
    @Test fun exportJson() {
        val json = kotlinx.serialization.json.Json { prettyPrint = false }
        val text = json.encodeToString(kotlinx.serialization.builtins.ListSerializer(ExerciseSet.serializer()), BuiltInSheets.all)
        java.io.File("build").mkdirs()
        java.io.File("build/builtins.json").writeText(text)
        assertTrue(text.contains("builtin-weekly-4"))
    }
}

class SpeechTextTest {
    private fun say(s: String) = SpeechText.plan(s).spoken

    @Test fun readsMathInHebrew() {
        assertEquals("3 רבעים ועוד שמינית שווה כמה", say("3/4 + 1/8 = ?"))
        assertEquals("פותחים סוגריים 63 פחות 36 סוגרים סוגריים חלקי 9 שווה כמה", say("(63 − 36) : 9 = ?"))
        assertEquals("מינוס 7 כפול מינוס 4 שווה כמה", say("(-7) · (-4) = ?"))
        assertEquals("2 ו3 רבעים", say("2 3/4"))
        assertEquals("3467 ועוד 2815", say("3,467 + 2,815"))
        assertEquals("0.56 משבצת 0.098", say("0.56 ☐ 0.098"))
        assertEquals("כמה הם 25 אחוז מתוך 80?", say("כמה הם 25% מתוך 80?"))
        assertEquals("3 איקס ועוד 2 שווה 11. מהו איקס?", say("3x + 2 = 11. מהו x?"))
        assertEquals("אורך 5 סנטימטר. השטח במטר רבוע", say("אורך 5 ס״מ. השטח במ״ר"))
        assertEquals("3 מחברות ו2 עטים", say("3 מחברות ו-2 עטים"))
        assertEquals("שאלה. 7 ועוד 1", say("שאלה\n7 + 1"))
        assertEquals("נכון!", say("🎉 נכון!").trim())
    }

    @Test fun mapsSpokenOffsetsBackToScreenWords() {
        val text = "3/4 + 1/8 = ?"
        val plan = SpeechText.plan(text)
        assertEquals(5, plan.tokens.size)
        val iOn = plan.spoken.indexOf("ועוד")
        val t = plan.tokens[plan.tokenAtSpoken(iOn)]
        assertEquals("+", text.substring(t.displayStart, t.displayEnd))
        val t2 = plan.tokens[plan.tokenAtSpoken(plan.spoken.indexOf("שמינית"))]
        assertEquals("1/8", text.substring(t2.displayStart, t2.displayEnd))
        assertEquals(2, plan.tokenAtDisplay(text.indexOf("1/8") + 1))
        assertEquals(-1, plan.tokenAtDisplay(3)) // the space between words
    }
}

class BidiMappingTest {
    @Test fun mapsOriginalIndexesIntoIsolatedText() {
        val text = "סימן: 0.56 ☐ 0.098"
        val (shown, map) = BidiText.isolateMathMapped(text)
        val s = text.indexOf("0.098")
        assertEquals("0.098", shown.substring(map(s), map(s) + 5))
        assertEquals("סימן", shown.substring(map(0), map(4)))
    }
}

class HintLadderTest {
    @Test fun buildsLadderFromHintsAndFirstStep() {
        val e = Exercise("1", "3/4 + 1/8 = ?", "7/8", hint = "מצאו מכנה משותף.", hints = listOf("8 מתחלק ב-4."),
            explanation = "מכנה משותף: 8. 6/8 + 1/8 = 7/8")
        assertEquals(listOf("מצאו מכנה משותף.", "8 מתחלק ב-4.", "צעד ראשון: מכנה משותף: 8"), HintLadder.steps(e))
    }

    @Test fun singleStepExplanationIsNotOfferedAsAHint() {
        assertNull(HintLadder.firstStep("x = 12 − 5 = 7"))
        assertEquals("3,467 גדול מ-3,267 ב-200", HintLadder.firstStep("3,467 גדול מ-3,267 ב-200, לכן המספר החסר קטן ב-200."))
    }

    @Test fun everyBuiltInAndGeneratedQuestionHasAtLeastOneHint() {
        BuiltInSheets.weekly4.exercises.forEach { assertTrue(HintLadder.steps(it).isNotEmpty(), it.id) }
        val gen = ExerciseGenerator(kotlin.random.Random(1))
        Topic.practiceTopics.forEach { t -> repeat(50) { assertTrue(HintLadder.steps(gen.generate(t)).isNotEmpty()) } }
    }

    @Test fun formatsDurations() {
        assertEquals("0:07", formatDuration(7)); assertEquals("3:05", formatDuration(185)); assertEquals("1:00:00", formatDuration(3600))
    }

    @Test fun extractorSplitsHintLadder() {
        val set = ClaudeExtractor(apiKey = "test").toExerciseSet(
            """{"title":"t","kind":"EXERCISES","exercises":[{"prompt":"p","answer":"1","choices":[],"hints":["a","b","c"],"explanation":"","topic":"OTHER"}]}""")
        assertEquals("a", set.exercises[0].hint); assertEquals(listOf("b", "c"), set.exercises[0].hints)
    }
}

class BuiltInHintsTest {
    @Test fun weeklySheetHasLadders() {
        val q1 = BuiltInSheets.weekly4.exercises.first()
        assertTrue(q1.hints.isNotEmpty())
        assertTrue(HintLadder.steps(q1).size >= 3, HintLadder.steps(q1).toString())
    }
}
