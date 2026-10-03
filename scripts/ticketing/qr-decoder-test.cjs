const assert = require('node:assert/strict');
const sharp = require('../../functions/node_modules/sharp');
const { MultiFormatReader, RGBLuminanceSource, HybridBinarizer, BinaryBitmap, DecodeHintType, BarcodeFormat } = require('@zxing/library');
const { qr } = require('../../test/fixtures/ticket-qr.json');
(async () => {
  let count = 0;
  for (const width of [264, 340]) for (const ratio of [1, 2]) for (const scale of ratio === 2 || width === 340 ? [1, .8] : [1]) {
    const file = `tmp/qr-${width}-${ratio}.png`, { width: originalWidth } = await sharp(file).metadata();
    const { data, info } = await sharp(file).resize({ width: Math.round(originalWidth * scale) }).flatten({ background: '#ffffff' }).greyscale().raw().toBuffer({ resolveWithObject: true });
    const reader = new MultiFormatReader(); reader.setHints(new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]], [DecodeHintType.TRY_HARDER, true]]));
    const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(new Uint8ClampedArray(data), info.width, info.height)));
    let decoded;
    try { decoded = reader.decodeWithState(bitmap).getText(); } catch (error) { throw new Error(`QR did not decode: ${file} at ${scale}, ${info.width}x${info.height}/${info.channels} channels`, { cause: error }); }
    assert.equal(decoded, qr, `${file} at ${scale}`); count++;
  }
  console.log(`${count} branded QR decoder checks passed at mobile/desktop densities and downscaled sizes.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
