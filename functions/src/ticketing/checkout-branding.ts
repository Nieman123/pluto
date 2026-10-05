import type Stripe from 'stripe';

// Embedded Checkout owns its iframe CSS. These are Stripe's supported full-page
// branding controls; new orders snapshot them so payment retries stay identical.
export const plutoCheckoutBranding: Stripe.Checkout.SessionCreateParams.BrandingSettings = Object.freeze({
  background_color: '#211a2b',
  button_color: '#c4a2ff',
  font_family: 'montserrat',
  border_style: 'rounded',
  display_name: 'Pluto Events',
});
