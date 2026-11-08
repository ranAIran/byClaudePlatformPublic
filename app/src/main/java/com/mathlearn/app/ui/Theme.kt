package com.mathlearn.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.CutCornerShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp

/** The three looks the child can choose in Settings. */
enum class Skin(val title: String, val description: String) {
    CLASSIC("נוכחית", "מחברת חשבון: כחול עט על דף משבצות, בהיר או כהה לפי הטלפון."),
    DARK("כהה", "תמיד כהה, רגוע לעיניים בערב."),
    GAMER("גיימרים", "צבעי ניאון, כפתורים עם פינות חתוכות וכתב מודגש."),
    ;

    /** No choice saved yet -> the gamer look, which is the default. */
    companion object { fun fromName(n: String?) = entries.firstOrNull { it.name == n } ?: GAMER }
}

/** Colors for right / wrong answers, which differ per skin. */
data class FeedbackColors(val good: Color, val bad: Color)

private val LocalFeedback = staticCompositionLocalOf { FeedbackColors(Color(0xFF2E7D32), Color(0xFFC62828)) }
val LocalSkin = staticCompositionLocalOf { Skin.CLASSIC }

val Correct: Color @Composable get() = LocalFeedback.current.good
val Wrong: Color @Composable get() = LocalFeedback.current.bad

private val ClassicLight = lightColorScheme(
    primary = Color(0xFF3F51B5),
    secondary = Color(0xFFFFA000),
    tertiary = Color(0xFF00897B),
    background = Color(0xFFF7F7FB),
    surface = Color(0xFFFFFFFF),
)

private val ClassicDark = darkColorScheme(
    primary = Color(0xFF9FA8DA),
    secondary = Color(0xFFFFCA28),
    tertiary = Color(0xFF4DB6AC),
)

/** Deeper than the classic dark: near-black ink-blue, soft contrast. */
private val Darker = darkColorScheme(
    primary = Color(0xFF8FB0FF),
    onPrimary = Color(0xFF0A1330),
    primaryContainer = Color(0xFF1B2747),
    onPrimaryContainer = Color(0xFFDCE4FF),
    secondary = Color(0xFFE8C468),
    secondaryContainer = Color(0xFF3A3220),
    onSecondaryContainer = Color(0xFFF5E7C2),
    tertiary = Color(0xFF7FD1C3),
    tertiaryContainer = Color(0xFF173A35),
    onTertiaryContainer = Color(0xFFCFF3EC),
    background = Color(0xFF07090F),
    onBackground = Color(0xFFDDE3F0),
    surface = Color(0xFF0E121C),
    onSurface = Color(0xFFDDE3F0),
    surfaceVariant = Color(0xFF1A2030),
    onSurfaceVariant = Color(0xFFA9B2C8),
    surfaceContainer = Color(0xFF121827),
    surfaceContainerHigh = Color(0xFF161D2E),
    surfaceContainerHighest = Color(0xFF1B2336),
    surfaceContainerLow = Color(0xFF0F1420),
    outline = Color(0xFF6E7891),
)

/** Neon arcade: magenta / cyan / lime on deep violet. */
private val Gamer = darkColorScheme(
    primary = Color(0xFFFF3EC8),
    onPrimary = Color(0xFF1A0016),
    primaryContainer = Color(0xFF4A1250),
    onPrimaryContainer = Color(0xFFFFD6F4),
    secondary = Color(0xFF26E6FF),
    onSecondary = Color(0xFF00222A),
    secondaryContainer = Color(0xFF0D3A4A),
    onSecondaryContainer = Color(0xFFC8F7FF),
    tertiary = Color(0xFFB6FF3B),
    onTertiary = Color(0xFF162600),
    tertiaryContainer = Color(0xFF26400A),
    onTertiaryContainer = Color(0xFFE6FFC2),
    background = Color(0xFF0D0620),
    onBackground = Color(0xFFF2EAFF),
    surface = Color(0xFF160B33),
    onSurface = Color(0xFFF2EAFF),
    surfaceVariant = Color(0xFF241447),
    onSurfaceVariant = Color(0xFFC9B8F0),
    surfaceContainer = Color(0xFF1C0F3E),
    surfaceContainerHigh = Color(0xFF241447),
    surfaceContainerHighest = Color(0xFF2C1A55),
    surfaceContainerLow = Color(0xFF180C36),
    outline = Color(0xFF9B7BE0),
    error = Color(0xFFFF5C8A),
)

private val GamerShapes = Shapes(
    extraSmall = CutCornerShape(4.dp),
    small = CutCornerShape(6.dp),
    medium = CutCornerShape(10.dp),
    large = CutCornerShape(14.dp),
    extraLarge = CutCornerShape(18.dp),
)

private val DarkShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(14.dp),
    large = RoundedCornerShape(20.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

/** Bolder, more condensed type for the gamer look; monospace numbers like a score board. */
private fun gamerTypography(): Typography {
    val base = Typography()
    fun bold(s: androidx.compose.ui.text.TextStyle) = s.copy(fontWeight = FontWeight.Black)
    return base.copy(
        headlineSmall = bold(base.headlineSmall).copy(fontFamily = FontFamily.Monospace),
        titleLarge = bold(base.titleLarge),
        titleMedium = bold(base.titleMedium),
        labelLarge = bold(base.labelLarge),
        bodyLarge = base.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
    )
}

@Composable
fun MathTheme(skin: Skin = Skin.CLASSIC, content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val colors = when (skin) {
        Skin.CLASSIC -> if (dark) ClassicDark else ClassicLight
        Skin.DARK -> Darker
        Skin.GAMER -> Gamer
    }
    val feedback = when (skin) {
        Skin.CLASSIC -> if (dark) FeedbackColors(Color(0xFF6FD39A), Color(0xFFFF8A80)) else FeedbackColors(Color(0xFF2E7D32), Color(0xFFC62828))
        Skin.DARK -> FeedbackColors(Color(0xFF6FD39A), Color(0xFFFF8A80))
        Skin.GAMER -> FeedbackColors(Color(0xFFB6FF3B), Color(0xFFFF5C8A))
    }
    // The app is Hebrew-first, so lay everything out right-to-left even on an English phone.
    CompositionLocalProvider(
        LocalLayoutDirection provides LayoutDirection.Rtl,
        LocalFeedback provides feedback,
        LocalSkin provides skin,
    ) {
        MaterialTheme(
            colorScheme = colors,
            shapes = when (skin) { Skin.GAMER -> GamerShapes; Skin.DARK -> DarkShapes; Skin.CLASSIC -> Shapes() },
            typography = if (skin == Skin.GAMER) gamerTypography() else Typography(),
            content = content,
        )
    }
}
