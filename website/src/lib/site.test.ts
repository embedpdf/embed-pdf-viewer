import { describe, expect, it } from 'vitest';

import { getMetadataBase } from './site';

describe('getMetadataBase', () => {
  it('uses the exact deployment URL for previews', () => {
    expect(
      getMetadataBase({
        VERCEL_ENV: 'preview',
        VERCEL_URL: 'embedpdf-git-social-images.vercel.app',
        VERCEL_PROJECT_PRODUCTION_URL: 'www.embedpdf.com',
      }).origin,
    ).toBe('https://embedpdf-git-social-images.vercel.app');
  });

  it('uses the canonical project domain in production', () => {
    expect(
      getMetadataBase({
        VERCEL_ENV: 'production',
        VERCEL_URL: 'embedpdf-abc123.vercel.app',
        VERCEL_PROJECT_PRODUCTION_URL: 'www.embedpdf.com',
      }).origin,
    ).toBe('https://www.embedpdf.com');
  });

  it('falls back to the local development server outside Vercel', () => {
    expect(getMetadataBase({}).origin).toBe('http://localhost:3100');
  });
});
