package com.mathlearn.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mathlearn.app.AppViewModel
import com.mathlearn.app.SessionState
import com.mathlearn.core.Exercise
import com.mathlearn.core.SetKind
import kotlinx.coroutines.delay

@Composable
fun SessionScreen(vm: AppViewModel, state: SessionState) {
    val isTest = state.set.kind == SetKind.TEST
    val ex = state.current
    var confirmSubmit by remember { mutableStateOf(false) }
    var confirmQuit by remember { mutableStateOf(false) }

    // Elapsed-time clock for tests.
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    if (isTest) LaunchedEffect(state) { while (true) { delay(1000); now = System.currentTimeMillis() } }
    val elapsed = (now - state.startedAt) / 1000

    ScreenScaffold(
        title = state.set.title,
        onBack = { confirmQuit = true },
        actions = { if (isTest) Text("⏱ %d:%02d".format(elapsed / 60, elapsed % 60), modifier = Modifier.padding(end = 16.dp)) },
    ) { pad ->
        Column(
            Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            val total = state.set.exercises.size
            Text("שאלה ${state.index + 1} מתוך $total" + if (isTest) "  ·  מבחן" else "  ·  תרגול",
                style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.outline)
            LinearProgressIndicator(progress = { (state.index + 1f) / total }, modifier = Modifier.fillMaxWidth())

            Card(Modifier.fillMaxWidth()) {
                Text(ex.prompt, fontSize = 22.sp, lineHeight = 30.sp, fontWeight = FontWeight.Medium,
                    style = LocalTextStyle.current.copy(textDirection = mathDirection(ex.prompt)),
                    modifier = Modifier.fillMaxWidth().padding(20.dp))
            }

            if (isTest) TestQuestion(vm, state, ex) else PracticeQuestion(vm, state, ex)

            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { state.index-- }, enabled = state.index > 0, modifier = Modifier.weight(1f)) {
                    Text("→ הקודמת")
                }
                if (!state.isLast) {
                    Button(onClick = { state.index++ }, modifier = Modifier.weight(1f)) { Text("הבאה ←") }
                } else {
                    Button(
                        onClick = { if (isTest) confirmSubmit = true else vm.finish(state) },
                        modifier = Modifier.weight(1f),
                    ) { Text(if (isTest) "הגשת המבחן" else "סיום") }
                }
            }
        }
    }

    if (confirmSubmit) {
        val unanswered = state.set.exercises.count { state.answers[it.id].isNullOrBlank() }
        AlertDialog(
            onDismissRequest = { confirmSubmit = false },
            title = { Text("להגיש את המבחן?") },
            text = { Text(if (unanswered > 0) "נשארו עוד $unanswered שאלות בלי תשובה." else "ענית על כל השאלות. בהצלחה!") },
            confirmButton = { Button(onClick = { confirmSubmit = false; vm.finish(state) }) { Text("הגשה") } },
            dismissButton = { TextButton(onClick = { confirmSubmit = false }) { Text("להמשיך לעבוד") } },
        )
    }
    if (confirmQuit) {
        AlertDialog(
            onDismissRequest = { confirmQuit = false },
            title = { Text("לעצור עכשיו?") },
            text = { Text("ההתקדמות באימון הזה לא תישמר.") },
            confirmButton = { TextButton(onClick = { confirmQuit = false; vm.back() }) { Text("עצירה") } },
            dismissButton = { Button(onClick = { confirmQuit = false }) { Text("המשך") } },
        )
    }
}

/** Free-text answer box (with handy symbol buttons) or multiple-choice options. */
@Composable
private fun AnswerInput(state: SessionState, ex: Exercise, enabled: Boolean, onDone: () -> Unit) {
    if (ex.choices.isNotEmpty()) {
        Column {
            ex.choices.forEach { choice ->
                val selected = state.answers[ex.id] == choice
                Row(
                    Modifier.fillMaxWidth()
                        .selectable(selected = selected, enabled = enabled, onClick = { state.answers[ex.id] = choice })
                        .padding(vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(selected = selected, onClick = { state.answers[ex.id] = choice }, enabled = enabled)
                    Text(choice, fontSize = 18.sp, style = LocalTextStyle.current.copy(textDirection = mathDirection(choice)))
                }
            }
        }
        return
    }
    var field by remember(ex.id) {
        val v = state.answers[ex.id].orEmpty()
        mutableStateOf(TextFieldValue(v, TextRange(v.length)))
    }
    OutlinedTextField(
        value = field,
        onValueChange = { field = it; state.answers[ex.id] = it.text },
        label = { Text("התשובה שלך") },
        singleLine = true,
        enabled = enabled,
        textStyle = MaterialTheme.typography.headlineSmall.copy(textDirection = TextDirection.Ltr),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { onDone() }),
        modifier = Modifier.fillMaxWidth(),
    )
    if (enabled) SymbolRow { sym ->
        val t = field.text
        val sel = field.selection
        val newText = t.substring(0, sel.start) + sym + t.substring(sel.end)
        field = TextFieldValue(newText, TextRange(sel.start + sym.length))
        state.answers[ex.id] = newText
    }
    Text("אפשר לכתוב שבר כמו 3/4, מספר מעורב כמו 2 1/2, או עשרוני כמו 0.75.",
        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline)
}

