package com.mathlearn.app

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.Composable
import com.mathlearn.app.ui.HistoryScreen
import com.mathlearn.app.ui.HomeScreen
import com.mathlearn.app.ui.ImportScreen
import com.mathlearn.app.ui.MathTheme
import com.mathlearn.app.ui.ResultScreen
import com.mathlearn.app.ui.ReviewScreen
import com.mathlearn.app.ui.SessionScreen
import com.mathlearn.app.ui.SettingsScreen

class MainActivity : ComponentActivity() {
    private val vm: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (savedInstanceState == null) handleShare(intent)
        setContent { MathTheme(vm.skin) { App(vm) } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleShare(intent)
    }

    /** A photo shared from the gallery/camera app opens straight in the import screen. */
    private fun handleShare(intent: Intent?) {
        val type = intent?.type ?: return
        if (intent.action != Intent.ACTION_SEND || !(type.startsWith("image/") || type == "application/pdf")) return
        val uri: Uri? = if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
            @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_STREAM)
        }
        if (uri != null) {
            vm.clearImport()
            vm.navigate(Screen.Import(uri))
        }
    }
}

@Composable
fun App(vm: AppViewModel) {
    BackHandler(enabled = vm.backStack.size > 1) { vm.back() }
    when (val s = vm.screen) {
        Screen.Home -> HomeScreen(vm)
        is Screen.Import -> ImportScreen(vm, s.initialUri)
        is Screen.Review -> ReviewScreen(vm, s.draft, s.rawText)
        is Screen.Session -> SessionScreen(vm, s.state)
        is Screen.Result -> ResultScreen(vm, s.result, s.set)
        Screen.History -> HistoryScreen(vm)
        Screen.Settings -> SettingsScreen(vm)
    }
}
