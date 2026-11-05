// Plugin versions are declared in settings.gradle.kts (pluginManagement).
// Load the Kotlin plugins once here so :app and :core share the same classloader.
plugins {
    id("org.jetbrains.kotlin.jvm") apply false
    id("org.jetbrains.kotlin.android") apply false
    id("org.jetbrains.kotlin.plugin.compose") apply false
    id("org.jetbrains.kotlin.plugin.serialization") apply false
}
