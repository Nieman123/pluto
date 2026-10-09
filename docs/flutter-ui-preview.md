# Local Flutter experience preview

The refresh uses plum surfaces, lilac controls, orange accents, finite entrance
animations, native touch feedback and orbital artwork with a River Styx motif.
Points have a Treasury accent; admission tickets have a Passage accent. OS
reduced-motion settings skip the custom movement. QR geometry and its light
quiet zone are unchanged, and the wallet still builds ticket rows lazily.

Navigation keeps Home, Rewards, Tickets and Profile in the bottom bar. The
signed-in overflow menu contains the website shortcut, QR scanner, Account and
Admin when authorized. The website shortcut reads Home on web and Go to Website
on native platforms. Ticket pages no longer offer Open Pluto app.

The local Android preview uses the **staging backend** and existing staging
accounts. Its APK is `build/app/outputs/flutter-apk/app-staging-debug.apk`, build
900001. The dedicated emulator is `pluto_ui_preview`; it has separate user data
from the screenshot device.

To reopen the emulator from PowerShell in the repository:

```powershell
$env:ANDROID_HOME='D:/git/pluto/tmp/android-sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
$env:ANDROID_AVD_HOME='D:/git/pluto/tmp/android-avd'
& ./tmp/android-sdk/emulator/emulator.exe -avd pluto_ui_preview
```

Launcher artwork is saved in `assets/branding/pluto-app-icon.png`. Both Android
flavors share the generated launcher resources. To regenerate the raster sizes,
run `python scripts/android/generate-launcher-icons.py` with Pillow installed.
The adaptive resource adds an inset and purple backing to accommodate launcher
masks. The repo has no iOS target yet; retain this source artwork for that setup.

All changes and preview artifacts remain local until approved for publication.
