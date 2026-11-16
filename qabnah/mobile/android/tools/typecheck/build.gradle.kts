// Type-check harness for machines WITHOUT the Android SDK / Google Maven (NOT an Android build, produces no APK).
// Compiles :core, :android-common, :consumer and :captain sources together against
//   - JetBrains Compose for Desktop 1.8 (same APIs as Jetpack Compose 1.8 / Material3 1.3) from Maven Central,
//   - Robolectric's android-all (API 35 framework classes) and osmdroid's classes.jar from Maven Central,
//   - hand-written stubs (stubs/) for Google-Maven-only libraries (AppCompat, Activity, Core, Lifecycle, Play services, ...),
//   - generated R/BuildConfig objects (gen/, from the modules' res/values/strings.xml and drawables).
// It catches Kotlin/Compose type errors; it cannot validate the stubbed APIs, resources linking or the manifest.
// Run: ./run.sh
plugins {
    kotlin("jvm") version "2.1.20"
    kotlin("plugin.serialization") version "2.1.20"
    kotlin("plugin.compose") version "2.1.20"
}
val repo = rootDir.resolve("../..").canonicalPath
kotlin {
    jvmToolchain(21)
    compilerOptions {
        freeCompilerArgs.addAll(
            "-opt-in=androidx.compose.material3.ExperimentalMaterial3Api",
            "-opt-in=androidx.compose.foundation.ExperimentalFoundationApi",
            "-opt-in=androidx.compose.foundation.layout.ExperimentalLayoutApi",
            "-opt-in=kotlinx.coroutines.FlowPreview",
            "-opt-in=kotlinx.serialization.ExperimentalSerializationApi",
        )
    }
}
sourceSets {
    main {
        kotlin.srcDirs(
            "$repo/core/src/main/kotlin",
            "$repo/android-common/src/main/kotlin",
            "$repo/consumer/src/main/kotlin",
            "$repo/captain/src/main/kotlin",
            "stubs", "gen",
        )
    }
}
dependencies {
    compileOnly(files("libs/android-all.jar", "libs/osmdroid-classes.jar"))
    implementation("org.jetbrains.compose.runtime:runtime-desktop:1.8.0")
    implementation("org.jetbrains.compose.ui:ui-desktop:1.8.0")
    implementation("org.jetbrains.compose.foundation:foundation-desktop:1.8.0")
    implementation("org.jetbrains.compose.material3:material3-desktop:1.8.0")
    implementation("org.jetbrains.compose.material:material-icons-extended-desktop:1.7.3")
    implementation("org.jetbrains.androidx.lifecycle:lifecycle-viewmodel-compose-desktop:2.9.0")
    implementation("org.jetbrains.androidx.lifecycle:lifecycle-runtime-compose-desktop:2.9.0")
    implementation("org.jetbrains.androidx.navigation:navigation-compose-desktop:2.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
// Google-Maven-only JVM artifacts (unreachable here) are replaced by source stubs in stubs/.
configurations.all {
    exclude(group = "androidx.annotation")
    exclude(group = "androidx.collection")
    exclude(group = "androidx.lifecycle")
    exclude(group = "androidx.savedstate")
    exclude(group = "androidx.arch.core")
}
