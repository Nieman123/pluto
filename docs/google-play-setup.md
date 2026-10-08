# Pluto Events Android / Google Play

## Current milestone

The Android foundation adds an API 36 / Android 8+ app, two isolated Firebase
flavors, native Google authentication, existing email/password flows, browser
checkout handoff, account ticket claiming on app resume, persistent ticket
wallets, private recovery/transfer App Links and native build validation.

The first staging installation must be rehearsed on a physical Android phone.
Native door admission (including durable offline replay), device-bound push,
automatic account deletion and protected Play releases are subsequent milestones
in the approved plan. This foundation does **not** make the app ready for a
public Play release. Full event administration stays on the website.

## App identities and configuration

| Flavor | Package | Firebase project | Website/API |
| --- | --- | --- | --- |
| staging | events.pluto.app.staging | pluto-staging-92eb7 | https://pluto-staging-92eb7.web.app |
| production | events.pluto.app | pluto-9b6ca | https://pluto.events |

`config/android/<flavor>.json` holds public compile-time configuration. Firebase
API keys and OAuth client IDs here are public app identifiers, not admin keys or
OAuth client secrets. The native Firebase app ID must be an **Android** app ID;
the web app's Firebase JSON cannot be substituted. The flavor/environment/API
checks fail closed when crossed. Signed releases must use the matching file.

Firebase Android apps are registered for both projects. Staging's local debug
certificate is registered with Firebase. If native Google login reports a
configuration error, confirm Google is enabled in staging Firebase Auth and that
Google Cloud has an Android OAuth client for the staging package and debug SHA-1.
Its Web application OAuth client supplies `PLUTO_GOOGLE_SERVER_CLIENT_ID`.

## Install the staging development build

Use Flutter 3.47.5, JDK 21, Android command-line tools, Android platform 36 and
build-tools 36.0.0. Review and accept the SDK licenses. This machine's isolated
SDK/JDK live under ignored `tmp/`; the generated debug keystore is also ignored.
Never delete that keystore casually: a new debug certificate needs Firebase and
App Links updates and cannot update an installation signed by the old key.

From PowerShell in the repository:

```powershell
$env:ANDROID_HOME = 'D:/git/pluto/tmp/android-sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:JAVA_HOME = 'D:/git/pluto/tmp/jdk21/jdk-21.0.12.1+1'
$env:GRADLE_USER_HOME = 'D:/git/pluto/tmp/gradle-cache'
$env:PUB_CACHE = 'D:/git/pluto/tmp/pub-cache'
$env:PLUTO_DEBUG_KEYSTORE = 'D:/git/pluto/tmp/android-debug.jks'
flutter config --android-sdk="$env:ANDROID_HOME"
flutter config --jdk-dir="$env:JAVA_HOME"
flutter pub get --enforce-lockfile
flutter build apk --debug --flavor staging --dart-define-from-file=config/android/staging.json
& "$env:ANDROID_HOME/platform-tools/adb.exe" install -r build/app/outputs/flutter-apk/app-staging-debug.apk
```

This APK is a development build for staging testing. Production payment keys and
ticket signing keys never belong in the app. Both flavors keep physical event
checkout on the website with Stripe; no Play Billing integration is needed.

Keep the pub cache on the workspace drive when developing on Windows. Kotlin
incremental compilation cannot relativize plugin sources on C: against this
project on D:. The `PUB_CACHE` setting above avoids that build failure.
Run Flutter checks/builds sequentially; they can both update `android/local.properties`.

## Android App Links

Deploy this branch's web backend to staging to serve
`/.well-known/assetlinks.json`. It publishes the local staging debug certificate
from `functions/src/android-links-config.json`. Production publishes an empty
association until the production **Play App Signing** certificate is added.
Certificate fingerprints are public; keep private keystores out of Git.

The app accepts `/app/tickets` and `/app/profile` on its own environment's host.
Public event checkout stays in the browser. Recovery and transfer capabilities
remain in fragments and are not logged by the app. A browser checkout order ID
alone never grants access: native resume uses the existing verified-email claim
endpoint before loading the wallet. Guests retain secure recovery links.

For a connected staging phone:

```powershell
& "$env:ANDROID_HOME/platform-tools/adb.exe" shell pm verify-app-links --re-verify events.pluto.app.staging
& "$env:ANDROID_HOME/platform-tools/adb.exe" shell pm get-app-links events.pluto.app.staging
```

Confirm the staging host is verified, then test a real guest recovery email and
an accepted transfer with the app cold and already open. Do not paste capability
links into public logs or screenshots. Until association is deployed/verified,
Android may open those links in the browser.

## Validation and release boundaries

PR Android validation runs without secrets and produces an **unsigned** staging
bundle solely for compilation and 16 KB ELF checks. It is not installable or a
release artifact. Normal release builds require explicit upload-keystore
credentials and never fall back to debug signing. Local release credentials use
`PLUTO_UPLOAD_KEYSTORE`, `PLUTO_UPLOAD_STORE_PASSWORD`, `PLUTO_UPLOAD_KEY_ALIAS`
and `PLUTO_UPLOAD_KEY_PASSWORD`; keep them outside tracked files.

For the planned store launch, create and verify a Google Play **organization**
account using the D-U-N-S number. Google manages the Play App Signing key; Pluto
backs up a separate upload key. Register the actual Play signing SHA-1/SHA-256 in
Firebase and add the matching SHA-256 to App Links for each Play-distributed
flavor. An upload certificate is not a substitute for the Play signing certificate.
App signing and ticket Ed25519 signing are separate systems.

Launch gates still include native scanner/offline rehearsal on two physical
devices, notification preference tests, account deletion and guest ticket
recovery, approved privacy/retention wording, accurate Data Safety declarations,
store listing assets and successful closed testing. The initial distribution is
United States, adults 18+, under the name Pluto Events. A percentage rollout is
available for updates, not the first public release. Apple distribution follows
after the Android milestones; no iOS project is included here yet.

## Phone rehearsal checklist

- Install, restart and update the staging APK without losing account/ticket data.
- Create/verify an email account, use Google sign-in, sign out and sign in again.
- Open profile, rewards, festival information and the ticket wallet.
- Complete a staging browser purchase/RSVP with the same verified email, return
  to the app and confirm tickets appear without another purchase.
- Exercise guest recovery and transfer links; transferred tickets stay with the
  current holder, not the original purchaser.
- Disconnect and confirm saved attendee tickets still display while scheduled
  private venue information remains private until its reveal time.
- Check small screens, font scaling, camera permissions and Android back behavior.
- Confirm the header stays below the status bar in portrait and outside cutouts
  in landscape. Back should dismiss dialogs first, pop pushed screens, and return
  a directly opened section/tab to the dashboard before exiting from the root.

Record physical-device results before advancing the foundation gate.
