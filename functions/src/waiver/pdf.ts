import PDFKit from 'pdfkit';
import { PDFDocument } from 'pdf-lib';
import { join } from 'node:path';
import type { Submission } from './validation';
export type SigningRecord = Submission & {
  confirmationId: string; signedAtUtc: string; waiverText: string;
  sourcePdfHash: string; consentText: Record<string, string>; electronicDisclosure: string;
};
export async function createSignedPdf(record: SigningRecord, original: Buffer): Promise<Buffer> {
  const doc = new PDFKit({ size: 'LETTER', margin: 44, info: { Title: 'ManaFest 2026 electronic signing record', CreationDate: new Date(record.signedAtUtc) } });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
  });
  doc.registerFont('Body', join(__dirname, 'legal/Montserrat-Medium.ttf')).font('Body');
  doc.fillColor('#241d29').fontSize(20).text('ManaFest 2026');
  doc.fontSize(13).text('Electronic signature & signing record').moveDown(0.8);
  doc.fontSize(9).text('This signing record accompanies the complete original waiver on the preceding page.');
  const rows: [string, string][] = [
    ['Confirmation number', record.confirmationId], ['Signed at (UTC)', record.signedAtUtc],
    ['Full legal name', record.fullName], ['Email', record.email], ['Attendee phone', record.phone],
    ['Emergency contact', record.emergencyName], ['Relationship', record.emergencyRelationship], ['Emergency contact phone', record.emergencyPhone],
  ];
  for (const [label, value] of rows) doc.moveDown(0.35).fontSize(9).text(`${label}: ${value}`);
  doc.moveDown(0.8).fontSize(11).text(`Signature (${record.signature.type})`);
  if (record.signature.type === 'typed') doc.fontSize(18).text(record.signature.text);
  else {
    if (doc.y > 590) doc.addPage();
    const x = 44, y = doc.y + 8, w = 480, h = 160;
    doc.save().strokeColor('#55405e').lineWidth(0.5).rect(x, y, w, h).stroke();
    doc.lineWidth(1.5).strokeColor('#241d29');
    for (const stroke of record.signature.strokes) {
      doc.moveTo(x + stroke[0].x * w, y + stroke[0].y * h);
      for (const p of stroke.slice(1)) doc.lineTo(x + p.x * w, y + p.y * h);
      doc.stroke();
    }
    doc.restore(); doc.y = y + h + 10;
  }
  doc.moveDown(0.5).fontSize(11).text('Acknowledgments accepted individually');
  for (const value of Object.values(record.consentText)) doc.moveDown(0.4).fontSize(9).text(`Accepted: ${value}`);
  doc.moveDown(0.5).fontSize(9).text(record.electronicDisclosure);
  doc.addPage().fontSize(16).text('Document identification');
  doc.moveDown().fontSize(10).text(`Confirmation: ${record.confirmationId}`);
  doc.moveDown().text(`Waiver version: ${record.version}`);
  doc.moveDown().text(`Electronic-consent version: ${record.consentVersion}`);
  doc.moveDown().text(`Waiver text SHA-256 (UTF-8, including source line breaks):\n${record.documentHash}`);
  doc.moveDown().text(`Original PDF SHA-256:\n${record.sourcePdfHash}`);
  doc.moveDown().text('The original waiver is reproduced without wording changes. The electronic-signing disclosures and record are additional to that waiver. This record does not certify identity or guarantee legal enforceability.');
  doc.end();
  const appendix = await PDFDocument.load(await finished);
  const output = await PDFDocument.load(original);
  for (const page of await output.copyPages(appendix, appendix.getPageIndices())) output.addPage(page);
  output.setTitle('ManaFest 2026 signed attendee waiver');
  output.setCreationDate(new Date(record.signedAtUtc)); output.setModificationDate(new Date(record.signedAtUtc));
  return Buffer.from(await output.save());
}
