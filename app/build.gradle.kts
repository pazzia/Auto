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

    // Подпись. Debug-сборка (тесты CI на эмуляторе) — стандартным debug-ключом Android.
    // Release-сборка — ключом из переменных окружения (в CI их ставит задача release из секретов репозитория):
    //   AUTOHUB_KEYSTORE_FILE, AUTOHUB_KEYSTORE_PASSWORD, AUTOHUB_KEY_ALIAS, AUTOHUB_KEY_PASSWORD.
    // Если чего-то нет, release собирается без подписи (app-release-unsigned.apk) — настройка проекта не падает.
    // Ключи и пароли в репозиторий не кладутся (.gitignore: *.jks, *.keystore).
    val releaseSigning = listOf("AUTOHUB_KEYSTORE_FILE", "AUTOHUB_KEYSTORE_PASSWORD", "AUTOHUB_KEY_ALIAS", "AUTOHUB_KEY_PASSWORD")
        .associateWith { System.getenv(it).orEmpty() }
        .takeIf { env -> env.values.all { it.isNotBlank() } && java.io.File(env.getValue("AUTOHUB_KEYSTORE_FILE")).isFile }
    signingConfigs {
        if (releaseSigning != null) {
            create("release") {
                storeFile = java.io.File(releaseSigning.getValue("AUTOHUB_KEYSTORE_FILE"))
                storePassword = releaseSigning.getValue("AUTOHUB_KEYSTORE_PASSWORD")
                keyAlias = releaseSigning.getValue("AUTOHUB_KEY_ALIAS")
                keyPassword = releaseSigning.getValue("AUTOHUB_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isDebuggable = false
            // R8 без keep-правил удалит методы @JavascriptInterface — минификация выключена намеренно
            isMinifyEnabled = false
            if (releaseSigning != null) signingConfig = signingConfigs.getByName("release")
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
