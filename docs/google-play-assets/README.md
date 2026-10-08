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
