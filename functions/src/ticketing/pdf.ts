import PDFDocument from 'pdfkit';
import { join } from 'node:path';

export async function orderPdf(order: any) {
  const doc = new PDFDocument({ size: 'A4', margin: 48 }), chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => { doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  doc.font(join(__dirname, '../waiver/legal/Montserrat-Medium.ttf'));
  doc.fontSize(24).text('PLUTO EVENTS').moveDown().fontSize(18).text(order.eventTitle).moveDown();
  doc.fontSize(11).text(`Order ${order.orderId}`).text(`${order.name} · ${order.email}`).text(`Status: ${order.status}`)
    .text(`Total: $${(order.total / 100).toFixed(2)} · Refunds: $${(order.refundedAmount / 100).toFixed(2)}`);
  if (order.receiptUrl) doc.text('Stripe payment receipt', { link: order.receiptUrl, underline: true });
  if (order.venue) doc.moveDown().text([order.venue.name, order.venue.address, order.venue.directions].filter(Boolean).join('\n'));
  doc.moveDown().text('This document is a payment receipt. Open the Pluto app to access admission tickets.');
  doc.end(); return result;
}
