export class WaiverError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type Point = { x: number; y: number };
export type Signature = { type: 'typed'; text: string } | { type: 'drawn'; strokes: Point[][] };
export type Submission = {
  version: string; documentHash: string; consentVersion: string;
  fullName: string; email: string; phone: string;
  emergencyName: string; emergencyRelationship: string; emergencyPhone: string;
  acknowledgments: { adult: true; agreement: true; electronic: true };
  signature: Signature;
};
export const normalizeSearch = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
export function textField(value: unknown, label: string, min = 1, max = 120): string {
  if (typeof value !== 'string' || /[\p{Cc}\p{Cf}]/u.test(value)) throw new WaiverError(400, `Enter a valid ${label}.`);
  const result = value.trim();
  if (result.length < min || result.length > max) throw new WaiverError(400, `Enter a valid ${label} (${min}–${max} characters).`);
  return result;
}
export function receiptKey(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new WaiverError(400, 'Invalid signing session. Reload the page before signing.');
  return value;
}
export function validateSubmission(input: any): Submission {
  if (!input || typeof input !== 'object' || input.website) throw new WaiverError(400, 'Unable to accept this submission.');
  const fullName = textField(input.fullName, 'full legal name', 2);
  const email = textField(input.email, 'email address', 3, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new WaiverError(400, 'Enter a valid email address.');
  function phone(value: unknown, label: string) {
    const p = textField(value, label, 7, 32);
    if (!/^[+\d().\s-]+$/.test(p) || p.replace(/\D/g, '').length < 7 || p.replace(/\D/g, '').length > 15) throw new WaiverError(400, `Enter a valid ${label}.`);
    return p;
  }
  if (['adult', 'agreement', 'electronic'].some(k => input.acknowledgments?.[k] !== true)) throw new WaiverError(400, 'Select each of the three acknowledgments before signing.');

  let signature: Signature;
  if (input.signature?.type === 'typed') {
    const text = textField(input.signature.text, 'typed signature', 2);
    if (normalizeSearch(text) !== normalizeSearch(fullName)) throw new WaiverError(400, 'Your typed signature must match your full legal name.');
    signature = { type: 'typed', text };
  } else if (input.signature?.type === 'drawn') {
    const strokes = input.signature.strokes;
    if (!Array.isArray(strokes) || !strokes.length || strokes.length > 100) throw new WaiverError(400, 'Draw your signature or use the typed alternative.');
    let count = 0, distance = 0;
    const clean = strokes.map((stroke: unknown) => {
      if (!Array.isArray(stroke) || stroke.length < 2) throw new WaiverError(400, 'Draw a complete signature or use the typed alternative.');
      return stroke.map((p: any, i: number) => {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1 || ++count > 5000) throw new WaiverError(400, 'Invalid signature. Clear it and try again.');
        if (i) distance += Math.hypot(p.x - stroke[i - 1].x, p.y - stroke[i - 1].y);
        return { x: p.x, y: p.y };
      });
    });
    if (count < 5 || distance < 0.08) throw new WaiverError(400, 'Draw a complete signature or use the typed alternative.');
    signature = { type: 'drawn', strokes: clean };
  } else throw new WaiverError(400, 'Choose a signature method.');
  return {
    version: textField(input.version, 'waiver version'), documentHash: textField(input.documentHash, 'document hash'), consentVersion: textField(input.consentVersion, 'electronic consent version'),
    fullName, email, phone: phone(input.phone, 'attendee phone'),
    emergencyName: textField(input.emergencyName, 'emergency contact name', 2),
    emergencyRelationship: textField(input.emergencyRelationship, 'emergency contact relationship', 1, 80),
    emergencyPhone: phone(input.emergencyPhone, 'emergency contact phone'),
    acknowledgments: { adult: true, agreement: true, electronic: true }, signature,
  };
}
