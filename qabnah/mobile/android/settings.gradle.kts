import java.io.File
import java.util.Properties

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "qabnah-android"

/**
 * The Android app modules are only included when an Android SDK is configured
 * (local.properties `sdk.dir`, or ANDROID_HOME / ANDROID_SDK_ROOT pointing at an existing directory).
 * This keeps `./gradlew :core:test` working on machines (and CI containers) without the SDK.
 * Keep this logic in sync with build.gradle.kts (buildscript block).
 */
fun androidSdkConfigured(root: File): Boolean {
    val localProps = File(root, "local.properties")
    if (localProps.isFile) {
        val p = Properties().apply { localProps.inputStream().use { load(it) } }
        val dir = p.getProperty("sdk.dir")
        if (!dir.isNullOrBlank() && File(dir).isDirectory) return true
    }
    return listOf("ANDROID_HOME", "ANDROID_SDK_ROOT")
        .mapNotNull { System.getenv(it) }
        .any { it.isNotBlank() && File(it).isDirectory }
}

include(":core")

if (androidSdkConfigured(settingsDir)) {
    include(":android-common") // shared Compose UI, auth, maps, secure token storage
    include(":consumer")
    include(":captain")
} else {
    logger.lifecycle("[qabnah] No Android SDK configured - building :core only (set sdk.dir in local.properties to include :consumer and :captain).")
}
