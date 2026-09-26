plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ru.autohub.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "ru.autohub.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 6
        versionName = "0.6-prototype"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Для публикации в магазине подключите свой ключ подписи (signingConfig)
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.1")
}