@Composable
private fun TestQuestion(vm: AppViewModel, state: SessionState, ex: Exercise) {
    AnswerInput(state, ex, enabled = true, onDone = { if (!state.isLast) state.index++ })
    if (ex.answer == null) {
        Text("לשאלה הזו אין מפתח תשובות – המורה יבדוק אותה.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline)
    }
}

@Composable
private fun PracticeQuestion(vm: AppViewModel, state: SessionState, ex: Exercise) {
    val solved = state.lastCheck[ex.id] == true
    val wrongs = state.wrongAttempts[ex.id] ?: 0
    val showSolution = state.solutionShown[ex.id] == true

    AnswerInput(state, ex, enabled = !solved && !showSolution, onDone = { if (ex.answer != null) vm.check(state) })

    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (!ex.hint.isNullOrBlank() && !solved) {
            OutlinedButton(onClick = { state.hintShown[ex.id] = true }) { Text("💡 רמז") }
        }
        if (ex.answer != null) {
            Button(onClick = { vm.check(state) }, enabled = !solved && !showSolution && !state.answers[ex.id].isNullOrBlank()) {
                Text("בדיקה ✓")
            }
            if (!solved && (wrongs >= 2 || showSolution)) {
                OutlinedButton(onClick = { state.solutionShown[ex.id] = true; if (ex.id !in state.firstTry) state.firstTry[ex.id] = false }) {
                    Text("הצגת הפתרון")
                }
            }
        } else {
            Button(onClick = { state.solutionShown[ex.id] = true }) { Text("סיימתי – אבדוק לבד") }
        }
    }

    if (state.hintShown[ex.id] == true && !ex.hint.isNullOrBlank()) {
        FeedbackCard(MaterialTheme.colorScheme.secondaryContainer, "💡 ${ex.hint}")
    }

    when (state.lastCheck[ex.id]) {
        true -> FeedbackCard(Correct.copy(alpha = 0.15f),
            listOf("🎉 נכון!", "⭐ כל הכבוד!", "✅ בדיוק!", "👏 מצוין!")[ex.id.hashCode().mod(4)] +
                (ex.explanation?.let { "\n\n$it" } ?: ""))
        false -> if (!showSolution) FeedbackCard(Wrong.copy(alpha = 0.12f),
            if (wrongs >= 2) "עדיין לא. אפשר לנסות שוב או להסתכל בפתרון."
            else "לא בדיוק – נסו שוב! אתם יכולים 💪")
        null -> {}
    }

    if (showSolution && !solved) {
        val text = buildString {
            if (ex.answer != null) append("התשובה: ${ex.answer}")
            ex.explanation?.let { if (isNotEmpty()) append("\n\n"); append(it) }
            if (isEmpty()) append("אין מפתח תשובות לשאלה הזו. השוו עם המורה או עם דף התשובות.")
        }
        FeedbackCard(MaterialTheme.colorScheme.tertiaryContainer, text)
        if (ex.answer == null) {
            Text("איך הלך?", fontWeight = FontWeight.SemiBold)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { state.selfGrade[ex.id] = true },
                    colors = ButtonDefaults.buttonColors(containerColor = if (state.selfGrade[ex.id] == true) Correct else MaterialTheme.colorScheme.primary),
                ) { Text("צדקתי") }
                OutlinedButton(onClick = { state.selfGrade[ex.id] = false }) {
                    Text(if (state.selfGrade[ex.id] == false) "✓ צריך עוד תרגול" else "צריך עוד תרגול")
                }
            }
        }
    }
}

@Composable
private fun FeedbackCard(color: Color, text: String) {
    Card(colors = CardDefaults.cardColors(containerColor = color), modifier = Modifier.fillMaxWidth()) {
        Text(text, modifier = Modifier.padding(16.dp), style = MaterialTheme.typography.bodyLarge)
    }
}
