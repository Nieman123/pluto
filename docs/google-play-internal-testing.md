# Install and update Pluto through Google Play

Use Google's **Internal testing** track for the current testing group. Testers
join once using their Google account, install from Play, and receive normal Play
updates afterward. Automatic updates depend on the phone's Play settings and
Google's processing; they are not an immediate push to the device.

Keep the two existing app identities separate:

| Console app | Package established by the first upload | Backend |
| --- | --- | --- |
| Pluto Events Staging | `events.pluto.app.staging` | Staging / sandbox |
| Pluto Events | `events.pluto.app` | Production |

Start with **Pluto Events Staging**. The production app can be created later.
Testing apps use the same identities that will receive subsequent updates; do
not change their package names. This workflow publishes only internal tests.
Public store rollout and its remaining launch gates are a separate milestone.

## 1. Create the staging app and first internal release

In [Play Console](https://play.google.com/console):

1. Select **Create app**.
2. Name: **Pluto Events Staging**. Default language: **English (United States)**.
3. Select **App** and **Free** (the app download is free).
4. Review and complete the Console declarations yourself.
5. Open **Test and release → Testing → Internal testing**.
6. Create an email tester list with the Google-account emails of your testing
   group, including your own. Select that list for the track.
7. Create the first release and upload the **signed staging `.aab`**. Do not use
   the APK or the unsigned validation bundle from PR checks.
8. Enroll in **Play App Signing**, allowing Google to generate the app signing
   key. Keep Pluto's separate upload key for subsequent uploads.
9. Review the release and start its internal rollout. Resolve any Console setup
   requirements it identifies. The first release is completed in the Console
   before automated publishing is enabled, avoiding draft-app API restrictions.
10. Copy the tester opt-in link and send it to the group. Each person opens it
    while signed into an email on the tester list, joins, and installs from Play.

The normal staging opt-in URL is
`https://play.google.com/apps/testing/events.pluto.app.staging`; use the link
shown by Console once the first release is available. Initial availability can
take longer than later updates. Internal testing supports up to 100 testers.

A Play-installed app uses Google's app signing certificate. It cannot update a
locally sideloaded app signed with our debug key. Uninstall the old staging APK
once, then install from Play and sign in again. Account tickets remain on the
server; retain secure recovery links for any guest-only purchases before
removing the old installation.

## 2. Register the actual Play app signing certificate

In the staging app's **App integrity / App signing** page, locate the **App
signing key certificate**, not the upload key certificate. Copy its SHA-1 and
SHA-256 fingerprints.

- Add both fingerprints to the staging Android app in Firebase project
  `pluto-staging-92eb7` (package `events.pluto.app.staging`). Confirm Google Auth
  has the corresponding Android OAuth client; retain the existing Web client ID.
- Add the Play **SHA-256** to the staging `sha256` list in
  `functions/src/android-links-config.json`. Keep the local debug fingerprint so
  local builds continue to work. Commit/deploy that public configuration.
- Repeat for the production app/project when it is enrolled. Production's list
  is currently empty until its Play signing certificate is known.

The upload certificate, debug certificate, Play app signing certificate and
ticket Ed25519 signing keys have different jobs. Google signs installed apps;
the upload key authorizes our `.aab` submissions. Neither key goes in the ticket
verification keyring.

Public certificate fingerprints can be shared here for help configuring app
links. Private keys, passwords and service-account JSON must stay out of chat.

## 3. Keep and back up the upload key

The prepared local staging upload key is under the ignored directory
`D:/git/pluto/android-credentials/staging/`. Back up that directory in secure
storage before relying on CI. It contains private credentials; it is excluded
from Git and CI artifacts.

| File | Use |
| --- | --- |
| `upload.jks` | Private Android upload keystore |
| `keystore-base64.txt` | Exact GitHub keystore secret value |
| `store-password.txt` | GitHub keystore password secret |
| `key-password.txt` | GitHub upload-key password secret |
| `upload-certificate.pem` | Public upload certificate |
| `public-info.json` | Public upload SHA-1/SHA-256 and alias |

If creating a separate production upload key later, set `JAVA_HOME` to JDK 21
and run:

```powershell
node scripts/android/generate-upload-key.mjs production
```

The generator refuses to overwrite an existing key. Do not regenerate keys for
each release. If an upload key is lost or compromised, follow Play Console's
upload-key reset procedure; this is separate from Google's app signing key.

## 4. Add Android secrets to the existing GitHub staging environment

Open **Repository Settings → Environments → staging**. Add:

| Environment secret | Value |
| --- | --- |
| `ANDROID_UPLOAD_KEYSTORE_BASE64` | Contents of `keystore-base64.txt` |
| `ANDROID_UPLOAD_STORE_PASSWORD` | Contents of `store-password.txt` |
| `ANDROID_UPLOAD_KEY_PASSWORD` | Contents of `key-password.txt` |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Complete dedicated publisher JSON from step 5 |

Add the environment variable **`ANDROID_UPLOAD_CERT_SHA256`**, using the upload
SHA-256 in `public-info.json` (colon-separated fingerprint). Alias defaults to
`pluto-upload`; `ANDROID_UPLOAD_KEY_ALIAS` can be set as an environment variable
if a different alias was deliberately used.

To copy a private value locally without printing it in the terminal:

```powershell
Get-Content -LiteralPath ./android-credentials/staging/keystore-base64.txt -Raw | Set-Clipboard
```

Paste into the matching GitHub secret box. Repeat for the two password files.
These are GitHub environment secrets, not Firebase runtime/Secret Manager keys.
Use separate values in GitHub's **production** environment when ready.

## 5. Configure the dedicated Google Play publisher

In Google Cloud, select **pluto-staging-92eb7**:

1. Enable the **Google Play Android Developer API** (`androidpublisher.googleapis.com`).
2. Create a service account with ID **`github-play-publisher`**. Its email will
   be `github-play-publisher@pluto-staging-92eb7.iam.gserviceaccount.com`.
3. This publisher does not need the Firebase deployer's project IAM roles.
   Play permissions are granted separately below.
4. Create/download its JSON key and store the complete JSON in GitHub staging's
   `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` environment secret.

Grant **Service Account Token Creator on the publisher itself**, which our
Google authentication action requires to mint an OAuth access token. Run in
Cloud Shell or a terminal authenticated as a project administrator:

```powershell
gcloud iam service-accounts add-iam-policy-binding github-play-publisher@pluto-staging-92eb7.iam.gserviceaccount.com --project=pluto-staging-92eb7 --member=serviceAccount:github-play-publisher@pluto-staging-92eb7.iam.gserviceaccount.com --role=roles/iam.serviceAccountTokenCreator
```

This binding is on the individual service account, not the whole project. Allow
about five minutes for permissions to propagate. Repeat for the production
publisher with `pluto-9b6ca` when configuring that environment. Missing this
binding causes `iam.serviceAccounts.getAccessToken` to be denied even when the
Play Console permissions are correct.

In Play Console **Users and permissions → Invite new users**:

1. Invite the service account's email.
2. Grant app access to **Pluto Events Staging** only.
3. Grant **View app information (read-only)** and **Release apps to testing
   tracks**. Permission labels can vary slightly; the publisher needs to read
   versions and release to the internal test track.
4. Do not grant account administrator, financial/orders, or production-track
   release permissions for this automation. Save/invite the account.

Google no longer requires linking the developer account to a Cloud project on
the old API access screen. Enabling the API and inviting the service account
with Play app permissions is the relevant setup.

For production internal testing, repeat with a dedicated account of the same ID
in **pluto-9b6ca**, app access to **Pluto Events**, and its own GitHub production
secret. The release policy rejects credentials from the wrong environment or
the existing Firebase deployment account.

## 6. Run the first automated update

After these workflow changes are merged into `main`, and the selected SHA has a
successful staging website/backend deployment:

1. Open GitHub **Actions → Android internal testing → Run workflow**.
2. Select branch **main**, environment **staging**, operation
   **publish-internal**, and the full deployed commit SHA.
3. The workflow validates the revision, builds/signs its release bundle, checks
   the signing certificate and 16 KB native libraries, and uploads to Play.
4. The artifact includes the signed AAB and public release manifest. The public
   `play-result.json` confirms the committed version and tester link.
5. Check Play Console and the phone's Play app for the update. Google processing
   can delay availability; a successful commit is not a promise of instant installation.

The **build-only** operation produces a signed first-upload artifact without
requiring Play publisher credentials. It uses the same upload certificate and
needs the three signing secrets and fingerprint variable.

CI version codes start above 1,000,000 and increase with workflow run/attempt.
The bundle build and release manifest use the current bundle job's attempt,
including when only failed jobs are retried. Older workflows before this fix
must use **Re-run all jobs** so cached selection outputs are refreshed; rerunning
only the bundle job can produce a version mismatch. This fix requires selecting
a revision that contains `scripts/android/build-version.mjs`.
The local bootstrap uses version 2. Re-running an older workflow after a newer
version has shipped is rejected. To ship an older source revision, start a new
workflow run with that merged SHA and ensure its backend evidence is valid.
Keep this workflow's identity/counter when maintaining the release pipeline.

Production internal updates are manual, retain the existing production approval
policy, and require the same successful staging SHA. They remain private tests;
the workflow cannot upload to Google's production track.

## 7. Turn on automatic staging updates

After the first manual automated update succeeds, add a **repository variable**
(Settings → Secrets and variables → Actions → Variables):

```text
ANDROID_STAGING_AUTO_PUBLISH=true
```

Now a successful staging **Release** workflow triggers an internal Play update
for that exact deployment SHA. It reuses the upstream release's full validation,
then performs its own native build, signing and bundle checks. Production
website deployments, failed runs, fork runs and unsigned PR bundles never
trigger a staging Play publication. Disable the repository variable to stop
automatic uploads. No additional SMS/email distribution is involved.

Publishing cannot run until the app, first internal release, signing credentials
and publisher permissions are configured. The current code work prepares the
pipeline; it does not create Console apps, accept Console declarations, enroll
testers or claim a real upload succeeded.

## References

- [Internal testing setup and tester access](https://support.google.com/googleplay/android-developer/answer/9845334?hl=en)
- [Create a Play Console app](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en)
- [Publisher API/service-account setup](https://developers.google.com/android-publisher/getting_started)
- [GitHub Google authentication and token-creation permissions](https://github.com/google-github-actions/auth#inputs-service-account-key-json)
- [Play App Signing and upload keys](https://developer.android.com/studio/publish/app-signing)
- [Bundle upload API](https://developers.google.com/android-publisher/api-ref/rest/v3/edits.bundles/upload)
- [Edit commit and preserving an existing review](https://developers.google.com/android-publisher/api-ref/rest/v3/edits/commit)
