const assert = require('node:assert/strict');
const sharp = require('../../functions/node_modules/sharp');
const { QRCodeWriter, QRCodeReader, BarcodeFormat, EncodeHintType, RGBLuminanceSource, HybridBinarizer, BinaryBitmap } = require('@zxing/library');

// Signed payloads vary on every run. ZXing can mistake their data modules for
// finder/alignment patterns even after all four rotations. Try bounded renderings
// of the SAME credential, with equal or stronger error correction, before using
// it in a simulated camera. Never bypass the detector or replace the ticket.
async function cameraQrImage(qr) {
  const size = 640;
  let decodeError;
  for (const correction of ['M', 'Q', 'H']) {
    const matrix = new QRCodeWriter().encode(qr, BarcodeFormat.QR_CODE, size, size,
      new Map([[EncodeHintType.MARGIN, 5], [EncodeHintType.ERROR_CORRECTION, correction]]));
    const pixels = Buffer.alloc(size * size, 255);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (matrix.get(x, y)) pixels[y * size + x] = 0;
    const png = await sharp(pixels, { raw: { width: size, height: size, channels: 1 } }).png().toBuffer();
    for (const angle of [0, 90, 180, 270]) {
      const frame = await sharp(png).rotate(angle).greyscale().raw().toBuffer();
      try {
        const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(new Uint8ClampedArray(frame), size, size)));
        assert.equal(new QRCodeReader().decode(bitmap).getText(), qr, 'camera fixture preserves the exact signed credential');
        return `data:image/png;base64,${(await sharp(png).rotate(angle).png().toBuffer()).toString('base64')}`;
      } catch (error) { decodeError = error; }
    }
  }
  throw new Error('Camera fixture could not be decoded at M/Q/H error correction in any orientation.', { cause: decodeError });
}

module.exports = { cameraQrImage };
