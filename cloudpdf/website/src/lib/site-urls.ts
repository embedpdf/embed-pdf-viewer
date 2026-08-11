/**
 * Platform origins the funnel points at. NEXT_PUBLIC_ so client
 * components (header CTA) and server components share one source.
 * Localhost defaults mirror the platform's port layout.
 */
export const PORTAL_URL =
  process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3000';

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3300';

/** Where "Start building" begins: the SaaS journey (register-first). */
export const START_URL = `${PORTAL_URL}/saas`;
