package com.mathlearn.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedCard
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import com.mathlearn.app.AppViewModel

@Composable
fun SettingsScreen(vm: AppViewModel) {
    var key by rememberSaveable { mutableStateOf(vm.apiKey) }
    var model by rememberSaveable { mutableStateOf(vm.model) }
    var saved by rememberSaveable { mutableStateOf(false) }

    ScreenScaffold(title = "הגדרות", onBack = { vm.back() }) { pad ->
        Column(
            Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("מראה", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
            Skin.entries.forEach { s ->
                SkinOption(s, selected = vm.skin == s, onClick = { vm.updateSkin(s) })
            }

            Text("קריאה חכמה של דפים (לא חובה)", modifier = Modifier.padding(top = 16.dp), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
            Text(
                "עם מפתח API של Anthropic, הדפים שמעלים נקראים על ידי Claude – הוא מבין עברית, כתב יד, " +
                    "בעיות מילוליות ושרטוטים, ומכין מפתח תשובות עם רמזים ופתרונות. " +
                    "התמונה נשלחת ל-API של Anthropic והשימוש מחויב בחשבון של המפתח, לכן כדאי שהורה יגדיר את זה. " +
                    "בלי מפתח האפליקציה עובדת במלואה גם בלי אינטרנט (התרגול לפי נושאים והסריקה במכשיר).",
                style = MaterialTheme.typography.bodyMedium,
            )
            OutlinedTextField(
                value = key, onValueChange = { key = it; saved = false },
                label = { Text("מפתח API של Anthropic") }, singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = model, onValueChange = { model = it; saved = false },
                label = { Text("מודל") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            )
            Button(onClick = { vm.updateSettings(key, model); saved = true }) { Text(if (saved) "נשמר ✓" else "שמירה") }

            Text("נתונים", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(top = 16.dp))
            OutlinedButton(onClick = { vm.clearHistory() }) { Text("מחיקת היסטוריית ההתקדמות") }
            Text("גרסה ${com.mathlearn.app.BuildConfig.VERSION_NAME} (${com.mathlearn.app.BuildConfig.BUILD_SHA})",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline,
                modifier = Modifier.padding(top = 16.dp))
        }
    }
}

/** One theme choice with a small swatch of its colors. */
@Composable
private fun SkinOption(skin: Skin, selected: Boolean, onClick: () -> Unit) {
    val swatch = when (skin) {
        Skin.CLASSIC -> listOf(Color(0xFFF7F7FB), Color(0xFF3F51B5), Color(0xFFE0525C))
        Skin.DARK -> listOf(Color(0xFF07090F), Color(0xFF8FB0FF), Color(0xFFE8C468))
        Skin.GAMER -> listOf(Color(0xFF0D0620), Color(0xFFFF3EC8), Color(0xFF26E6FF), Color(0xFFB6FF3B))
    }
    OutlinedCard(
        onClick = onClick,
        border = BorderStroke(if (selected) 3.dp else 1.dp, if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                swatch.forEach { c -> Box(Modifier.size(width = 14.dp, height = 32.dp).background(c, RoundedCornerShape(3.dp))) }
            }
            Column(Modifier.weight(1f)) {
                Text((if (selected) "✓ " else "") + skin.title, fontWeight = FontWeight.Bold)
                Text(skin.description, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
