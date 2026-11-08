package com.mathlearn.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mathlearn.app.AppViewModel
import com.mathlearn.core.ExerciseSet
import com.mathlearn.core.SessionResult
import com.mathlearn.core.formatDuration

@Composable
fun ResultScreen(vm: AppViewModel, result: SessionResult, set: ExerciseSet) {
    val score = result.scorePercent
    val (emoji, message) = when {
        score == null -> "📋" to "סיימת! בדקו את התשובות עם המורה."
        score >= 90 -> "🏆" to "עבודה מדהימה!"
        score >= 70 -> "⭐" to "כל הכבוד – תמשיכו כך!"
        score >= 50 -> "👍" to "מאמץ יפה – עוד קצת תרגול ואתם שם."
        else -> "💪" to "ממשיכים להתאמן – מכל טעות לומדים משהו."
    }
    val byId = set.exercises.associateBy { it.id }
    val mistakes = result.answers.count { it.correct == false }

    ScreenScaffold(title = "תוצאות", onBack = { vm.goHome() }) { pad ->
        LazyColumn(Modifier.padding(pad).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                Column(Modifier.fillMaxWidth().padding(vertical = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(emoji, fontSize = 56.sp)
                    Text(score?.let { "$it%" } ?: "–", fontSize = 44.sp, fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary)
                    Text("${result.correctCount} נכונות מתוך ${result.gradedCount}" +
                        if (result.gradedCount < result.answers.size) " · ${result.answers.size - result.gradedCount} לא נבדקו" else "")
                    Text(message, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 4.dp))
                    if (result.totalSeconds > 0) {
                        val avg = result.answers.map { it.seconds }.average().toInt()
                        Text("⏱ זמן כולל ${formatDuration(result.totalSeconds)}  ·  ממוצע לשאלה ${formatDuration(avg)}",
                            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.outline,
                            modifier = Modifier.padding(top = 6.dp))
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (mistakes > 0) {
                        Button(onClick = { vm.practiceMistakes(result, set) }, modifier = Modifier.weight(1f)) {
                            Text("לתרגל את הטעויות ($mistakes)")
                        }
                    }
                    OutlinedButton(onClick = { vm.goHome() }, modifier = Modifier.weight(1f)) { Text("למסך הראשי") }
                }
                Spacer(Modifier.height(8.dp))
                Text("סקירה", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }
            val slowest = result.answers.maxByOrNull { it.seconds }?.takeIf { it.seconds > 0 }?.exerciseId
            items(result.answers) { rec ->
                val ex = byId[rec.exerciseId] ?: return@items
                val color = when (rec.correct) {
                    true -> Correct.copy(alpha = 0.12f)
                    false -> Wrong.copy(alpha = 0.10f)
                    null -> MaterialTheme.colorScheme.surfaceVariant
                }
                Card(colors = CardDefaults.cardColors(containerColor = color), modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text((when (rec.correct) { true -> "✅ "; false -> "❌ "; null -> "❔ " }) + mathText(ex.prompt), fontWeight = FontWeight.SemiBold,
                            style = LocalTextStyle.current.copy(textDirection = mathDirection(ex.prompt)))
                        Text("התשובה שלך: ${rec.given.ifBlank { "(אין)" }}")
                        if (result.totalSeconds > 0) {
                            Text("⏱ ${formatDuration(rec.seconds)} בשאלה הזו" + if (rec.exerciseId == slowest) "  ·  השאלה שלקחה הכי הרבה זמן" else "",
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = if (rec.exerciseId == slowest) FontWeight.Bold else FontWeight.Normal)
                        }
                        if (rec.correct != true && ex.answer != null) Text("התשובה הנכונה: ${ex.answer}", fontWeight = FontWeight.Bold)
                        ex.explanation?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                    }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}
