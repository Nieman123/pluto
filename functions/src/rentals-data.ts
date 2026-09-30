import type { DocumentData } from 'firebase-admin/firestore';

export const rentalContactEmail = 'plutopresentsavl@gmail.com';

export interface PublicRental {
  id: string;
  title: string;
  description: string;
  category: string;
  quantity: number;
  productUrl: string;
  imageUrl: string;
  priceMode: 'quote' | 'price';
  priceCents: number | null;
  priceLabel: string;
  priceUnit: string;
  sortOrder: number;
  inquiryUrl: string;
}

function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function webUrl(value: unknown): string {
  try {
    const url = new URL(text(value));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch { return ''; }
}

export function normalizeRental(id: string, data: DocumentData): PublicRental | null {
  const title = text(data.title);
  if (data.isActive !== true || !title || !Number.isInteger(data.quantity) || data.quantity < 1) return null;
  const validPrice = data.priceMode === 'price' && Number.isInteger(data.priceCents) && data.priceCents >= 0 && data.priceCents <= 99999999;
  const priceCents = validPrice ? data.priceCents as number : null;
  return {
    id, title, description: text(data.description), category: text(data.category) || 'Other',
    quantity: data.quantity, productUrl: webUrl(data.productUrl), imageUrl: webUrl(data.imageUrl),
    priceMode: validPrice ? 'price' : 'quote', priceCents,
    priceLabel: priceCents === null ? 'Contact For Quote' : new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(priceCents / 100),
    priceUnit: validPrice ? text(data.priceUnit) : '',
    sortOrder: Number.isInteger(data.sortOrder) ? data.sortOrder : 0,
    inquiryUrl: `mailto:${rentalContactEmail}?subject=${encodeURIComponent(`Rental inquiry: ${title}`)}`,
  };
}

export function sortRentals(rentals: PublicRental[]): PublicRental[] {
  return [...rentals].sort((a,b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
}

export function groupRentals(rentals: PublicRental[]): Array<{category: string; items: PublicRental[]}> {
  const groups = new Map<string, PublicRental[]>();
  for (const rental of sortRentals(rentals)) {
    if (!groups.has(rental.category)) groups.set(rental.category, []);
    groups.get(rental.category)!.push(rental);
  }
  return [...groups.entries()].map(([category, items]) => ({category, items}));
}
