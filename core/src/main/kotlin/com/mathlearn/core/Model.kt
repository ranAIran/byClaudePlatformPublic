package com.mathlearn.core

import kotlinx.serialization.Serializable

/** 6th-grade curriculum topics. */
@Serializable
enum class Topic(val title: String, val emoji: String) {
    FRACTIONS("שברים", "½"),
    DECIMALS("שברים עשרוניים", "0.5"),
    PERCENT("אחוזים", "%"),
    RATIO("יחס ופרופורציה", "∶"),
    NEGATIVE_NUMBERS("מספרים שליליים", "−"),
    ORDER_OF_OPERATIONS("סדר פעולות חשבון", "( )"),
    DIVISIBILITY("התחלקות, מחלק וכפולה משותפים", "÷"),
    GEOMETRY("שטח והיקף", "▭"),
    EQUATIONS("משוואות פשוטות", "x"),
    OTHER("אחר", "?");

    companion object {
        /** Topics that have a built-in exercise generator. */
        val practiceTopics: List<Topic> = entries.filter { it != OTHER }

        fun fromName(name: String?): Topic =
            entries.firstOrNull { it.name.equals(name?.trim(), ignoreCase = true) } ?: OTHER
    }
}

/** Whether a set is used for guided practice (instant feedback) or as a test (graded at the end). */
@Serializable
enum class SetKind { EXERCISES, TEST }

@Serializable
enum class SetSource { GENERATED, IMAGE_OCR, IMAGE_AI, MANUAL }

@Serializable
data class Exercise(
    val id: String,
    val prompt: String,
    /** Expected answer. `null` means there is no answer key and the student self-checks. */
    val answer: String? = null,
    /** Optional multiple-choice options. Empty = free answer. */
    val choices: List<String> = emptyList(),
    val hint: String? = null,
    val explanation: String? = null,
    val topic: Topic = Topic.OTHER,
)

@Serializable
data class ExerciseSet(
    val id: String,
    val title: String,
    val kind: SetKind,
    val source: SetSource,
    val createdAt: Long,
    val exercises: List<Exercise>,
)

@Serializable
data class AnswerRecord(
    val exerciseId: String,
    val given: String,
    /** `null` when the exercise had no answer key and was not self-graded. */
    val correct: Boolean?,
)

@Serializable
data class SessionResult(
    val id: String,
    val setId: String,
    val setTitle: String,
    val kind: SetKind,
    val finishedAt: Long,
    val answers: List<AnswerRecord>,
) {
    val gradedCount: Int get() = answers.count { it.correct != null }
    val correctCount: Int get() = answers.count { it.correct == true }
    /** Score 0..100 over graded questions, or null if nothing could be graded. */
    val scorePercent: Int? get() = if (gradedCount == 0) null else (correctCount * 100) / gradedCount
}
