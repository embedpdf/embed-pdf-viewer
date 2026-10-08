/**
 * The bundled worker files are named only where a worker can start from them: on a page of the
 * same origin as the scripts. A test runner has no page, and its scripts are file: URLs.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { findEncoderWorkerFile, findEngineWorkerFile } from '../src/worker-files';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the bundled worker files', () => {
  it('are not named where there is no page', () => {
    expect(typeof location).toBe('undefined');
    expect(findEngineWorkerFile()).toBeNull();
    expect(findEncoderWorkerFile()).toBeNull();
  });

  it('are not named on a page of another origin than the scripts', () => {
    vi.stubGlobal('location', { origin: 'https://site.test', href: 'https://site.test/' });
    expect(findEngineWorkerFile()).toBeNull();
    expect(findEncoderWorkerFile()).toBeNull();
  });

  it('are not named on a page with an opaque origin', () => {
    vi.stubGlobal('location', { origin: 'null', href: 'data:text/html,' });
    expect(findEngineWorkerFile()).toBeNull();
  });
});
