export const SITE_ORIGIN = 'https://www.embedpdf.com';
export const SITE_NAME = 'EmbedPDF';

type SiteEnvironment = {
  VERCEL_ENV?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  VERCEL_URL?: string;
};

/**
 * Preview metadata must point at the exact deployment so its generated assets
 * can be inspected before release. Production stays on the canonical domain,
 * and a normal `next dev` session stays entirely local.
 */
export function getMetadataBase(environment: SiteEnvironment = process.env as SiteEnvironment) {
  if (environment.VERCEL_ENV === 'preview' && environment.VERCEL_URL) {
    return new URL(`https://${environment.VERCEL_URL}`);
  }

  if (environment.VERCEL_ENV === 'production' && environment.VERCEL_PROJECT_PRODUCTION_URL) {
    return new URL(`https://${environment.VERCEL_PROJECT_PRODUCTION_URL}`);
  }

  if (environment.VERCEL_ENV === 'production') return new URL(SITE_ORIGIN);
  return new URL('http://localhost:3100');
}
