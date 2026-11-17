import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.library") // AGP comes from the root buildscript classpath (see ../build.gradle.kts)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "om.qabnah.android"
    compileSdk = 35

    defaultConfig {
        minSdk = 24
        consumerProguardFiles("consumer-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }

    buildFeatures {
        compose = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
        freeCompilerArgs.addAll(
            "-opt-in=androidx.compose.material3.ExperimentalMaterial3Api",
            "-opt-in=androidx.compose.foundation.ExperimentalFoundationApi",
            "-opt-in=androidx.compose.foundation.layout.ExperimentalLayoutApi",
        )
    }
}

dependencies {
    api(project(":core"))

    api(platform(libs.androidx.compose.bom))
    api(libs.androidx.compose.ui)
    api(libs.androidx.compose.foundation)
    api(libs.androidx.compose.material3)
    api(libs.androidx.compose.material.icons)
    api(libs.androidx.compose.ui.tooling.preview)
    api(libs.androidx.activity.compose)
    api(libs.androidx.appcompat)
    api(libs.androidx.core.ktx)
    api(libs.androidx.lifecycle.runtime.compose)
    api(libs.androidx.lifecycle.viewmodel.compose)
    api(libs.androidx.navigation.compose)
    api(libs.androidx.browser)
    api(libs.kotlinx.coroutines.android)
    api(libs.kotlinx.coroutines.play.services)
    api(libs.play.services.location)
    api(libs.osmdroid)
    api(libs.coil.compose)
    api(libs.firebase.messaging) // push; initialised manually only when FCM_* BuildConfig fields are set
    implementation(libs.androidx.security.crypto)
    implementation(libs.androidx.exifinterface)

    coreLibraryDesugaring(libs.desugar.jdk.libs)
    debugApi(libs.androidx.compose.ui.tooling)
}
