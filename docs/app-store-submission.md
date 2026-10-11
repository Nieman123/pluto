# App Store screenshots and privacy setup

Open **App Store Connect → Apps → Pluto Events → Distribution**. TestFlight's
build page does not contain the public listing's screenshot upload controls.

For screenshots, click **iOS App 1.0** (or the version being prepared) in the left
sidebar. Under **App Previews and Screenshots**, choose the device tab. Use
**View All Sizes in Media Manager** for additional classes, including Duo.
The version must be editable, for example **Prepare for Submission**.

For disclosures, click **App Privacy** in the app's left sidebar, then
**Get Started**. Set the privacy-policy URL to `https://pluto.events/privacy`.
The disclosure answers are a questionnaire; they are not a file upload. After
completing every selected type, review the preview and click **Publish**.

## Screenshot sets

The **App Store screenshots** GitHub workflow creates six PNGs per display:

| Folder | Upload class | Pixels |
| --- | --- | --- |
| `iphone` | iPhone 6.9-inch | 1320 × 2868 |
| `iphone-duo-outer` | iPhone Duo outer display | 1398 × 2034 |
| `iphone-duo-inner` | iPhone Duo inner display | 2007 × 2853 |
| `ipad` | iPad 13-inch | 2064 × 2752 |

Download its `app-store-screenshots-…` artifact and use PNGs in numeric order.
The scenes show Home, upcoming events, tickets, the enlarged admission QR,
rewards and profile. They render the actual application widgets in a native iOS
simulator with a fictional member and local Firebase emulator data. The capture
entrypoint lays out each viewport independently, without system status bars or
device frames. Duo images are native Flutter layout renders at Apple's sizes,
not physical Duo device captures. Check the layouts against the submitted build.
The images are opaque RGB PNGs with an sRGB profile. Emulator-only signing keys
ensure their QR codes do not grant admission to a real event.

The workflow requires no Apple distribution credentials or live Firebase keys.
It builds only a debug simulator app using `scripts/store/capture.dart`; normal
TestFlight/App Store releases keep `lib/main.dart` as their entrypoint.

## Privacy questionnaire worksheet

This worksheet describes repository behavior, not a completed Console declaration.
Confirm the final archive's SDK privacy report and enabled provider settings before
publishing. Include data collected through the app's connected web flows and
service providers, following Apple's instructions.

Select **Yes, we collect data from this app**. These account-related categories
are collected for **App Functionality**, linked to the account, and not used by
Pluto for cross-company advertising tracking:

| Apple category | Feature collecting it |
| --- | --- |
| Contact Info → Name | Account, profile, attendee and waiver names |
| Contact Info → Email Address | Sign-in, verification, receipts and event messages |
| Contact Info → Phone Number | Event waiver phone/emergency-contact fields when required |
| Identifiers → User ID | Firebase account and account-linked records |
| Purchases → Purchase History | Orders, tickets, refunds and reward redemptions |
| User Content → Photos or Videos | Optional profile photo; image upload |
| User Content → Other User Content | Profile bio/preferences and event waiver/signature content |
| User Content → Customer Support | Support messages when submitted |
| Other Data | Attendance, RSVP and rewards/points records not captured by a more specific category |

Additional selections require the final provider/flow review:

- **Coarse Location:** the optional home-city field and any approximate location
  derived by a provider. Pluto requests no GPS permission and collects no precise
  or background GPS location. Apple's classification must cover user-entered
  location too, rather than relying on permission prompts alone.
- **Financial Info → Payment Info:** Stripe handles payment details. Include its
  collection if applicable to the app's checkout flow, even though Pluto does not
  retain full card numbers. Do not equate “not stored by Pluto” with “not collected.”
- **Usage Data → Product Interaction / Identifiers → Device ID / Diagnostics:**
  evaluate the actual SDK archive and linked web experience. Native iOS Analytics
  is disabled in `ios/Runner/Info.plist`; production web/Android behavior differs.
  Do not copy the Google Play analytics answers blindly or claim no collection
  without checking the applicable SDK and server logging behavior.
- For optional marketing/event emails, select the corresponding marketing purpose
  for the contact information if it is used that way. Tracking is a separate
  question about Apple's definition, not ordinary account-linked ticket activity.

Use the public policy for retention/deletion details. Account deletion is also
available at `https://pluto.events/delete-account` and in the app.

## Apple references

- [Upload screenshots](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots/)
- [Screenshot dimensions](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- [App Privacy controls](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)
- [Data category definitions](https://developer.apple.com/app-store/app-privacy-details/)
