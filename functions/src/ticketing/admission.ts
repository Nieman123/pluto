// These listings require neither a Pluto ticket nor an RSVP.
export function isWalkInEvent(mode: unknown): boolean {
  return mode === 'free' || mode === 'door';
}

export function doorPriceLabel(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: amount % 100 === 0 ? 0 : 2,
  }).format(amount / 100);
}
