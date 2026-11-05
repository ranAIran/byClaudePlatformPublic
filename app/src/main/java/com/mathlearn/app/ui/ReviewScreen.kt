package com.mathlearn.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import com.mathlearn.app.AppViewModel
import com.mathlearn.core.Exercise
import com.mathlearn.core.ExerciseParser
import com.mathlearn.core.ExerciseSet
import com.mathlearn.core.SetKind
import com.mathlearn.core.Topic
import java.util.UUID

/** Lets the student/parent fix what was extracted before practising: edit, add, delete, set answers. */
@Composable
fun ReviewScreen(vm: AppViewModel, draft: ExerciseSet, rawText: String?) {
    var title by remember(draft.id) { mutableStateOf(draft.title) }
    var kind by remember(draft.id) { mutableStateOf(draft.kind) }
    val items = remember(draft.id) { draft.exercises.toMutableStateList() }
    var showRaw by remember { mutableStateOf(false) }

    fun build() = draft.copy(
        title = title.ifBlank { "דף העבודה שלי" },
        kind = kind,
        exercises = items.filter { it.prompt.isNotBlank() },
    )

    ScreenScaffold(title = "בדיקת התרגילים", onBack = { vm.back() }) { pad ->
        LazyColumn(
            Modifier.padding(pad).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                OutlinedTextField(value = title, onValueChange = { title = it }, label = { Text("שם הדף") },
                    modifier = Modifier.fillMaxWidth(), singleLine = true)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                    FilterChip(selected = kind == SetKind.EXERCISES, onClick = { kind = SetKind.EXERCISES },
                        label = { Text("תרגול – משוב תוך כדי") })
                    FilterChip(selected = kind == SetKind.TEST, onClick = { kind = SetKind.TEST },
                        label = { Text("מבחן – ציון בסוף") })
                }
                Text(
                    if (items.isEmpty()) "לא נמצאו תרגילים באופן אוטומטי. אפשר להוסיף אותם למטה."
                    else "נמצאו ${items.size} תרגילים. תקנו מה שנקרא לא נכון. " +
                        "אם לא יודעים את התשובה, השאירו ריק – את אלה תבדקו בעצמכם.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline,
                    modifier = Modifier.padding(top = 4.dp),
                )
                if (!rawText.isNullOrBlank()) {
                    TextButton(onClick = { showRaw = !showRaw }) { Text(if (showRaw) "הסתרת הטקסט שנסרק" else "הצגת הטקסט שנסרק") }
                    if (showRaw) Card { Text(rawText, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodySmall) }
                }
            }
            itemsIndexed(items, key = { _, e -> e.id }) { i, ex ->
                ExerciseEditor(i + 1, ex, onChange = { items[i] = it }, onDelete = { items.removeAt(i) })
            }
            item {
                OutlinedButton(
                    onClick = { items.add(Exercise(id = UUID.randomUUID().toString(), prompt = "")) },
                    modifier = Modifier.fillMaxWidth(),
                ) { Icon(Icons.Filled.Add, null); Text("הוספת תרגיל") }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { vm.saveAndClose(build()) }, modifier = Modifier.weight(1f)) { Text("שמירה") }
                    Button(
                        onClick = { vm.saveAndStart(build()) },
                        enabled = items.any { it.prompt.isNotBlank() },
                        modifier = Modifier.weight(1f),
                    ) { Text("שמירה והתחלה") }
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

@Composable
private fun ExerciseEditor(number: Int, ex: Exercise, onChange: (Exercise) -> Unit, onDelete: () -> Unit) {
    // Kept as raw text so the user can type the ";" separator.
    var choicesText by remember(ex.id) { mutableStateOf(ex.choices.joinToString("; ")) }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("שאלה $number", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Text(ex.topic.title, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
                IconButton(onClick = onDelete) { Icon(Icons.Filled.Delete, "מחיקת שאלה") }
            }
            OutlinedTextField(
                value = ex.prompt,
                onValueChange = {
                    onChange(ex.copy(prompt = it, topic = if (ex.topic == Topic.OTHER) ExerciseParser.guessTopic(it) else ex.topic))
                },
                label = { Text("שאלה") }, modifier = Modifier.fillMaxWidth(),
                textStyle = LocalTextStyle.current.copy(textDirection = mathDirection(ex.prompt)),
            )
            OutlinedTextField(
                value = ex.answer.orEmpty(),
                onValueChange = { onChange(ex.copy(answer = it.ifBlank { null })) },
                label = { Text("תשובה (לא חובה)") }, singleLine = true,
                textStyle = LocalTextStyle.current.copy(textDirection = TextDirection.Ltr), modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = choicesText,
                onValueChange = { v ->
                    choicesText = v
                    onChange(ex.copy(choices = v.split(';').map { it.trim() }.filter { it.isNotEmpty() }))
                },
                label = { Text("אפשרויות בחירה, מופרדות ב-; (לא חובה)") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            )
            if (!ex.explanation.isNullOrBlank()) {
                Text("פתרון: ${ex.explanation}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline)
            }
        }
    }
}
