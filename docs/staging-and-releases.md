# Staging and release safeguards

The code now separates validation from deployment. Pushing or merging no longer automatically deploys production. `PR Checks` runs locked Node/Flutter builds, analysis, unit tests, Firestore/Storage rules, ticketing/rewards/RSVP integrations and Chromium browser regressions on demo emulators. PR jobs have read-only tokens and no deployment secrets. Provider calls are substituted in integration tests; browser CI generates a temporary signing key and never reads local secret files.

Browser CI uses an inert Stripe key fixture because free ticket checkout initializes the SDK before checking the total. It cannot authorize payments. Browser purchases are free/comp/cash or intercepted at the API; real Stripe sandbox purchase/refund/email acceptance stays separate.

The manual `Release` workflow runs from `main`, accepts a full commit SHA already merged into `main`, reruns validation, then rebuilds and deploys that revision to the selected environment. Production additionally requires explicit confirmation, GitHub environment reviewer protections and a completed successful staging release of the same SHA. Deployment status is recorded against the selected revision, including rollback revisions. Success requires deployed project/revision checks and public page/configuration smoke tests. A failed or cancelled deployment is not staging acceptance; inspect the environment for partial changes before retrying.

The deploy command uses `--non-interactive --force` to acknowledge the webhook/email workers' intentional retry policies on first deployment. Firebase's force flag also accepts function deletions and other deployment confirmations, so keep the four named function targets explicit and review changes to their identities, regions and triggers. The flag does not bypass the project, revision, staging-evidence or GitHub environment guards. Retried executions incur normal execution charges; permanent failures need operational review.

Local validation passed unit and release-policy tests, Flutter analysis/tests, demo and synthetic staging builds, workflow syntax, all eight browser suites across focused runs, and the ticketing/rewards/Storage/rental/waiver emulator checks. These results validate the source safeguards. No GitHub-hosted workflow or cloud release has run yet; complete the setup below before the first staging deployment.

## Projects and isolation

| Environment | Project | Site | Payment mode |
| --- | --- | --- | --- |
| Staging | `pluto-staging-92eb7` | `https://pluto-staging-92eb7.web.app` | Stripe sandbox only |
| Production | `pluto-9b6ca` | `https://pluto.events` | Sandbox initially; live requires explicit launch approval |

Project IDs and initial site URLs are defined in `functions/src/deployment-projects.json`. Commands always pass an explicit project; staging never falls back to `.firebaserc`'s production default. SSR sign-in, Flutter, Storage uploads, notification configuration, worker configuration and email links use the selected environment. Staging refuses production credentials/public Firebase configuration, disables Analytics and digital wallets, and sends `noindex` headers. These headers do not make staging private: use synthetic attendee data and keep admin/scanner authentication enabled.

