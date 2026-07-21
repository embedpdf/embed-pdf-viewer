import { describe, expect, it } from 'vitest';

import { frameworkFromDocsPath, validateFeedbackPayload } from './docs-feedback';

const validPayload = {
  id: '8a7b45aa-a847-4b31-b202-76e42c98df7a',
  site: 'embedpdf',
  path: '/docs/headless/react/getting-started',
  sectionId: 'your-first-viewer',
  helpful: true,
  reasons: ['clear'],
  comment: '  The example was concise.  ',
};

describe('validateFeedbackPayload', () => {
  it('normalizes a valid submission', () => {
    const result = validateFeedbackPayload(validPayload);

    expect(result).toEqual({
      ok: true,
      value: {
        ...validPayload,
        reasons: ['clear'],
        comment: 'The example was concise.',
      },
    });
  });

  it('deduplicates reasons', () => {
    const result = validateFeedbackPayload({
      ...validPayload,
      reasons: ['clear', 'clear', 'found_answer'],
    });

    expect(result.ok && result.value.reasons).toEqual(['clear', 'found_answer']);
  });

  it('rejects a negative reason on a positive vote', () => {
    expect(validateFeedbackPayload({ ...validPayload, reasons: ['example_failed'] })).toMatchObject(
      { ok: false, kind: 'invalid' },
    );
  });

  it('rejects paths outside documentation', () => {
    expect(validateFeedbackPayload({ ...validPayload, path: '/pricing' })).toMatchObject({
      ok: false,
      kind: 'invalid',
    });
  });

  it('silently identifies honeypot submissions', () => {
    expect(validateFeedbackPayload({ ...validPayload, company: 'Spambot Inc.' })).toMatchObject({
      ok: false,
      kind: 'bot',
    });
  });
});

describe('frameworkFromDocsPath', () => {
  it('extracts a supported framework from generated docs routes', () => {
    expect(frameworkFromDocsPath('/docs/headless/vue/getting-started')).toBe('vue');
  });

  it('returns null for framework-neutral routes', () => {
    expect(frameworkFromDocsPath('/docs/viewer/getting-started')).toBeNull();
  });
});
