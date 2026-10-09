import { Router } from 'express';

export const legalPages = {
  '/privacy': { title: 'Privacy Policy', description: 'How Pluto Events LLC collects, uses, protects and deletes information in the Pluto Events website and app.', template: 'privacy' },
  '/terms': { title: 'Terms of Use', description: 'Terms for using Pluto Events, buying tickets and attending our events.', template: 'terms' },
  '/delete-account': { title: 'Delete your account', description: 'Request deletion of your Pluto Events account and associated personal data.', template: 'delete-account' },
} as const;

export function legalRouter(context: (path: string) => Record<string, unknown>) {
  const router = Router();
  for (const [path, page] of Object.entries(legalPages)) {
    router.get(path, (_request, response) => {
      const shared = context(path);
      const meta = shared.meta as Record<string, unknown>;
      // These pages are readable without authentication, JavaScript or database access.
      response.render(page.template, { ...shared, legalPage: true, googleAnalyticsId: '',
        meta: { ...meta, title: `${page.title} | Pluto Events`, description: page.description,
          canonical: new URL(path, String(meta.canonical)).toString() },
        jsonLd: '',
      });
    });
  }
  return router;
}
