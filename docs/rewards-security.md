# Server-authoritative Pluto Points

The signed-in app submits event QR codes and reward item IDs to `/tickets/api/rewards/claim` and `/tickets/api/rewards/redeem`. Firebase bearer authentication determines the account; a body UID cannot select another account. Scanner PINs and guest ticket credentials do not authorize rewards.

The server reads current QR/reward configuration, computes awards and costs, and transactionally writes balances, attendance, inventory, rate counters and immutable transaction records. Claims allow one award per account and event QR, with a 30-second cooldown and ten successful claims per UTC day. Optional start/expiry dates and claim capacity are server-checked. Attendees cannot list all configured QR codes through Firestore; administrators retain configuration and reporting access. Presenting a shared event QR is still not proof of physical attendance.

Each app action retains a random retry key until a confirmed success or definite business rejection. Network failures, server failures, authentication loss and throttling retain the key. Repeating that key retrieves the recorded award/debit instead of applying it again, including after a web reload. A deliberate purchase after confirmed success gets a new key. Native storage is currently in memory, so restarting the installed app loses an uncertain attempt; web is the supported initial release scope. Do not advertise installed-app reward retry guarantees until secure persistence is implemented.

Firestore rules permit personal profile updates and zero-balance profile creation. Balances, attendance, points transactions, redemption creation, claim records and claim counters are server-only. Reward catalog admins may change inventory/configuration; QR claim totals and settled points ledgers remain protected. Admin redemption fulfillment may change only status/notes/timestamps, without altering the original cost or resulting balance.

## Deployment and historical balances

Deploy the new backend before switching clients to these APIs, then publish the migrated client and restrictive rules as one coordinated release. Test the complete combination on isolated staging before paid/economic use. Older clients will lose direct award/debit permission after rule deployment and must update. Existing production rules remain unchanged until deployment; local verification does not secure the live project by itself.

Existing balances, claims and rate counters originated under client-writable rules. This change prevents future forgery after deployment but cannot attest to old records. Review existing accounts and establish trusted opening balances before offering economically valuable rewards. Preserve legitimate history and record any correction through an audited server migration; no production balances were reset during this work. Malformed balances or counters are held for support instead of silently coerced.

Claim receipts (`userProfiles/{uid}/rewardAttempts`) and redemption requests preserve idempotency and must remain alongside their ledgers; deleting a receipt may remove its retry guarantee. Set a deliberate financial/rewards retention policy rather than applying short rate-counter TTL to these records.

Validation: `npm run test:rewards` runs concurrent transaction, identity, retry and negative-rule regressions on demo emulators. `flutter test` covers app retry behavior. `npm run test:rewards:browser` checks the authenticated shop with a committed-but-lost response and the manual QR claim flow using isolated fixtures.
