# Public policies and account deletion

Operator: **Pluto Events LLC**. Public support/privacy email: **contact@pluto.events**.

After deploying this commit, use these public HTML URLs in Play Console:

| Resource | Production | Staging |
| --- | --- | --- |
| Privacy policy | https://pluto.events/privacy | https://pluto-staging-92eb7.web.app/privacy |
| Terms of Use | https://pluto.events/terms | https://pluto-staging-92eb7.web.app/terms |
| Account deletion | https://pluto.events/delete-account | https://pluto-staging-92eb7.web.app/delete-account |

They render without sign-in, JavaScript or database reads. Profile links include
account deletion; account creation links include Privacy Policy and Terms of Use.
Staging has the usual noindex header. Release smoke checks verify all three routes.
Review the text and confirm the contact inbox is monitored before production deployment.
Adding policy links does not record historical acceptance of these terms.

## Data safety: location

The app has no coarse/fine/background location permission and no GPS/location SDK.
It stores an optional, user-entered home city. Production Firebase Analytics is
enabled and derives approximate location from a masked IP address. Staging disables
Firebase Analytics before use. Do not claim “no location collected” for production;
disclose approximate location for analytics and the home-city field for app functionality.
For staging, include the optional home-city data and any applicable browser analytics
when declaring the app's linked web flows. Precise location is not collected by Pluto.
Provider or Console settings such as Google Signals/Ads linkage can change disclosures;
verify them when submitting the form.

Also review name/email/user IDs, optional profile photos/bio, purchase history,
app interactions, device identifiers, support communications and event waiver information.
Firebase/Google, Stripe and Resend operate as providers; Play's “shared” classification
has exceptions for qualifying service providers and user-initiated transfers, so it
is not interchangeable with the policy's ordinary description of disclosure.
Do not claim all data is optional: some account and purchase fields are required.

Official references:
- [User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311)
- [Account deletion requirements, including customer-service email requests](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Firebase data disclosures](https://firebase.google.com/docs/android/play-data-disclosure)
- [Analytics data disclosures](https://support.google.com/analytics/answer/11582702)

## Handling a deletion request

The current feature is an email-based request process. It does not automatically
delete an account, run a deletion job or guarantee a fixed completion period.
Google permits an in-app link to a public request page and an email request pathway;
the team must actually fulfill requests and disclose legitimate retained records.

1. Monitor contact@pluto.events. Acknowledge requests, identify production versus
   staging, and give an expected completion timeframe. Verify ownership through the
   account's verified email or an appropriate support process. Never request a password.
2. Inventory associated records before deleting Auth: user profile and images,
   rewards/points history, account-linked orders/tickets/transfers, RSVP/waitlist,
   guestlist entries, communications, security logs and waivers. Resolve active ticket
   access with the user. Deleting Auth alone leaves Firestore data behind.
3. Determine which limited records must be retained for tax/accounting, disputes,
   security or legal requirements. Explain the purpose and expected retention to the
   user; remove unnecessary personal fields. No blanket “retain everything” exemption.
4. Delete the Firebase Authentication account, remove or anonymize eligible associated
   Firestore data and stored files, and remove optional communication subscriptions.
   Firestore parent-document deletion does not recursively delete subcollections.
   Review outstanding email jobs to avoid sending new optional messages after deletion.
5. Coordinate applicable deletion requests with providers (Google/Firebase, Resend,
   Stripe), including Analytics data where identifiable. Keep legally necessary
   transaction evidence only for the justified retention period.
6. Confirm completion and any retained categories to the user. Keep a minimal,
   access-restricted request audit, with its own justified retention. Server deletion
   does not erase a user's old local cache, downloaded document or third-party copy;
   explain clearing device data if needed.

Complete a real staging deletion rehearsal with a test account before public Play
distribution. Do not check off automatic or instant deletion in Play Console.
