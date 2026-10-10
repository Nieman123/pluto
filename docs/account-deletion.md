# Account deletion

Members can delete their account from My Profile → Delete account in Flutter,
or from `/delete-account` on the corresponding website. Both use the same
authenticated backend. `/app/profile/edit` is the separate profile editor.

The member confirms permanence, reauthenticates with their existing provider,
and submits a random completion receipt. The server uses the verified token's
UID and a five-minute authentication window; it ignores supplied UID/email
targets. Apple-linked accounts confirm through Apple even if another provider
is linked. Native iOS uses Firebase's authorization-code revocation API;
website/Android access tokens are revoked through Identity Toolkit. Provider
credentials are never persisted in Firestore or logged. Native Apple revocation
must still be rehearsed on a signed device after Apple/Firebase setup is active.

## Cleanup and retained records

An `accountDeletionRequests/<uid>` marker immediately blocks private API access
and Firestore/Storage writes from existing ID tokens. The worker disables the
Auth user, revokes Firebase sessions, deletes profile subcollections and demo
data, removes staff/offline grants, detaches orders, anonymizes owned ticket
holder details, withdraws waitlist reservations while releasing held capacity,
removes verification/communication content and scavenger-hunt claim details,
then deletes the Firebase Auth user. It does not delete shared events, reward
inventory, financial summaries, or tickets belonging to other people.

Paid order amounts, payer details, payment/refund references, admission audit
records and signed waivers remain restricted operational records. Deletion does
not issue refunds, alter revenue or admission totals, or invalidate previously
issued QR signatures. Account ticket access and recovery links are revoked;
late payment reconciliation still preserves accounting and marks newly issued
passes as belonging to the deleted account without creating a rewards profile.
Copies already downloaded, delivered emails, and processor retention are outside
this account cleanup. Review record retention separately with the business.

The durable worker uses bounded pages, an exclusive lease and idempotent updates.
It resumes after failures through a five-minute maintenance schedule. Completion
is shown in the app/site using a saved random receipt after sign-out. The status
API returns only pending/completed and a timestamp, not personal data. The
minimal marker/receipt hash is kept for completion and stale-session protection;
the temporary email and UID fields are removed at completion.

## Release and operations

- The release workflow deploys `accountDeletionWorker` and
  `accountDeletionMaintenance` along with `publicSite` and the updated rules.
- The runtime service account for these functions and `publicSite` needs Firebase
  Authentication management (for example `roles/firebaseauth.admin`) and the
  existing Firestore read/write permissions. This is the function runtime
  identity, not just the GitHub deployment identity. If deletion stays pending,
  inspect worker logs and the request's `lastErrorAt`/phase; never mark it
  completed manually before cleanup has finished.
- Use throwaway **staging** accounts first: email/password, Google, then Apple
  once configured. Confirm status, sign-in refusal, profile/photo/points removal,
  held capacity release, preserved transferred tickets and financial totals.
- Test a closed browser and an interrupted worker. A pending request must retry;
  completion must not sign out a different account using the same device.
- Public policy text describes the same deletion and retention behavior. Google
  Play's deletion URL remains `https://pluto.events/delete-account`.

Automated coverage includes real Auth/Firestore emulator deletion, multi-page
resumption, ownership/confirmation checks, old-token rule enforcement, profile
editing widgets and browser flows. No real users are deleted by tests.
