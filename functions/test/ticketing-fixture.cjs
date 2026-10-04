function fixture(active = false) {
  const startAt = new Date(Date.now() + (active ? -3600000 : 86400000)).toISOString(), endAt = new Date(Date.now() + 2 * 86400000).toISOString();
  const salesStart = new Date(Date.now() - 3600000).toISOString();
  const base = { description: '', maxPerOrder: 10, salesStart, salesEnd: endAt, validFrom: startAt, validUntil: endAt, active: true, requiresOfferIds: [], taxCode: '', stripeProductId: '', stripeTaxRateIds: [] };
  return { title: 'Pluto Test Festival', slug: 'pluto-test-festival', subtitle: 'Test music weekend', descriptionHtml: '<p>Dance together.</p>', startAt, endAt, admissionStartsAt: startAt,
    timezone: 'America/New_York', city: 'Asheville', region: 'NC', venueName: 'Private secret venue', address: '123 Hidden Lane', directions: 'Private directions', venueVisibility: 'holders',
    hero: null, flyer: null, gallery: [], lineup: [], sections: [], theme: { preset: 'pluto', accent: '#c4a2ff', font: 'Montserrat' },
    pools: [{ id: 'friday', name: 'Friday', capacity: 50 }, { id: 'saturday', name: 'Saturday', capacity: 50 }, { id: 'vehicles', name: 'Vehicles', capacity: 10 }],
    offers: [{ ...base, id: 'weekend', name: 'Weekend', kind: 'admission', unitAmount: 10000, pools: { friday: 1, saturday: 1 } },
      { ...base, id: 'friday', name: 'Friday', kind: 'admission', unitAmount: 6000, pools: { friday: 1 } },
      { ...base, id: 'vehicle', name: 'Vehicle', kind: 'vehicle', unitAmount: 1000, pools: { vehicles: 1 }, requiresOfferIds: ['weekend', 'friday'] }],
    promos: [{ code: 'SAVE', type: 'percent', value: 10, limit: 20, startsAt: salesStart, endsAt: endAt, offerIds: [] }], tax: { mode: 'sandbox', confirmed: false, performanceLocationId: '' } };
}
module.exports = { fixture };
