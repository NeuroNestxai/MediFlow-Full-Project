import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application") // AGP comes from the root buildscript classpath (see ../build.gradle.kts)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// -Pqabnah.apiBaseUrl=... or gradle.properties. Debug default reaches the host machine from the emulator.
val apiBaseUrl: String = providers.gradleProperty("qabnah.apiBaseUrl").getOrElse("http://10.0.2.2:4000/v1")

android {
    namespace = "om.qabnah.captain"
    compileSdk = 35

    defaultConfig {
        applicationId = "om.qabnah.captain"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Signing is configured outside the repo (see README). Release builds require an https API_BASE_URL.
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "/META-INF/versions/9/previous-compilation-data.bin")
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
        freeCompilerArgs.addAll(
            "-opt-in=androidx.compose.material3.ExperimentalMaterial3Api",
            "-opt-in=androidx.compose.foundation.ExperimentalFoundationApi",
            "-opt-in=androidx.compose.foundation.layout.ExperimentalLayoutApi",
            "-opt-in=kotlinx.coroutines.FlowPreview",
        )
    }
}

dependencies {
    implementation(project(":android-common"))
    implementation(libs.androidx.lifecycle.service)
    coreLibraryDesugaring(libs.desugar.jdk.libs)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
