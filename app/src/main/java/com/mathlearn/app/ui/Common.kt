package com.mathlearn.app.ui

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AssistChip
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScreenScaffold(
    title: String,
    onBack: (() -> Unit)?,
    actions: @Composable RowScope.() -> Unit = {},
    content: @Composable (PaddingValues) -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = {
                    if (onBack != null) IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "חזרה")
                    }
                },
                actions = actions,
            )
        },
        content = content,
    )
}

/**
 * Paragraph direction for a question: Hebrew text reads right-to-left, while a bare expression
 * like "3/4 + 1/8 = ?" must stay left-to-right or the bidi algorithm scrambles it.
 */
fun mathDirection(text: String): TextDirection =
    if (text.any { it in '\u0590'..'\u05FF' }) TextDirection.Rtl else TextDirection.Ltr

/** Quick-insert buttons for symbols that are awkward on a phone keyboard. */
@Composable
fun SymbolRow(onInsert: (String) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(vertical = 4.dp)) {
        listOf("/", "-", ".", "%", " ").forEach { sym ->
            AssistChip(onClick = { onInsert(sym) }, label = { Text(if (sym == " ") "רווח" else sym) })
        }
    }
}
