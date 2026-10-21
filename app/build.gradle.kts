plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Номер сборки — единственный источник: файл VERSION в корне (формат «мажорная.минорная»).
// versionCode обязан только расти, иначе Android не поставит APK поверх старого:
// 100 + мажорная × 1000 + минорная (0.2 → 102, 0.3 → 103, 1.0 → 1100).
val appVersion = rootProject.file("VERSION").readText().trim()
val (verMajor, verMinor) = appVersion.split(".").map { it.toInt() }

android {
    namespace = "ru.autohub.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "ru.autohub.app"
        minSdk = 26
        targetSdk = 34
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        versionCode = 100 + verMajor * 1000 + verMinor
        versionName = appVersion
    }

    // Постоянный ключ подписи прототипа. Без него GitHub Actions подписывает каждую сборку
    // новым временным ключом, и Android не ставит обновление поверх («приложение не установлено»).
    // Ключ только для тестовых сборок; для RuStore / Google Play нужен отдельный ключ в секретах репозитория.
    signingConfigs {
        create("prototype") {
            storeFile = file("autohub-prototype.keystore")
            storePassword = "autohub-proto"
            keyAlias = "autohub"
            keyPassword = "autohub-proto"
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("prototype")
        }
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
    implementation("cz.adaptech.tesseract4android:tesseract4android:4.9.0")
    implementation("androidx.exifinterface:exifinterface:1.3.7")
    androidTestImplementation("androidx.test:runner:1.5.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.1")
}

// Download and verify at BUILD time only. Both languages are included in every APK.
val prepareOcrModels by tasks.registering(Exec::class) {
    workingDir(rootProject.projectDir)
    commandLine("python3", "tools/prepare_ocr_models.py")
}
tasks.named("preBuild") { dependsOn(prepareOcrModels) }
