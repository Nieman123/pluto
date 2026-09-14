const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const nunjucks = require('nunjucks');
const document = require('../lib/waiver/document');
const { validateSubmission } = require('../lib/waiver/validation');
const { createSignedPdf } = require('../lib/waiver/pdf');
const { PDFDocument } = require('pdf-lib');
function valid() { return {
  fullName: 'Test Attendee', email: 'test@example.com', phone: '+1 555 010 2345', emergencyName: 'Test Contact', emergencyRelationship: 'Friend', emergencyPhone: '+1 555 010 9876',
  version: document.version, documentHash: document.documentHash, consentVersion: document.consentVersion,
  acknowledgments: { adult: true, agreement: true, electronic: true }, signature: { type: 'typed', text: 'Test Attendee' },
}; }
module.exports = { valid };
test('waiver HTML contains every source word in order and no analytics', () => {
  const env = nunjucks.configure(join(__dirname, '../lib/templates'), { autoescape: true });
  const html = env.render('waiver.njk', { ...document, legalView: document.legalView, meta: {}, firebaseConfigJson: '{}' });
  const content = html.match(/<article class="waiver-copy"[\s\S]*?<\/article>/)[0].replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const squash = s => s.replace(/\s+/g, ' ').trim();
  assert.equal(squash(content), squash(document.waiverText));
  assert.doesNotMatch(html, /googletagmanager/);
  assert.equal((html.match(/type="checkbox"/g) || []).length, 3);
  assert.doesNotMatch(html, /type="checkbox"[^>]*checked/);
  assert.match(html, /Sign and submit waiver/);
  assert.match(html, /<form method="post" action="\/manafest-waiver\/api\/submit"/);
});
test('server rejects missing consent, invalid details and forged signature', () => {
  assert.equal(validateSubmission(valid()).fullName, 'Test Attendee');
  for (const key of ['adult', 'agreement', 'electronic']) {
    const input = valid(); input.acknowledgments[key] = 'true'; assert.throws(() => validateSubmission(input));
  }
  for (const field of ['fullName', 'email', 'phone', 'emergencyName', 'emergencyRelationship', 'emergencyPhone']) {
    assert.throws(() => validateSubmission({ ...valid(), [field]: '' }));
  }
  assert.throws(() => validateSubmission({ ...valid(), email: 'not-an-email' }));
  assert.throws(() => validateSubmission({ ...valid(), phone: 'abcdefgh' }));
  assert.throws(() => validateSubmission({ ...valid(), fullName: 'Test\nAttendee' }));
  assert.throws(() => validateSubmission({ ...valid(), signature: { type: 'typed', text: 'Someone else' } }));
  for (const strokes of [[], [[{ x: 0, y: 0 }]], [[{ x: Infinity, y: 0 }, { x: 1, y: 1 }]], [Array(5001).fill({ x: 0.5, y: 0.5 })]]) {
    assert.throws(() => validateSubmission({ ...valid(), signature: { type: 'drawn', strokes } }));
  }
  const strokes = [[{ x: .1, y: .2 }, { x: .2, y: .5 }, { x: .3, y: .1 }, { x: .5, y: .6 }, { x: .7, y: .2 }]];
  assert.equal(validateSubmission({ ...valid(), signature: { type: 'drawn', strokes } }).signature.type, 'drawn');
});
test('signed PDF retains the source page and includes an electronic record', async () => {
  const record = { ...valid(), confirmationId: 'MF26-11111111-1111-4111-8111-111111111111', signedAtUtc: '2026-09-14T15:00:00.000Z', waiverText: document.waiverText, sourcePdfHash: document.sourcePdfHash, consentText: document.consents, electronicDisclosure: document.electronicDisclosure };
  const pdf = await createSignedPdf(record, document.sourcePdf);
  const saved = await PDFDocument.load(pdf);
  assert.equal(saved.getPageCount(), 3);
  assert.deepEqual(saved.getPage(0).getSize(), (await PDFDocument.load(document.sourcePdf)).getPage(0).getSize());
  assert.equal(document.hash(readFileSync(join(__dirname, '../src/waiver/legal/waiver.txt'))), document.documentHash);
});
