plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.mapacoordenadas.nativeapp"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.mapacoordenadas.nativeapp"
        minSdk = 26
        targetSdk = 35
        versionCode = 62
        versionName = "6.2"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("com.google.android.gms:play-services-location:21.3.0")
}

tasks.register("copyApkToRoot") {
    dependsOn("assembleDebug")
    doLast {
        val src = layout.buildDirectory.file("outputs/apk/debug/app-debug.apk").get().asFile
        val dest = File(rootDir.parentFile, "Mapcoord.APK")
        src.copyTo(dest, overwrite = true)
        println("APK copiado com sucesso para: ${dest.absolutePath}")
    }
}
