package com.mathlearn.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mathlearn.app.AppViewModel
import com.mathlearn.app.BuildConfig
import com.mathlearn.app.Screen
import com.mathlearn.core.ExerciseSet
import com.mathlearn.core.SetKind
import com.mathlearn.core.Topic

@Composable
fun HomeScreen(vm: AppViewModel) {
    var topicDialog by remember { mutableStateOf<Topic?>(null) }
    var deleteDialog by remember { mutableStateOf<ExerciseSet?>(null) }

    ScreenScaffold(
        title = "מתמטיקה ו׳ ✏️",
        onBack = null,
        actions = {
            IconButton(onClick = { vm.navigate(Screen.History) }) { Icon(Icons.Filled.DateRange, "ההתקדמות שלי") }
            IconButton(onClick = { vm.navigate(Screen.Settings) }) { Icon(Icons.Filled.Settings, "הגדרות") }
        },
    ) { pad ->
        LazyColumn(
            modifier = Modifier.padding(pad).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { StatsHeader(vm) }
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(Modifier.padding(16.dp)) {
                        Text("📷 סריקת דף עבודה או מבחן", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text("צלמו או בחרו תמונה – האפליקציה תהפוך אותה לתרגילים שאפשר לפתור כאן.",
                            style = MaterialTheme.typography.bodyMedium)
                        Spacer(Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = { vm.clearImport(); vm.navigate(Screen.Import()) }) { Text("העלאת תמונה") }
                            OutlinedButton(onClick = { vm.newManualSet() }) {
                                Icon(Icons.Filled.Add, null, Modifier.size(18.dp)); Text("הקלדה ידנית")
                            }
                        }
                    }
                }
            }
            item {
                OutlinedButton(onClick = { vm.startMixedTest() }, modifier = Modifier.fillMaxWidth()) {
                    Text("📝 מבחן מסכם מהיר (12 שאלות)")
                }
            }
            item { Text("תרגול לפי נושא", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
            items(Topic.practiceTopics.chunked(2)) { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    row.forEach { topic ->
                        Card(
                            modifier = Modifier.weight(1f).height(96.dp).clickable { topicDialog = topic },
                        ) {
                            Column(
                                Modifier.fillMaxWidth().padding(12.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                Text(topic.emoji, fontSize = 26.sp, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                                Text(topic.title, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                    if (row.size == 1) Spacer(Modifier.weight(1f))
                }
            }
            item {
                Text("דפי העבודה שלי", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                if (vm.sets.isEmpty()) {
                    Text("עדיין אין כאן כלום – העלו תמונה של שיעורי הבית כדי להתחיל.",
                        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.outline)
                }
            }
            items(vm.sets, key = { it.id }) { set ->
                Card(Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(start = 16.dp, end = 4.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(set.title, fontWeight = FontWeight.SemiBold)
                            Text("${set.exercises.size} שאלות · ${if (set.kind == SetKind.TEST) "מבחן" else "תרגול"}",
                                style = MaterialTheme.typography.bodySmall)
                        }
                        IconButton(onClick = { vm.navigate(Screen.Review(set)) }) { Icon(Icons.Filled.Edit, "עריכה") }
                        IconButton(onClick = { deleteDialog = set }) { Icon(Icons.Filled.Delete, "מחיקה") }
                        IconButton(onClick = { vm.startSet(set) }, enabled = set.exercises.isNotEmpty()) {
                            Icon(Icons.Filled.PlayArrow, "התחלה")
                        }
                    }
                }
            }
            item {
                Text(
                    "גרסה ${BuildConfig.VERSION_NAME} · ${BuildConfig.BUILD_SHA}",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline,
                    textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
                Spacer(Modifier.height(24.dp))
            }
        }
    }

    topicDialog?.let { topic ->
        AlertDialog(
            onDismissRequest = { topicDialog = null },
            title = { Text(topic.title) },
            text = { Text("בתרגול מקבלים רמזים ומשוב מיידי.\nמבחן נבדק רק בסוף.") },
            confirmButton = {
                Button(onClick = { topicDialog = null; vm.startTopic(topic, SetKind.EXERCISES) }) { Text("תרגול") }
            },
            dismissButton = {
                OutlinedButton(onClick = { topicDialog = null; vm.startTopic(topic, SetKind.TEST) }) { Text("מבחן") }
            },
        )
    }

    deleteDialog?.let { set ->
        AlertDialog(
            onDismissRequest = { deleteDialog = null },
            title = { Text("למחוק את \"${set.title}\"?") },
            confirmButton = { TextButton(onClick = { vm.deleteSet(set); deleteDialog = null }) { Text("מחיקה") } },
            dismissButton = { TextButton(onClick = { deleteDialog = null }) { Text("ביטול") } },
        )
    }
}

@Composable
private fun StatsHeader(vm: AppViewModel) {
    val scored = vm.results.mapNotNull { it.scorePercent }
    Box(Modifier.fillMaxWidth().padding(top = 4.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
            StatCard("אימונים", vm.results.size.toString(), Modifier.weight(1f))
            StatCard("ממוצע", if (scored.isEmpty()) "–" else "${scored.average().toInt()}%", Modifier.weight(1f))
            StatCard("נפתרו", vm.results.sumOf { it.correctCount }.toString(), Modifier.weight(1f))
        }
    }
}

@Composable
private fun StatCard(label: String, value: String, modifier: Modifier) {
    Card(modifier) {
        Column(Modifier.fillMaxWidth().padding(vertical = 10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            Text(label, style = MaterialTheme.typography.bodySmall)
        }
    }
}
