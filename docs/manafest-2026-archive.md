# ManaFest 2026 archive

The public `/manafest` page uses `site/content/manafest.json` with `status: "archived"`.
The original event page remains in `functions/src/templates/manafest-active.njk` and
is rendered when the status is changed to `active`. Update the dates, tickets,
lineup, guide, metadata, and homepage link before reactivating for 2027.

The signed-in Flutter dashboard and bottom navigation hide the countdown,
festival preparation panel, and ManaFest tab by default. The code, routes,
repositories, and admin tools remain available. After updating the 2027 content,
build with `--dart-define=MANAFEST_UI_ENABLED=true` to restore those UI elements.

All 31 favorites have descriptive WebP filenames in
`assets/gallery/manafest-2026/`. Images have a maximum 1800-pixel edge, with
640-pixel thumbnails. Originals are preserved locally; only WebP files are
copied into the public deployment at `/gallery/manafest-2026/`.
The `archive.photos` entries retain the source filename for each image.

The highlight reel is manually controlled. Gallery images open a native dialog
with previous/next controls, arrow-key navigation, Escape to close, and native
focus restoration. Without JavaScript, photo links open the full image.
