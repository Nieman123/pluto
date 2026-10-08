import java.util.Base64

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")
}

val emulatorPreview = providers.gradleProperty("dart-defines").orNull.orEmpty()
    .split(',').mapNotNull { runCatching { String(Base64.getDecoder().decode(it)) }.getOrNull() }
    .any { it.startsWith("FIREBASE_EMULATOR_HOST=") && it.substringAfter('=').isNotEmpty() }

android {
    namespace = "events.pluto.app"
    compileSdk = 36
    ndkVersion = flutter.ndkVersion
    buildFeatures { resValues = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "events.pluto.app"
        // A demo build must not initialize the real staging Firebase app first.
        manifestPlaceholders["firebaseInitProviderEnabled"] = (!emulatorPreview).toString()
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = 26
        targetSdk = 36
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    flavorDimensions += "environment"
    productFlavors {
        create("staging") {
            dimension = "environment"
            applicationIdSuffix = ".staging"
            resValue("string", "app_name", "Pluto Events Staging")
            manifestPlaceholders["plutoLinkHost"] = "pluto-staging-92eb7.web.app"
        }
        create("production") {
            dimension = "environment"
            resValue("string", "app_name", "Pluto Events")
            manifestPlaceholders["plutoLinkHost"] = "pluto.events"
        }
    }

    val uploadStore = System.getenv("PLUTO_UPLOAD_KEYSTORE")
    val unsignedValidation = System.getenv("PLUTO_UNSIGNED_VALIDATION") == "true"
    signingConfigs {
        if (!uploadStore.isNullOrBlank()) {
            create("upload") {
                storeFile = file(uploadStore)
                storePassword = System.getenv("PLUTO_UPLOAD_STORE_PASSWORD")
                keyAlias = System.getenv("PLUTO_UPLOAD_KEY_ALIAS")
                keyPassword = System.getenv("PLUTO_UPLOAD_KEY_PASSWORD")
            }
        }
        System.getenv("PLUTO_DEBUG_KEYSTORE")?.let { getByName("debug").storeFile = file(it) }
    }
    if (gradle.startParameter.taskNames.any { it.contains("Release") } &&
        uploadStore.isNullOrBlank() && !unsignedValidation) {
        throw GradleException("Release builds require the Pluto upload keystore. Debug signing is never used for release.")
    }
    buildTypes {
        release {
            signingConfig = if (uploadStore.isNullOrBlank()) null else signingConfigs.getByName("upload")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
