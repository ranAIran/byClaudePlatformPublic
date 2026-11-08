package com.mathlearn.app.ui

import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mathlearn.app.data.Speaker
import com.mathlearn.core.BidiText
import com.mathlearn.core.SpeechText

/** Marker-pen yellow behind the word being read. */
private val Marker = Color(0xFFFFE066)

/**
 * Text that can be read aloud: the word being spoken is highlighted, and tapping a single
 * word reads just that word. Math inside Hebrew keeps its left-to-right order.
 */
@Composable
fun ReadAloudText(
    speaker: Speaker,
    key: String,
    text: String,
    style: TextStyle = LocalTextStyle.current,
    modifier: Modifier = Modifier,
) {
    val plan = remember(text) { SpeechText.plan(text) }
    val (shown, map) = remember(text) { BidiText.isolateMathMapped(text) }
    val active = speaker.activeKey == key
    val token = if (active) plan.tokens.getOrNull(speaker.activeToken) else null
    val annotated = buildAnnotatedString {
        append(shown)
        if (token != null) {
            addStyle(SpanStyle(background = Marker, color = Color.Black, fontWeight = FontWeight.Bold),
                map(token.displayStart), map(token.displayEnd))
        }
    }
    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
    Text(
        annotated,
        style = style.copy(textDirection = mathDirection(text)),
        onTextLayout = { layout = it },
        modifier = modifier.pointerInput(text) {
            detectTapGestures { pos ->
                val l = layout ?: return@detectTapGestures
                val shownIndex = l.getOffsetForPosition(pos)
                // Map the tapped character back to the original text, then to its word.
                val original = (0..text.length).lastOrNull { map(it) <= shownIndex } ?: return@detectTapGestures
                val t = plan.tokenAtDisplay(original)
                if (t >= 0) speaker.speakWord(key, text, t)
            }
        },
    )
}

/** "🔊 Read aloud / ■ Stop" plus the slow-speech toggle; explains when no Hebrew voice exists. */
@Composable
fun ReadAloudControls(speaker: Speaker, key: String, text: String, onToggleSlow: () -> Unit, extra: @Composable () -> Unit = {}) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            val reading = speaker.activeKey == key
            FilledTonalButton(
                onClick = { if (reading) speaker.stop() else speaker.speak(key, text) },
                enabled = speaker.status == Speaker.Status.READY,
            ) { Text(if (reading) "■ עצירה" else "🔊 הקראה") }
            extra()
            FilterChip(selected = speaker.slow, onClick = onToggleSlow, label = { Text("🐢 לאט") })
        }
        when (speaker.status) {
            Speaker.Status.NO_HEBREW -> Text(
                "אין במכשיר קול בעברית. אפשר להוסיף: הגדרות ← נגישות ← המרת טקסט לדיבור ← התקנת נתוני קול ← עברית.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error,
            )
            Speaker.Status.FAILED -> Text("ההקראה לא זמינה במכשיר הזה.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            else -> Text("אפשר גם ללחוץ על מילה כדי לשמוע רק אותה.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline)
        }
    }
}

/** Small speaker button for a short text such as a hint or a multiple-choice option. */
@Composable
fun SpeakButton(speaker: Speaker, key: String, text: String) {
    if (speaker.status != Speaker.Status.READY) return
    val reading = speaker.activeKey == key
    TextButton(onClick = { if (reading) speaker.stop() else speaker.speak(key, text) }) {
        Text(if (reading) "■" else "🔊")
    }
}
