# iOS builds and TestFlight from GitHub Actions

You do not need a local Mac. **iOS TestFlight** uses a GitHub macOS runner with
Xcode 26.3, the iOS 26 SDK and Flutter 3.47.5 to build, sign, verify and upload
an iPhone/iPad `.ipa`. Uploads become available in App Store Connect after
Apple processes them; choose the processed build for TestFlight or your App
Review submission. This workflow does not submit or publish an App Store release.

| Environment | App Store Connect app / bundle ID | Backend |
| --- | --- | --- |
| production | Pluto Events / `events.pluto.app` | `pluto-9b6ca` |
| staging | Pluto Events Staging / `events.pluto.app.staging` | `pluto-staging-92eb7` |

Start with production if you want the build for your current App Store listing.
Use the already-tested Apple reviewer email/password in review details. Secrets
and passwords are kept out of this document and Git. No new Firebase or Stripe
keys are needed for this workflow.

## 1. Confirm your public Apple identifiers

In [Apple Developer account](https://developer.apple.com/account), open
**Membership details** and copy **Team ID**. Confirm the organization is Pluto
Events LLC. In **Certificates, Identifiers & Profiles → Identifiers**, confirm
the App ID for each bundle above enables **Sign in with Apple** and **Associated
Domains**. The already-confirmed App ID prefix is `W9Z7U26894`.

The Team ID and App ID prefix usually match, but enter the values Apple actually
shows. The workflow validates both against the downloaded provisioning profile.

## 2. Create an Apple Distribution certificate on Windows

The helper uses Python and OpenSSL, including the OpenSSL bundled with Git for
Windows. Run from `D:\git\pluto`:

```powershell
python scripts/ios/create-signing-files.py csr
```

Choose and remember the local private-key password. The helper creates:

- `ios-credentials/distribution.csr` — upload this to Apple.
- `ios-credentials/distribution-private.key` — encrypted private key; keep it
  locally with its password. It is not uploaded to Apple or committed to Git.

In Apple Developer → **Certificates, Identifiers & Profiles → Certificates → +**,
choose **Apple Distribution**, upload `distribution.csr`, and download the issued
certificate. Save it as `ios-credentials/distribution.cer`. This signing certificate
is separate from the Sign in with Apple authentication key.

```powershell
python scripts/ios/create-signing-files.py p12 --certificate=ios-credentials/distribution.cer
```

Enter the private-key password from the CSR step, then choose a new P12 password.
The helper creates `ios-credentials/distribution.p12`; retain that P12 password
for the GitHub secret below. One organization distribution certificate may sign
both apps; each app still needs its own provisioning profile.

```powershell
python scripts/ios/create-signing-files.py encode --file=ios-credentials/distribution.p12
```

The resulting `.base64.txt` file contains the secret value to paste into GitHub;
use the entire file contents, not its path. Keep the original key/certificate
files in a secure backup. Reuse a matching existing P12 if you already have one;
there is no need to issue another certificate.

## 3. Create the App Store Connect provisioning profile

Apple Developer → **Certificates, Identifiers & Profiles → Profiles → +**:

1. Under **Distribution**, choose **App Store Connect**.
2. Choose the exact App ID: `events.pluto.app` for production.
3. Select the Apple Distribution certificate issued in step 2.
4. Name the profile `Pluto Events Production App Store`, generate and download it.
5. Save it as `ios-credentials/production.mobileprovision`.

For staging, repeat with `events.pluto.app.staging`, a separate profile name and
`ios-credentials/staging.mobileprovision`. Generate the profile after enabling
Apple sign-in and Associated Domains. Development/ad hoc profiles cannot be
uploaded to TestFlight. Device registration is not needed for App Store profiles.

```powershell
python scripts/ios/create-signing-files.py encode --file=ios-credentials/production.mobileprovision
```

## 4. Create an App Store Connect Team API key

In [App Store Connect](https://appstoreconnect.apple.com), open
**Users and Access → Integrations → App Store Connect API → Team Keys**.
Request API access first if Apple shows that option. Generate a key named
`GitHub TestFlight` with **App Manager** access. Copy its public **Key ID** and
the page's **Issuer ID**, then download `AuthKey_<KEY_ID>.p8`.

Apple permits downloading the private key once. Keep it securely. This is an
**App Store Connect** key, separate from any Sign in with Apple `.p8` key.
Team keys have access across the team's apps; they are not app-specific. Use a
Team key for this workflow, which authenticates uploads with key ID + issuer ID.

## 5. Add GitHub environment variables and secrets

Repository **Settings → Environments → production**. Add these environment
**variables** (public values):

| Variable | Value |
| --- | --- |
| `IOS_TEAM_ID` | Team ID from Membership details |
| `IOS_APP_ID_PREFIX` | `W9Z7U26894` |
| `ASC_KEY_ID` | Team API Key ID from step 4 |
| `ASC_ISSUER_ID` | Issuer ID from step 4 |

Add these environment **secrets**:

| Secret | Value |
| --- | --- |
| `IOS_DISTRIBUTION_P12_BASE64` | Contents of `distribution.p12.base64.txt` |
| `IOS_DISTRIBUTION_P12_PASSWORD` | P12 password chosen in step 2, not the CSR-key password |
| `IOS_PROVISIONING_PROFILE_BASE64` | Contents of `production.mobileprovision.base64.txt` |
| `ASC_PRIVATE_KEY_P8` | Complete text of the downloaded `.p8`, including BEGIN/END lines; no base64 encoding |

Keep the existing production reviewer protection, main branch restriction and
`PRODUCTION_APPROVAL_POLICY=solo-maintainer`. Production still requires your
manual environment approval. For staging builds, add the same public team/API
identifiers and distribution P12 to **staging**, but use the staging provisioning
profile for `IOS_PROVISIONING_PROFILE_BASE64`. There is no need for Google Cloud
Secret Manager entries for these iOS build-only credentials.

## 6. Run the first upload

After this workflow PR is merged, it appears under **Actions → iOS TestFlight**.
Use a full merged SHA containing this workflow and its helpers. Uploads require
a completed, successful **Release → staging** run for that exact SHA. Merging
to main starts this staging release automatically; wait for its successful
completion before uploading. Manual staging retries/rollbacks also qualify. Production
approvals are checked again before credentials are imported.

Click **Run workflow**:

- Branch: `main`
- Environment: `production`
- Operation: `upload-testflight`
- Revision: the full 40-character, staging-validated main commit SHA

Approve the pending production environment deployment. The job imports the
certificate into an isolated keychain, validates the profile and native
capabilities, builds the signed archive, verifies the IPA's identity/signature,
then validates and uploads it with Apple's command-line tool. Each workflow run
and retry gets a distinct build number; Apple cannot accept reusing an already
uploaded build number. Artifact names include the environment, run and attempt.

Use **build-only** to test signing and download a signed IPA without uploading;
it still requires a merged main SHA and production environment approval.

Once Apple processing completes, open **App Store Connect → Pluto Events →
TestFlight**. For App Review, select that processed build in the app's version
page. The current app version in `pubspec.yaml` is **1.0.0**; use the corresponding
App Store version record. TestFlight distribution and final review submission
are separate actions from the upload.

## Checks and troubleshooting

- Profile identity/capabilities error: recreate the App Store Connect profile
  for the exact app and distribution certificate after enabling both capabilities.
- Certificate/P12 error: use the matching CSR private key and P12 password. The
  runner installs Apple's public WWDR G3 intermediate for Windows-created P12s.
- Missing staging evidence: deploy that exact SHA to staging successfully first.
- API key error: use the App Store Connect Team key, not the Apple login key.
- Successful upload but no visible build: wait for Apple processing and check
  any processing email/error in App Store Connect. A successful upload alone does
  not confirm review acceptance or public availability.

The first signed-device build must still be exercised on iPhone/iPad: Apple and
Google sign-in, account deletion, tickets/QRs, browser checkout return and the
reviewer demo account. Simulator validation does not verify device signing.

References: [Apple upload tools](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/),
[App Store profiles](https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile),
[App Store Connect API keys](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/),
[Apple SDK requirements](https://developer.apple.com/news/upcoming-requirements/),
[GitHub signing on macOS](https://docs.github.com/en/enterprise-cloud%40latest/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications).
