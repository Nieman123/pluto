# ManaFest day-pass launch

The public page uses https://posh.vip/e/manafest-2026. Posh manages the ticket
products, prices, and fees. Links open its event ticket selector and do not
preselect a product or use temporary checkout/cart URLs.

## Current status

The organizer confirmed the day passes are live. Both Friday Day Pass and
Saturday Day Pass were independently selectable in the public Posh selector.
The website now announces availability and shows a “View on Posh” link for each
pass. Camping and parking details appear once, directly below both options.

Posh displays $60.01 per day pass, including $6.36 in fees. The website retains
the organizer-confirmed $60 price. Adjust the extra cent in Posh if $60 is the
intended total. No payment was made during verification.

Both Posh products now publish arrival after noon and departure by 8 a.m. the
next morning. The public guide and FAQs reflect those times. Weekend gate hours
and Sunday-evening pack-up policy remain unchanged.

## Verification

- Public-site tests cover ticket links, availability copy, and a single shared
  camping paragraph below the two options.
- `npm test` and `npm run build:public` pass.
- Mobile and desktop layouts have been checked in the local preview.
- No production deployment has been performed.

Follow the normal README build and deployment sequence for release. This note
is internal and is not copied to the public site.
