# Google Play listing icon

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
