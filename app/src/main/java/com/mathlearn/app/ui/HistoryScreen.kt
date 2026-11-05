package com.mathlearn.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mathlearn.app.AppViewModel
import com.mathlearn.core.SetKind
import java.text.DateFormat
import java.util.Date

@Composable
fun HistoryScreen(vm: AppViewModel) {
    val fmt = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT, java.util.Locale("he", "IL"))
    ScreenScaffold(title = "ההתקדמות שלי", onBack = { vm.back() }) { pad ->
        LazyColumn(Modifier.padding(pad).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (vm.results.isEmpty()) item {
                Text("עדיין אין אימונים. סיימו תרגול או מבחן כדי לראות כאן את ההתקדמות.",
                    modifier = Modifier.padding(top = 16.dp), color = MaterialTheme.colorScheme.outline)
            }
            items(vm.results, key = { it.id }) { r ->
                Card(Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(r.setTitle, fontWeight = FontWeight.SemiBold)
                            Text("${if (r.kind == SetKind.TEST) "מבחן" else "תרגול"} · ${fmt.format(Date(r.finishedAt))}",
                                style = MaterialTheme.typography.bodySmall)
                        }
                        Text(r.scorePercent?.let { "$it%" } ?: "–", style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }
}