Separate projects are the Firebase-recommended way to isolate environments; a Hosting preview channel inside production shares production backend resources. [Firebase environment guidance](https://firebase.google.com/docs/projects/dev-workflows/general-best-practices).

Flutter push permission prompts/token registration are disabled in staging and demo emulators. Production retains its current VAPID key. Enabling staging push later requires its own Firebase Messaging web push key and a corresponding environment-specific build setting; do not reuse the production VAPID key.

## One-time cloud setup (not performed by this source change)

1. In the staging Firebase console, register a **web app**. Copy its public web configuration object. Enable Email/Password authentication, Firestore in Native mode and Storage. Add the staging Hosting domain to Auth's authorized domains. Use the same database location as intended for the application and enable billing required for Functions, Eventarc and Scheduler.
2. Create a dedicated deployment service account **inside each project**, with deployment permissions for Hosting, Firestore rules/indexes, Storage rules, Cloud Functions and its build/Eventarc/Scheduler dependencies, and permission to act as the chosen runtime service account. Index deployment additionally needs **Cloud Datastore Index Admin** (`roles/datastore.indexAdmin`); see [index permissions](https://firebase.google.com/docs/firestore/query-data/indexing). Follow [Firebase CI authentication](https://firebase.google.com/docs/cli#cli-ci-systems) and your project's IAM policy. Restrict each account to its project. Do not reuse the production service account for staging. The workflow rejects JSON with a different project ID; IAM restrictions must also be applied in Google Cloud.
3. Provision these secrets in **staging's** Secret Manager: `STRIPE_RESTRICTED_KEY` (sandbox), `STRIPE_WEBHOOK_SECRET`, `TICKETING_SIGNING_KEY` (separate Ed25519 key) and `RESEND_API_KEY`. Each deployed ticketing function currently binds all four. Keep keys in Secret Manager; do not commit them or paste them into chat. Production keeps its own values. Do not reuse production ticket signing material, customer records, tickets or wallet issuer credentials in staging.
4. Set the staging Stripe sandbox webhook destination to `https://pluto-staging-92eb7.web.app/tickets/webhook` and subscribe to the event types accepted by `functions/src/ticketing/routes.ts`. Use **that endpoint's** signing secret, not a Stripe CLI listener secret. Restrict the sandbox API key to the integration's necessary PaymentIntent/Checkout/refund/Tax/balance permissions. Complete a real sandbox purchase, webhook fulfillment, duplicate delivery, refund and email delivery test after deployment; CI does not prove external delivery.
5. Use a staging-specific Resend key/domain and only controlled test recipients. Cloud staging processes email jobs; it is not the preview server. Apple/Google Wallet exports remain disabled while issuer setup is pending.
6. Create the initial staging administrator deliberately in staging Auth and its `adminUsers` document. Do not run local `seed-preview.cjs` against cloud; it only targets demo emulators. Firestore client rules prevent ordinary users from granting themselves staff access.

## GitHub setup

Optional delivery monitoring: leave `TICKETING_RESEND_WEBHOOK_ENABLED` unset/false until the selected project's `RESEND_WEBHOOK_SECRET` and runtime access are configured. Set it to true only in that GitHub environment, then release. It adds the signing secret solely to `publicSite`; wallet credentials remain separately optional. Follow [ticketing operations setup](ticketing-operations.md) for the endpoint, delivery tests and Cloud Monitoring notification channels.

Optional signing-key rotation: leave `TICKETING_KEY_ROTATION_ENABLED` unset/false for the compatibility release. Enable it separately per environment only after provisioning `TICKETING_VERIFICATION_KEYRING` and `TICKETING_SCANNER_PIN_KEYS`. Follow the [signing-key rotation runbook](ticket-signing-key-rotation.md) to distribute both verifiers before switching the active signer; do not simply replace `TICKETING_SIGNING_KEY`.

Create environments named **`staging`** and **`production`** in repository Settings → Environments. Restrict deployment branches to selected branch **`main` only** for both. Protect production with required reviewers, **prevent self-review**, and disable administrator bypass. The production preflight verifies those settings and fails closed if they are unavailable. GitHub plan/repository visibility affects reviewer protection availability; confirm the repository supports it before a production release. [GitHub environment settings](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

Set these values **inside each environment**, not globally:

| Name | Kind | Staging value |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` | Variable | `pluto-staging-92eb7` |
| `FIREBASE_WEB_CONFIG` | Variable | Complete public web configuration JSON from staging Firebase; omit `measurementId` |
| `TICKETING_MODE` | Variable | `test` |
| `STRIPE_PUBLISHABLE_KEY` | Variable | Staging `pk_test_…` key |
| `FIREBASE_DEPLOY_SERVICE_ACCOUNT` | Secret | Staging deployment account JSON |

`FIREBASE_WEB_CONFIG` accepts only `apiKey`, `appId`, `messagingSenderId`, `projectId`, `authDomain`, `storageBucket` and optional production `measurementId`. Use the Firebase-provided bucket (`.appspot.com` or `.firebasestorage.app`), not a guessed name. Production gets its corresponding project, web config, public Stripe key and separate deployment secret. Remove the old repository-wide `FIREBASE_SERVICE_ACCOUNT_PLUTO_9B6CA` after migration is confirmed; the new workflows do not read it. Do not upload `.env` files, credentials or runtime secret values as artifacts.

Protect **`main`** with a ruleset: require pull requests, a reviewer, resolved discussions and an up-to-date required check **`validation / Application, rules and browser checks`** (select the exact name GitHub shows after the first PR run). Block force pushes and deletions; minimize bypass access. Enable merge queue only after verifying the `merge_group` run. Consider code-owner review for workflows, rules and deployment helpers. These repository protections must be configured in GitHub; a workflow file alone does not enforce merge policy.

## First staging release

1. Open/review the native-ticketing PR and let `PR Checks` finish. Merge into protected `main` after the one-time setup.
2. Copy the merged commit's full SHA. In Actions → **Release**, choose workflow branch `main`, environment `staging`, that SHA, and leave live payments unchecked. Staging refuses `live` even if the checkbox is selected.
3. Inspect the release manifest and smoke results. Open the staging site and confirm Auth, event publishing/flyer uploads, the in-app wallet, sandbox checkout, emails, workers, PIN admission, RSVP approvals, guest lists, transfers and staff-specific access. Test on actual gate phones. Do not consider the read-only smoke check equivalent to this acceptance run.
4. Record the successful staging release and acceptance results. Production can promote that exact SHA only after the staging workflow has finished successfully. The production workflow requires confirmation `deploy pluto-9b6ca`, a reviewer, and the corresponding environment settings.

Bank setup is still pending: keep production `TICKETING_MODE=test` and leave live payments unchecked. Switching the environment variable to `live` also requires a matching public key, independently provisioned live secrets/webhook, bank/account readiness, policies, real provider acceptance and explicit workflow approval. A production sandbox site is not ready to accept real paid orders.

## Rollback and recovery

Keep the last known good release SHA and manifests. Run **Release** from current `main` with that older full SHA: staging first if it lacks successful release evidence, then production after reviewer approval. It reruns validation and deploys the backend, workers, Flutter client, public assets and rules together. The rollback SHA must contain this release tooling and remain compatible with today's Firestore data. Very old revisions without these safeguards are not supported rollback targets.

Firebase deployment is not atomic. If a step fails, inspect Functions/Hosting/rules versions and rerun the safe release or roll back promptly. Do not restore a Firestore backup merely to undo code: it can erase new orders, refunds and admission records. Restore requires a separate rehearsed reconciliation procedure. Never rotate signing keys as part of rollback; issued tickets rely on those keys. Before live sales, configure scheduled backups, alerts for failed webhook/email jobs and delayed maintenance, and rehearse a compatible rollback and recovery.

For an emergency sales stop, set production `TICKETING_MODE=test`, use the matching sandbox public/provider secrets and redeploy a safe revision through the release workflow; existing live orders still require their live reconciliation path, so prefer pausing/unpublishing affected event sales via admin when appropriate. Changing payment modes is not a substitute for resolving outstanding live payment/refund jobs.
