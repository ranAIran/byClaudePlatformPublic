package com.mathlearn.core

import com.anthropic.client.AnthropicClient
import com.anthropic.client.okhttp.AnthropicOkHttpClient
import com.anthropic.core.JsonValue
import com.anthropic.models.messages.Base64ImageSource
import com.anthropic.models.messages.ContentBlockParam
import com.anthropic.models.messages.JsonOutputFormat
import com.anthropic.models.messages.MessageCreateParams
import com.anthropic.models.messages.OutputConfig
import com.anthropic.models.messages.StopReason
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.util.Base64
import java.util.UUID

/**
 * Reads a photographed worksheet / test with Claude vision and returns structured exercises,
 * including an answer key (solved by Claude when the page doesn't print one). Handles
 * handwriting, Hebrew/English text, drawn fractions and word problems far better than plain OCR.
 */
class ClaudeExtractor(
    apiKey: String,
    private val model: String = DEFAULT_MODEL,
    private val client: AnthropicClient = AnthropicOkHttpClient.builder().apiKey(apiKey).build(),
) {
    companion object {
        const val DEFAULT_MODEL = "claude-opus-5-5"

        private val SYSTEM_PROMPT = """
            You help a 6th-grade student practice math. You receive a photo of a worksheet, homework
            page or test. Extract every exercise on the page, in order, as a separate item.

            For each exercise:
            - prompt: the full question text as the student should see it, in the page's language.
              Keep numbers, fractions (write as a/b, mixed numbers as "2 3/4"), units and any data from
              tables or drawings that is needed to solve it. If a question has sub-parts (a, b, c), make
              each sub-part its own exercise and repeat the shared context in each prompt.
            - answer: the correct final answer, short (a number, fraction, "yes"/"no", or a word).
              If the page shows an answer key use it; otherwise solve the exercise yourself. Use an empty
              string only if the exercise has no single checkable answer (e.g. "draw", "explain").
            - choices: the multiple-choice options if the page lists them, otherwise an empty list.
              When there are choices, the answer must be the exact text of the correct choice.
            - hints: 2–3 graduated hints, from a gentle nudge to a concrete first step, none of which
              gives the final answer away. A child who struggles with reading opens them one by one.
            - explanation: a brief step-by-step solution suitable for an 11–12 year old.
            - topic: the best-matching topic.

            The student is Israeli and the app's language is Hebrew: write the hints, the explanation
            and the title in Hebrew, and keep each prompt in the language printed on the page (usually
            Hebrew). Use Israeli school notation where natural (":" for division, "·" or "×" for
            multiplication). For yes/no answers use "כן" or "לא".

            A question that must be answered on paper (drawing, measuring on a grid that is not fully
            described in text) gets an empty answer and an explanation of how to check it. Give each
            sub-question of a "fill in the sign" or "which is correct" item as multiple choice.

            Set kind to "TEST" if the page is clearly a test/quiz/exam (מבחן, בוחן), otherwise "EXERCISES".
            Give the set a short title describing the page. Ignore page numbers, names and decorations.
        """.trimIndent()

        private val json = Json { ignoreUnknownKeys = true; isLenient = true }

        private fun obj(vararg pairs: Pair<String, Any>): Map<String, Any> = linkedMapOf(*pairs)

        /** JSON schema for structured outputs, so the response is always valid JSON. */
        private val SCHEMA: Map<String, Any> = obj(
            "type" to "object",
            "additionalProperties" to false,
            "required" to listOf("title", "kind", "exercises"),
            "properties" to obj(
                "title" to obj("type" to "string"),
                "kind" to obj("type" to "string", "enum" to listOf("EXERCISES", "TEST")),
                "exercises" to obj(
                    "type" to "array",
                    "items" to obj(
                        "type" to "object",
                        "additionalProperties" to false,
                        "required" to listOf("prompt", "answer", "choices", "hints", "explanation", "topic"),
                        "properties" to obj(
                            "prompt" to obj("type" to "string"),
                            "answer" to obj("type" to "string"),
                            "choices" to obj("type" to "array", "items" to obj("type" to "string")),
                            "hints" to obj("type" to "array", "items" to obj("type" to "string")),
                            "explanation" to obj("type" to "string"),
                            "topic" to obj("type" to "string", "enum" to Topic.entries.map { it.name }),
                        ),
                    ),
                ),
            ),
        )
    }

    class ExtractionException(message: String, cause: Throwable? = null) : Exception(message, cause)

    @Serializable
    internal data class RawExercise(
        val prompt: String = "",
        val answer: String = "",
        val choices: List<String> = emptyList(),
        val hint: String = "",
        val hints: List<String> = emptyList(),
        val explanation: String = "",
        val topic: String = "OTHER",
    )

    @Serializable
    internal data class RawSet(
        val title: String = "דף עבודה",
        val kind: String = "EXERCISES",
        val exercises: List<RawExercise> = emptyList(),
    )

    /**
     * @param imageBytes JPEG/PNG/WebP bytes. Downscale to ~1600px on the long edge before calling.
     * @param mediaType  e.g. "image/jpeg".
     * @param extraInstructions optional note from the student/parent, e.g. "only page 2, questions 1–5".
     */
    fun extract(imageBytes: ByteArray, mediaType: String = "image/jpeg", extraInstructions: String = ""): ExerciseSet =
        extract(listOf(imageBytes), mediaType, extraInstructions)

    /** Several pages (e.g. a multi-page PDF rendered to images) are read in one request, in order. */
    fun extract(pages: List<ByteArray>, mediaType: String, extraInstructions: String): ExerciseSet {
        val params = buildParams(pages, mediaType, extraInstructions)

        val response = try {
            client.messages().create(params)
        } catch (e: Exception) {
            throw ExtractionException("לא הצלחנו להתחבר ל-Claude: ${e.message}", e)
        }

        val stop = response.stopReason().orElse(null)
        if (stop == StopReason.REFUSAL) throw ExtractionException("Claude לא הסכים לקרוא את התמונה הזו.")
        if (stop == StopReason.MAX_TOKENS) throw ExtractionException("בדף יש יותר מדי תרגילים – נסו לצלם חצי דף.")

        val text = response.content().mapNotNull { it.text().orElse(null)?.text() }.joinToString("")
        if (text.isBlank()) throw ExtractionException("התקבלה תשובה ריקה מ-Claude.")
        return toExerciseSet(text)
    }

    internal fun buildParams(pages: List<ByteArray>, mediaType: String, extraInstructions: String): MessageCreateParams {
        require(pages.isNotEmpty()) { "No pages to read" }
        val images = pages.map { bytes ->
            ContentBlockParam.ofImage(
                Base64ImageSource.builder()
                    .data(Base64.getEncoder().encodeToString(bytes))
                    .mediaType(Base64ImageSource.MediaType.of(mediaType))
                    .build(),
            )
        }

        val userText = buildString {
            append(if (pages.size == 1) "Extract the exercises from this page." else "Extract the exercises from these ${pages.size} pages, in order.")
            if (extraInstructions.isNotBlank()) append("\nNote from the student: ").append(extraInstructions.trim())
        }

        return MessageCreateParams.builder()
            .model(model)
            .maxTokens(16000L)
            .system(SYSTEM_PROMPT)
            .addUserMessageOfContentBlockParams(
                images + ContentBlockParam.ofText(userText),
            )
            .outputConfig(
                OutputConfig.builder()
                    .effort(OutputConfig.Effort.MEDIUM)
                    .format(
                        JsonOutputFormat.builder()
                            .schema(
                                JsonOutputFormat.Schema.builder()
                                    .putAllAdditionalProperties(SCHEMA.mapValues { JsonValue.from(it.value) })
                                    .build(),
                            )
                            .build(),
                    )
                    .build(),
            )
            // If a safety classifier declines, let the API retry on a suitable fallback model.
            .putAdditionalHeader("anthropic-beta", "server-side-fallback-2026-07-01")
            .putAdditionalBodyProperty("fallbacks", JsonValue.from("default"))
            .build()
    }

    internal fun toExerciseSet(jsonText: String): ExerciseSet {
        val raw = try {
            json.decodeFromString(RawSet.serializer(), jsonText.trim().removePrefix("```json").removeSuffix("```"))
        } catch (e: Exception) {
            throw ExtractionException("לא הצלחנו להבין את התשובה של Claude.", e)
        }
        return ExerciseSet(
            id = UUID.randomUUID().toString(),
            title = raw.title.ifBlank { "דף עבודה" },
            kind = if (raw.kind.equals("TEST", true)) SetKind.TEST else SetKind.EXERCISES,
            source = SetSource.IMAGE_AI,
            createdAt = System.currentTimeMillis(),
            exercises = raw.exercises.filter { it.prompt.isNotBlank() }.map {
                Exercise(
                    id = UUID.randomUUID().toString(),
                    prompt = it.prompt.trim(),
                    answer = it.answer.trim().ifEmpty { null },
                    choices = it.choices.map(String::trim).filter(String::isNotEmpty),
                    hint = (listOf(it.hint) + it.hints).map(String::trim).firstOrNull { h -> h.isNotEmpty() },
                    hints = (listOf(it.hint) + it.hints).map(String::trim).filter(String::isNotEmpty).drop(1),
                    explanation = it.explanation.trim().ifEmpty { null },
                    topic = Topic.fromName(it.topic),
                )
            },
        )
    }
}
