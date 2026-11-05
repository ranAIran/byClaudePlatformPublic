package com.mathlearn.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.graphics.Color

val Correct = Color(0xFF2E7D32)
val Wrong = Color(0xFFC62828)

private val Light = lightColorScheme(
    primary = Color(0xFF3F51B5),
    secondary = Color(0xFFFFA000),
    tertiary = Color(0xFF00897B),
    background = Color(0xFFF7F7FB),
    surface = Color(0xFFFFFFFF),
)

private val Dark = darkColorScheme(
    primary = Color(0xFF9FA8DA),
    secondary = Color(0xFFFFCA28),
    tertiary = Color(0xFF4DB6AC),
)

@Composable
fun MathTheme(content: @Composable () -> Unit) {
    // The app is Hebrew-first, so lay everything out right-to-left even on an English phone.
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
        MaterialTheme(colorScheme = if (isSystemInDarkTheme()) Dark else Light, content = content)
    }
}
