# Google Play listing graphics

## App icon

Upload `pluto-events-icon-512.png` in the **App icon** field of the main store listing in Play Console. It can be used for the staging and production listings.

The icon places Pluto's existing speaker-dog and planet logo over a purple gradient. It was composed with imagegen using `web/pluto-logo-512.png` as its reference, then exported for the store.

Verified export properties:

- 512 × 512 pixels
- 32-bit RGBA PNG with sRGB metadata
- Fully opaque square background
- Approximately 477 KiB, below the 1,024 KB maximum
- No baked-in rounded corners or outer shadow; Play applies these

Specification: https://developer.android.com/distribute/google-play/resources/icon-design-specifications

This is a store-listing asset. Android launcher icons remain configured separately under `android/app/src/main/res/`.

## Feature graphic

Upload `pluto-events-feature-1024x500.png` in the **Feature graphic** field of the main store listing. It can be used for either listing.

The banner uses `assets/gallery/manafest-2026/manafest-2026-night-stage.webp` as the photographic reference, with purple lighting and a simple “PLUTO EVENTS” title. It was composed with imagegen and exported at exactly 1024 × 500 pixels as an sRGB, 24-bit RGB PNG with no alpha channel. The final export was visually inspected.

Specification: https://support.google.com/googleplay/android-developer/answer/9866151?hl=en

## Phone screenshots

The `phone/` folder contains actual captures of the Flutter Android app at 1080 × 1920 pixels (9:16 portrait), exported as 24-bit RGB PNGs without transparency. Upload them in numeric order in the **Phone screenshots** section of the main store listing.

They use an isolated local Firebase demo project, a fictional member named Alex, and example event/reward data. No real customer information or usable production admission credentials appear. The UI is captured from the installed app without marketing overlays or device frames. These captures can be used for the staging listing; review the example content before reusing them for production.

| File | Suggested alt text |
| --- | --- |
| `01-member-dashboard.png` | Member dashboard showing Pluto Points, membership tier and upcoming events. |
| `02-upcoming-events.png` | Upcoming Pluto events with stage photos and ticket or RSVP options. |
| `03-ticket-wallet.png` | In-app admission ticket with attendee name, event details and a QR code. |
| `04-admission-qr.png` | Enlarged admission QR code for convenient scanning at the door. |
| `05-rewards.png` | Rewards shop showing Pluto Points balance and available rewards. |
