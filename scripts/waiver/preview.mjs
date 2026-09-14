// Start Firebase emulators separately using firebase.waiver-preview.json first.
process.env.PUBLIC_SITE_PREVIEW = 'true';
process.env.GCLOUD_PROJECT = 'demo-pluto-waiver';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.WAIVER_STORAGE_BUCKET = 'demo-pluto-waiver.appspot.com';
await import('../../functions/scripts/preview-server.mjs');
