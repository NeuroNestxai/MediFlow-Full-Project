// AGP lives on Google's Maven repository. It is only put on the build classpath when an Android SDK is
// configured, so that `./gradlew :core:test` never needs to resolve it (mirrors settings.gradle.kts).
buildscript {
    val sdkConfigured = run {
        val localProps = java.io.File(rootDir, "local.properties")
        val fromLocal = if (localProps.isFile) {
            val p = java.util.Properties().apply { localProps.inputStream().use { load(it) } }
            p.getProperty("sdk.dir")?.let { java.io.File(it).isDirectory } ?: false
        } else false
        fromLocal || listOf("ANDROID_HOME", "ANDROID_SDK_ROOT")
            .mapNotNull { System.getenv(it) }
            .any { it.isNotBlank() && java.io.File(it).isDirectory }
    }
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        if (sdkConfigured) {
            // Keep in sync with `agp` in gradle/libs.versions.toml.
            classpath("com.android.tools.build:gradle:8.9.1")
        }
    }
}

plugins {
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.kotlin.compose) apply false
}
