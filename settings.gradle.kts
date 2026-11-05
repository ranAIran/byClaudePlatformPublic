// Set CORE_ONLY=1 to build/test the pure-Kotlin core without the Android SDK or Google Maven.
val coreOnly = System.getenv("CORE_ONLY") != null

pluginManagement {
    repositories {
        if (System.getenv("CORE_ONLY") == null) google()
        mavenCentral()
        gradlePluginPortal()
    }
    plugins {
        id("com.android.application") version "8.7.3"
        id("org.jetbrains.kotlin.android") version "2.1.0"
        id("org.jetbrains.kotlin.jvm") version "2.1.0"
        id("org.jetbrains.kotlin.plugin.compose") version "2.1.0"
        id("org.jetbrains.kotlin.plugin.serialization") version "2.1.0"
    }
}

dependencyResolutionManagement {
    repositories {
        if (!coreOnly) google()
        mavenCentral()
    }
}

rootProject.name = "MathGrade6"

include(":core")
if (!coreOnly) {
    include(":app")
}
