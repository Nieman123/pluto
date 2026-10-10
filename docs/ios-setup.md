# Pluto Events iOS foundation

The iOS project supports iPhone and iPad on iOS 15.5 or newer. QR scanning uses
Apple Vision on iOS and supports Apple Silicon simulators. It shares the member
UI, rewards, scavenger-hunt scanning, secure ticket wallet, browser checkout,
reviewer demo mode and profile with Android. Event administration stays on the
website. This foundation is ready for native compilation checks; it is not yet
a signed TestFlight or App Store release.

| Flavor | Bundle ID | Firebase project | Website |
| --- | --- | --- | --- |
| staging | `events.pluto.app.staging` | `pluto-staging-92eb7` | `https://pluto-staging-92eb7.web.app` |
| production | `events.pluto.app` | `pluto-9b6ca` | `https://pluto.events` |

## Implemented

- Native Flutter runner with scene lifecycle support and separate shared Xcode
  schemes/build configurations for both environments.
- Registered Firebase iOS apps and their environment-specific Google OAuth
  clients. The public SDK plists are in `ios/Firebase/<flavor>` and Dart build
  settings in `config/ios/<flavor>.json`. No Android or web Firebase app IDs are
  reused. `scripts/ios/prepare-config.py` rejects crossed environments and stages
  only the matching plist into the app bundle.
- Google iOS client initialization and callback URL scheme; the Web OAuth client
  remains the server client. Sign in with Apple is available on the native iOS
  sign-in and signup screens via Firebase's native nonce-protected provider.
  Apple sign-in requires the Apple/Firebase setup below before it can work.
- Camera/photo purpose strings, Keychain access for persistent tickets, branded
  opaque app icons and launch artwork using the approved Pluto icon.
- App privacy manifest describing account/profile/ticket data and required
  UserDefaults access. It is a starting declaration that must be checked against
  the final archive's aggregated SDK privacy report before submission. Native
  iOS analytics and notification prompts are disabled until their consent/delivery
  implementations are ready. There is no location permission or tracking prompt.
- Universal Link entitlement for each environment's host and the public
  `/.well-known/apple-app-site-association` endpoint. No association is published
  until the real Apple App ID prefix is entered in
  `functions/src/ios-links-config.json`. Routes are restricted to `/app`, `/app/`,
  `/app/tickets`, and `/app/profile`; capability query/fragment values are
  preserved by the shared native router.
- `iOS validation` PR workflow: macOS simulator compilation for both flavors.
  These simulator artifacts cannot be installed on an iPhone or uploaded to
  App Store Connect and contain no signing credentials.

## Build on a Mac

Use the repository's locked Flutter 3.47.5 SDK, Xcode and CocoaPods. CocoaPods is
selected explicitly for the current plugin set. Run from the repository root:

```sh
flutter pub get --enforce-lockfile
python3 -m unittest discover -s scripts/ios -p 'test_*.py'
flutter build ios --simulator --debug --flavor staging --dart-define-from-file=config/ios/staging.json
flutter run --flavor staging --dart-define-from-file=config/ios/staging.json
```

Replace `staging` with `production` in both places for that environment. Never
point a staging bundle at production. Run through Flutter so generated Dart
defines are available to the native configuration check. Open
`ios/Runner.xcworkspace` rather than the bare project when inspecting in Xcode.
Windows cannot compile, sign or run an iOS simulator; GitHub's macOS runners
provide the initial compilation check.

## Once the Apple membership is active

1. Enroll **Pluto Events LLC** as an organization if that is the desired App Store
   seller identity. Membership/account recovery is handled directly with Apple.
2. Share the public **Team ID**, then confirm the **App ID prefix** in Apple's
   identifiers page. They normally match for new accounts, but use the actual
   prefix for website associations. Configure the real team for Runner's signing;
   do not enter a placeholder team in source.
3. Register both explicit bundle IDs from the table. Enable **Sign in with Apple**
   and **Associated Domains** on each App ID. Do not enable push capabilities yet.
4. Enable the Apple provider in each corresponding Firebase Authentication
   project and configure any Apple keys/service IDs that Firebase requires.
   Use separate identifiers for staging and production. Keep Apple private keys,
   distribution certificates and provisioning profiles out of Git and chat.
   Configure Apple's private-email relay for the actual verification/receipt
   sender domains so Hide My Email users can receive Pluto messages.
5. Add the confirmed App ID prefix to `functions/src/ios-links-config.json` for
   each environment and deploy the matching backend. Confirm the association
   response is JSON over HTTPS without authentication or redirects. Rehearse
   cold/warm Universal Links on a physical iPhone; Safari may retain navigation
   in-browser for same-domain taps rather than opening the installed app.
6. Create App Store Connect records matching the existing bundle IDs. Separate
   staging and production records mirror the Android isolation; production
   TestFlight builds use the production backend. Confirm Apple's current
   upload SDK/Xcode requirements before creating a distributable archive.
7. Provision distribution signing and an App Store Connect API key for a future
   manually approved TestFlight workflow. No signed-release workflow has been
   enabled yet. Use main-only validated revisions with successful staging
   evidence; keep signing credentials in protected GitHub environments and clean
   up temporary runner keychains. Do not add these credentials to the public
   Firebase/build config files.

## Before App Store submission

- Replace the existing email-based account deletion route with an in-app
  authenticated deletion flow. Include account-associated data removal,
  permitted retention, completion confirmation and Apple token revocation. This
  is a known submission blocker, not completed by the iOS scaffolding.
- Verify Apple sign-in, Google sign-in, email verification, Hide My Email receipt
  delivery, account linking and deletion on a signed physical-device build.
- Rehearse ticket claiming and QR display, offline wallet persistence after
  restart, scavenger-hunt rewards, profile image selection and payment handoff.
- Provide the existing isolated reviewer account via App Store Connect's review
  details; verify demo mode in the exact submitted iOS build. Keep its password
  out of repository documentation. See `docs/google-play-review-account.md` for
  the shared account enrollment and isolation design.
- Complete App Privacy disclosures using the final app/SDK behavior, and supply
  iPhone/iPad screenshots, support URL, privacy URL and review notes explaining
  that Stripe purchases are for attendance at physical events.
- Native push delivery, APNs credentials and Apple Wallet remain separate
  features. The current app does not promise those features in its store listing.

## Primary references

- [Flutter iOS flavors](https://docs.flutter.dev/deployment/flavors-ios)
- [Flutter iOS deployment](https://docs.flutter.dev/deployment/ios)
- [Google sign-in iOS configuration](https://pub.dev/packages/google_sign_in_ios)
- [Firebase Apple provider](https://firebase.google.com/docs/auth/flutter/federated-auth)
- [Apple account deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
