import type { RequestHandler } from 'express';

// Scripts on server-rendered pages may only load from this site and the
// services the pages use. Inline scripts and inline event handlers are blocked,
// so injected markup cannot run code. JSON data blocks
// (type="application/json" / "application/ld+json") are not scripts and are
// unaffected.
//   gstatic firebasejs  Firebase SDK modules imported by site.js and ticketing.js
//   apis.google.com     Firebase Auth Google/Apple sign-in popup (/delete-account)
//   js.stripe.com       Stripe payment form
//   googletagmanager    Google Analytics
//   recaptcha           Firebase App Check (reCAPTCHA Enterprise)
export const scriptSources = [
  "'self'",
  'https://www.gstatic.com/firebasejs/',
  'https://apis.google.com',
  'https://js.stripe.com',
  'https://*.js.stripe.com',
  'https://*.googletagmanager.com',
  'https://www.google.com/recaptcha/',
  'https://www.gstatic.com/recaptcha/',
];

export const contentSecurityPolicy = [
  `script-src ${scriptSources.join(' ')}`,
  "script-src-attr 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// Applied to every response from the publicSite function. Routers that set
// their own headers reuse contentSecurityPolicy so the policy stays in one place.
export const securityHeaders: RequestHandler = (_request, response, next) => {
  response.set({
    'Content-Security-Policy': contentSecurityPolicy,
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
  });
  next();
};
