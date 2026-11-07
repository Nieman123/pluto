const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash, createPrivateKey, sign } = require('node:crypto');
const sharp = require('../functions/node_modules/sharp');
const { QRCodeReader, RGBLuminanceSource, HybridBinarizer, BinaryBitmap } = require('@zxing/library');
const { cameraQrImage } = require('../scripts/ticketing/camera-qr-fixture.cjs');
const { qr: legacyQr } = require('./fixtures/ticket-qr.json');

// This fixed signing seed and payload reproduce a legitimate credential whose
// M-level QR fails the old fixture's detector in all four rotations.
function difficultCredential() {
  const key = createPrivateKey({ key: Buffer.from(`302e020100300506032b657004220420${'01'.repeat(32)}`, 'hex'), format: 'der', type: 'pkcs8' });
  const payload = { id: `${createHash('sha256').update('camera-70').digest('hex')}_friday_1`,
    eventId: '0887b7c4-f54b-4f27-92fb-6f03d43bcd8d', version: 1,
    validFrom: '2026-11-07T15:00:00.000Z', validUntil: '2026-11-09T04:00:00.000Z', kid: 'ci-k2' };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const message = `PLUTO2.${data}`;
  return `${message}.${sign(null, Buffer.from(message), key).toString('base64url')}`;
}

for (const [name, qr] of [['legacy ticket', legacyQr], ['difficult signed ticket', difficultCredential()]]) {
  test(`simulated camera image round-trips the ${name} with the default detector`, async () => {
    const image = Buffer.from((await cameraQrImage(qr)).split(',')[1], 'base64');
    const { data, info } = await sharp(image).greyscale().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([info.width, info.height, info.channels], [640, 640, 1]);
    const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(new Uint8ClampedArray(data), info.width, info.height)));
    assert.equal(new QRCodeReader().decode(bitmap).getText(), qr);
  });
}
