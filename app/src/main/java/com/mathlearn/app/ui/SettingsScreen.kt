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
            Text("קריאה חכמה של דפים (לא חובה)", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
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
        }
    }
}
