# Ticket signing key rotation

Tickets and orders remain authoritative database records. Rotation replaces signed QR credentials, never ticket IDs, versions, ownership, inventory, payments or check-in history. Existing account, order and transferred-holder endpoints generate current credentials on each successful request; the app caches the refreshed response. An offline holder must reconnect to refresh after emergency revocation.

## Configuration

Compatibility deployment requires no new secrets. Leave `TICKETING_KEY_ROTATION_ENABLED` unset/false and the existing `TICKETING_SIGNING_KEY` unchanged. Legacy `PLUTO1` tickets, `PLUTO-OFFLINE1` preparation proofs and scanner PINs continue working.

Enable rotation separately in the staging and production GitHub environments, using the non-secret variable `TICKETING_KEY_ROTATION_ENABLED=true`, only after provisioning both new secrets in the matching Firebase project's Secret Manager. Release preparation passes the flag to all ticketing functions; it never copies secret values into GitHub variables or build artifacts.

| Secret | Contents |
| --- | --- |
| `TICKETING_SIGNING_KEY` | Current private Ed25519 PKCS8 DER key, base64 encoded; unchanged for preparation, replaced for activation. |
| `TICKETING_VERIFICATION_KEYRING` | JSON below; contains public verification keys only. |
| `TICKETING_SCANNER_PIN_KEYS` | Independent random HMAC keys and optional temporary legacy PIN migration material. |

Public verification keyring:

```json
{
  "version": 1,
  "activeKeyId": "k2",
  "legacyKeyId": "legacy-k1",
  "keys": {
    "legacy-k1": { "kty": "OKP", "crv": "Ed25519", "x": "PUBLIC_KEY_BASE64URL" },
    "k2": { "kty": "OKP", "crv": "Ed25519", "x": "PUBLIC_KEY_BASE64URL" }
  },
  "revokedKeyIds": []
}
```

The key ID is signed inside `PLUTO2` / `PLUTO-OFFLINE2` credentials; the signature also binds the credential prefix/purpose. Unknown, revoked and malformed keys fail closed. `legacyKeyId` permanently identifies the original untagged credentials; never repoint it to a newer key. Set it to null only when legacy credentials must no longer be accepted. Do not reuse a key ID for different key material. Private `d` fields are rejected in verifier configuration. The active ID must match the configured signing private key and cannot be revoked.

PIN configuration:

```json
{
  "version": 1,
  "activeKeyId": "pin-k1",
  "keys": { "pin-k1": "INDEPENDENT_RANDOM_32_BYTE_SECRET_BASE64" },
  "legacySigningKey": "ORIGINAL_PRIVATE_PKCS8_BASE64_TEMPORARY"
}
```

`legacySigningKey` is sensitive private material retained **only** because existing PIN hashes used its DER bytes as their HMAC key. It is never used to sign new tickets. Remove it once all legacy PINs have migrated, expired, been revoked or been regenerated. Until removal, the original signing private key has not been fully retired. Existing PIN sessions use independent opaque tokens and survive ticket key rotation. New PINs use the independent active HMAC key; successful legacy login adds the new lookup transactionally without storing the PIN. Generation checks every configured lookup key to avoid duplicate short codes. Previous independent PIN keys can be retained in `keys` during a separate PIN-secret rotation, then removed after migration/expiry.

## Prepare files without changing a deployment

Use separate folders and credentials for each environment. First export that project's current signing secret to an ignored file using a trusted local machine. For staging, in PowerShell:

```powershell
New-Item -ItemType Directory -Force tmp/key-input-staging | Out-Null
gcloud secrets versions access latest --secret=TICKETING_SIGNING_KEY --project=pluto-staging-92eb7 --out-file=tmp/key-input-staging/current-key.txt
npm run ticketing:rotation:prepare -- --environment staging --current-key-file tmp/key-input-staging/current-key.txt
```

For subsequent rotations, also export the current keyring and PIN configuration from the **same project**, and supply `--keyring-file PATH --pin-keys-file PATH`. This preserves all still-trusted historical public keys and independent PIN keys. The generator checks the current private key against the existing active key ID. Use the actual production project ID when preparing production; never copy staging key files to production.

The generator creates a unique ignored folder under `tmp/ticket-key-rotation/` containing:

- `prepare-keyring.json`: old active signer plus both public verifiers.
- `activate-keyring.json`: new active signer plus historical public verifiers.
- `active-signing-key.txt`: new private signing key.
- `scanner-pin-keys.secret.json`: independent PIN configuration, including legacy migration material for the first planned rotation.

It prints paths only, performs no cloud writes and never overwrites the active local secret. `/tmp/` is Git-ignored. File modes request owner-only access on supporting platforms; on Windows, use a restricted local directory because POSIX modes do not replace NTFS permissions. Do not upload these files as CI artifacts or paste their contents into chat. Delete local private exports securely according to your workstation policy after provisioning. Keep the current secret available securely until the migration is verified.

## Planned rotation sequence

