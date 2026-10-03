import { type Firestore, type Transaction } from 'firebase-admin/firestore';
import { fail, hash } from './domain';

// This proof is accepted by admission methods only. It never becomes a Firebase actor.
export type ScannerProof = { scannerToken: string };
export async function scannerAccess(db: Firestore, proof: ScannerProof, eventId?: string, tx?: Transaction) {
  if (!/^[a-f0-9]{64}$/.test(proof.scannerToken || '')) fail('Enter your scanner PIN to continue.', 401);
  const sessionRef = db.collection('ticketingScannerSessions').doc(hash(proof.scannerToken));
  const session = (await (tx ? tx.get(sessionRef) : sessionRef.get())).data();
  if (!session || session.revokedAt || session.expiresAt <= Date.now()) fail('Scanner access has expired. Enter your PIN again.', 401);
  const pinRef = db.collection('ticketingScannerPins').doc(session.pinId);
  const pin = (await (tx ? tx.get(pinRef) : pinRef.get())).data();
  if (!pin || pin.revokedAt || pin.expiresAt <= Date.now()) fail('This scanner PIN has expired or been revoked. Contact your event organizer.', 403);
  if (pin.eventId !== session.eventId || (eventId && pin.eventId !== eventId)) fail('This scanner PIN only has access to its assigned event.', 403);
  return { uid: `scanner_${session.pinId}`, scannerPinId: session.pinId, scannerSessionId: sessionRef.id, scannerLabel: pin.label,
    eventId: pin.eventId as string, expiresAt: Math.min(pin.expiresAt, session.expiresAt) as number };
}
