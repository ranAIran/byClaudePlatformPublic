package com.mathlearn.app.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.mathlearn.app.AppViewModel
import com.mathlearn.app.ExtractMethod
import com.mathlearn.app.Screen
import java.io.File

@Composable
fun ImportScreen(vm: AppViewModel, initialUri: Uri?) {
    val context = LocalContext.current
    var method by rememberSaveable { mutableStateOf(if (vm.apiKey.isNotBlank()) ExtractMethod.CLAUDE else ExtractMethod.ON_DEVICE) }
    var note by rememberSaveable { mutableStateOf("") }
    var pendingCapture by rememberSaveable { mutableStateOf<String?>(null) }

    LaunchedEffect(initialUri) { if (initialUri != null) vm.loadImage(initialUri) }

    val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) vm.loadImage(uri)
    }
    val takePicture = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val uri = pendingCapture?.let(Uri::parse)
        if (ok && uri != null) vm.loadImage(uri)
    }

    fun launchCamera() {
        val dir = File(context.cacheDir, "captures").apply { mkdirs() }
        val file = File(dir, "page_${System.currentTimeMillis()}.jpg")
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        pendingCapture = uri.toString()
        takePicture.launch(uri)
    }

    ScreenScaffold(title = "העלאת דף עבודה", onBack = { vm.back() }) { pad ->
        Column(
            Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { launchCamera() }, modifier = Modifier.weight(1f)) { Text("📷 צילום") }
                OutlinedButton(
                    onClick = { pickImage.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                    modifier = Modifier.weight(1f),
                ) { Text("🖼️ גלריה") }
            }

            val bitmap = vm.importBitmap
            if (bitmap != null) {
                Card(Modifier.fillMaxWidth()) {
                    Image(
                        bitmap = bitmap.asImageBitmap(),
                        contentDescription = "הדף שנבחר",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxWidth().heightIn(max = 360.dp),
                    )
                }
            } else {
                Text(
                    "טיפ: צלמו את הדף כשהוא שטוח, באור טוב, כך שהתרגילים ימלאו את המסך.",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.outline,
                )
            }

            Text("איך לקרוא את הדף?", fontWeight = FontWeight.Bold)
            MethodOption(
                selected = method == ExtractMethod.CLAUDE,
                enabled = vm.apiKey.isNotBlank(),
                title = "✨ חכם (Claude AI)",
                subtitle = if (vm.apiKey.isNotBlank())
                    "הכי טוב לעברית, כתב יד, בעיות מילוליות ושרטוטים. גם פותר ומכין מפתח תשובות. דורש אינטרנט."
                else "כדי להפעיל, הוסיפו מפתח API של Anthropic בהגדרות.",
                onClick = { method = ExtractMethod.CLAUDE },
            )
            if (vm.apiKey.isBlank()) {
                TextButton(onClick = { vm.navigate(Screen.Settings) }) { Text("להגדרות") }
            }
            MethodOption(
                selected = method == ExtractMethod.ON_DEVICE,
                enabled = true,
                title = "📱 במכשיר (בלי אינטרנט)",
                subtitle = "חינמי ופרטי, אבל מזהה רק מספרים ותרגילים מודפסים כמו 3/4 + 1/8 = ___ (לא קורא טקסט בעברית).",
                onClick = { method = ExtractMethod.ON_DEVICE },
            )
            if (method == ExtractMethod.CLAUDE) {
                OutlinedTextField(
                    value = note, onValueChange = { note = it },
                    label = { Text("הערה (לא חובה), למשל: רק שאלות 1–5") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            vm.importError?.let { Text(it, color = MaterialTheme.colorScheme.error) }

            Button(
                onClick = { vm.extract(method, note) },
                enabled = bitmap != null && !vm.importBusy,
                modifier = Modifier.fillMaxWidth().height(52.dp),
            ) {
                if (vm.importBusy) {
                    CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.size(8.dp))
                    Text("קורא את הדף…")
                } else Text("חילוץ התרגילים")
            }
        }
    }
}

@Composable
private fun MethodOption(selected: Boolean, enabled: Boolean, title: String, subtitle: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().selectable(selected = selected, enabled = enabled, onClick = onClick).padding(vertical = 4.dp),
        verticalAlignment = Alignment.Top,
    ) {
        RadioButton(selected = selected, onClick = onClick, enabled = enabled)
        Column(Modifier.padding(top = 10.dp)) {
            Text(title, fontWeight = FontWeight.SemiBold,
                color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outline)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline)
        }
    }
}
