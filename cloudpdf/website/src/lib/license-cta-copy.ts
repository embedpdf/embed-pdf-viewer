/**
 * Shared copy for the license CTA — the single content source for both
 * renderings (the interactive docs component and its Markdown
 * projection), per DOCS-PLATFORM-ARCHITECTURE.md's one-source rule.
 */
export const LICENSE_CTA_COPY = {
  title: 'Need a license key?',
  body: 'Every self-hosted server runs on a license key — a development key for local try-out, a subscription key for production, or an air-gapped certificate for isolated networks.',
  action: 'Request a license key',
  /** Markdown fallback destination; the component opens the sales dialog instead. */
  contactPath: '/contact',
} as const;
