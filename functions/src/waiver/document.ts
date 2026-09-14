import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const sourcePdf = readFileSync(join(__dirname, 'legal/ManaFest_2026_Attendee_Waiver.pdf'));
export const waiverText = readFileSync(join(__dirname, 'legal/waiver.txt'), 'utf8');
export const documentHash = hash(waiverText);
export const sourcePdfHash = hash(sourcePdf);
export const version = `manafest-2026-${documentHash.slice(0, 12)}-${sourcePdfHash.slice(0, 12)}`;
export const consentVersion = 'electronic-consent-2026-09-14-v1';
// Added for electronic signing. These are separate from the source waiver.
export const consents = {
  adult: 'I confirm that I am at least 21 years old.',
  agreement: 'I have read and understand the complete waiver above, agree to its terms, and sign voluntarily.',
  electronic: 'I consent to use an electronic signature and receive an electronic record of this waiver. I intend my drawn or typed signature to be my signature on this agreement.',
};
export const electronicDisclosure = 'Electronic signing is optional. You may instead sign a paper waiver at event check-in. To sign online, you need a browser with JavaScript and the ability to open and save a PDF. After submission, download and keep your signed PDF; no email copy is sent. You may choose paper signing any time before you submit. Signing does not purchase a ticket or guarantee entry.';
const [front, body] = waiverText.split(/(?=1\. Attendance)/);
const [clauses, formLabels] = body.split(/(?=Attendee full legal name)/);
export const legalView = {
  header: front.trim().split('\n').slice(0, 6),
  warning: front.trim().split('\n').slice(6).join(' '),
  clauses: clauses.trim().split(/\n(?=\d\. )/).map(text => {
    const flat = text.replace(/\n/g, ' ');
    const end = flat.indexOf('. ', 3);
    return { heading: flat.slice(0, end + 1), body: flat.slice(end + 2) };
  }),
  formLabels: formLabels.trim().split('\n'),
};
