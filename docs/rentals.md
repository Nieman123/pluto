# Equipment rentals

The public catalog lives at `/rentals`. Manage listings in the Flutter app under
**Admin → Rentals** (`/app/admin/rentals`). The editor supports descriptions,
categories, quantities, sorting, product links, photo uploads or URLs, visibility,
and two pricing modes: **Contact For Quote** or a USD price with an optional unit
such as “per day”. All inquiries use `contact@pluto.events`.

Listings are stored in Firestore's `rentalItems` collection. Prices are integer
cents; quote listings have `priceCents: null`. Only active listings appear on the
public page. Quantities describe inventory owned, not live booking availability.
The public HTML cache can delay edits for about a minute.

The six starter listings are in `assets/rentals/initial-inventory.json`. Both the
backend and admin editor share an atomic, one-time import marker at
`rentalSettings/initialInventory`. Existing listings are preserved, and deleted
items are never recreated after the import. The production Pluto database was
populated on September 30, 2026; all starter items use quote pricing.

All six listings have optimized WebP photos in Firebase Storage. Repository
copies live in `site/static/assets/images/rentals`. The generator and laser have
transparent backgrounds; the string lights use the Manafest forest dance floor
photo. The starter JSON includes the same Storage URLs and object paths, so
local previews and future imports show the populated images.

The generator cutout used the built-in imagegen tool. Its edit prompt was:

> Use case: precise-object-edit. Edit target: the attached DuroMax XP16000iHT
> manufacturer product photograph. Primary request: remove ONLY the white
> background and replace it with genuine alpha transparency, creating a clean
> isolated equipment cutout for a rental catalog. Preserve the exact generator,
> perspective, blue and black colors, all frame tubes, wheels, handle, fittings,
> control panel, vents, screws, labels, DuroMax branding, XP16000iHT text,
> proportions, edges, and lighting from the original photograph. Preserve the
> white and light gray areas that belong to the generator's labels and control
> panel. Remove the background through gaps in the frame too. Keep the entire
> generator visible with a small transparent margin. Do not recreate,
> reinterpret, redesign, add, or remove any product detail. No new background,
> shadow, reflection, text, or graphic. Transparent PNG output.

The supplied Pangolin PNG already contained alpha transparency and was preserved.
Speaker photos came from the three supplied BASSBOSS JPGs. Images were scaled to
a maximum edge of 900 pixels and encoded as WebP with alpha retained.

Deploy the public Function, Hosting bundle, and Firestore rules together using
the existing build/deploy workflow. Rules permit public reads of active listings
and restrict edits and private settings to existing admins. Uploaded images use
the existing admin-only `/public/**` Storage upload rules.

For another project with application default credentials, build the Functions
and inspect the import before writing:

```powershell
npm run build:functions
node functions/scripts/seed-rentals.mjs --project <project-id>
node functions/scripts/seed-rentals.mjs --project <project-id> --write
```

Validation includes `npm test`, `flutter analyze`, `flutter test`, and Firestore
emulator coverage for admin CRUD, visibility, price validation, import behavior,
and the public route reading actual Firestore records:

```powershell
npx firebase-tools emulators:exec --project demo-pluto-rentals --config firebase.rentals-test.json --only firestore "npm run test:rentals:rules"
```

Explicit local preview mode (`PUBLIC_SITE_PREVIEW=true`) uses starter fixtures
unless a Firestore emulator is configured. Production always reads Firestore.