1. Deploy compatibility code with the flag **false**. Verify that existing tickets and scanner PINs work. Wait for deployment completion before enabling versioned signatures.
2. Provision `TICKETING_VERIFICATION_KEYRING` with `prepare-keyring.json` and `TICKETING_SCANNER_PIN_KEYS` with the generated PIN file. Keep `TICKETING_SIGNING_KEY` at its current value. Grant runtime service accounts Secret Accessor on the new secrets, and the dedicated deployer the same secret-management permissions used for existing deployment secrets.
3. Set the matching GitHub environment variable `TICKETING_KEY_ROTATION_ENABLED=true` and release. Verify the old active signer and both verifiers are present. Refresh scanners' offline preparation while online; manifests now include both public keys. This is required even for scanners with a still-valid old cached manifest.
4. Add new Secret Manager versions using `active-signing-key.txt` for `TICKETING_SIGNING_KEY` and `activate-keyring.json` for `TICKETING_VERIFICATION_KEYRING`. Redeploy every function bound to ticketing secrets together. The previous prepared revision already trusts the new key, so requests to either revision remain compatible during rollout. Mismatched private/public active configuration fails closed.
5. Verify old QR scans, new QR scans, PIN login, existing sessions, offline replay and duplicate protection. Account/order/holder reloads obtain newly signed QRs for the same tickets. Refunded, transferred, cancelled and already-admitted tickets remain subject to the ledger checks.
6. Keep historical public verifiers until **every affected ticket's final admission window** and all associated offline proof/replay/review work have ended. Do not use an arbitrary 30-day grace period if future events still have tickets. Scanner preparation leases last up to 24 hours for account staff or 4 hours for PIN staff; automatic replay is allowed for 48 hours after the lease, and outstanding manager conflicts also need resolution before verifier removal.
7. Migrate remaining legacy PINs by successful login, or revoke/regenerate them. The event's Scanner PIN panel reports active legacy PINs and marks them **Needs migration**. Check every event with active PINs; PIN records store their lookup key ID after creation/migration. Remove `legacySigningKey` from PIN configuration only when no active legacy PINs remain, then release. Disable/destroy obsolete private secret versions according to the retention policy. Retain old **public** verification keys while still needed. Later remove retired public keys (and their entries from `revokedKeyIds`); clear `legacyKeyId` if retiring the original key.

Never switch the flag back to false after changing the signer: that would map all untagged legacy QRs to the current private key and break compatibility. Roll back application code only to a version that supports the enabled keyring. A planned signer rollback can use the previous private key plus matching active key ID if that key remains trusted; preserve all verifiers. Never reactivate a compromised key.

## Emergency revocation

Run the generator with `--emergency` plus the current keyring/PIN files when available. It creates only activation files, revokes the current active signing ID, and removes a legacy PIN fallback that uses that same compromised key. If other keys are affected, add those IDs to `revokedKeyIds` too; they must remain in `keys` while listed as revoked. If the current private key is unavailable, generate a new signer on a trusted machine and construct its matching keyring using the stored public verifiers; the old private key is not needed to preserve ticket records.

Deploy the new signer and revoked keyring to all ticketing runtimes promptly. Confirm the previous revision no longer serves requests, and do not restore revoked keys to resolve customer or door issues. Customers reconnect/reload their ticket in the app. Regenerate unmigrated legacy PINs when their migration material was compromised; independent PIN secrets only need replacement if they were also exposed.

On each door device, reload the scanner page online and choose **Prepare offline admission**. Explicit retired/unknown-key failures leave their original scans in the device queue while the scanner fetches fresh public keys. Queues belonging to prior scanner access are also retained for manager review, never replayed under a different identity. Unresolved ticket/guest records remain blocked on that device across reloads, without granting admission in the server ledger. Authentication, permission, network and unrelated validation failures still stop preparation.

Use **Download offline records** to preserve the queue/proofs for organizer investigation; exports include admission credentials and are for authorized staff. A manager signed in on that same device can reconcile each record in the order dashboard, then use **Archive reviewed scans** with a review note. That action verifies current manager access, saves the original records and note locally, and clears their device holds atomically. It never grants server admission. Archived records remain downloadable from that browser's storage; export them before clearing browser data. Holds are device-local, so other lanes must be coordinated by the organizer during the incident.

**A disconnected scanner cannot receive revocation.** Pause offline admission, reconnect every door device and prepare again before resuming. If reconnection is impossible, use organizer-controlled manual admission rather than claiming the old offline scanner is safe. Already-recorded admissions are not undone. Old offline proofs are rejected on replay, and manager confirmation of unresolved conflicts also checks current key trust, including conflicts created before this deployment. Rejected queues remain available for investigation; staff may manually check in a legitimate ticket from the authoritative order dashboard after verifying the attendee.

Revocation during a multi-revision rollout is not instantaneous: draining old revisions and confirming all door devices refreshed is part of the incident procedure. This implementation does not provide push revocation to disconnected clients or mutate outstanding ticket records in bulk.

## Verification and policy

Use annual planned rotation between events as the initial Pluto policy. Rotate immediately for suspected private-key exposure. Public key visibility and ordinary app releases do not require rotation.

`npm test` covers legacy/versioned credentials, signed key IDs, purpose separation, invalid configuration, emergency revocation, independent PIN lookup and the browser's WebCrypto verifier. `npm run test:ticketing:rotation` runs transactional emulator regressions for original tickets, PIN migration/session continuity, refunds, duplicate admission and offline conflict revocation; it is included in required CI. The scanner browser regression additionally exercises refreshed multi-key preparation and offline scanning. Rehearse planned activation and emergency recovery in staging before changing production secrets.
