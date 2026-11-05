import { describe, expect, test } from 'vitest';
import { version } from '../../package.json';
import { API_VERSION, apiVersionOf, parseApiVersion } from '../../src/wire';

describe('API version', () => {
  test('is the major and minor of the package version', () => {
    const [major, minor] = version.split('.');
    expect(API_VERSION).toBe(`${major}.${minor}`);
    expect(apiVersionOf('3.0.0-next.22')).toBe('3.0');
    expect(apiVersionOf('3.12.4')).toBe('3.12');
    expect(() => apiVersionOf('next')).toThrow();
  });

  test('reads <major>.<minor> and nothing else', () => {
    expect(parseApiVersion('3.0')).toEqual({ major: 3, minor: 0 });
    expect(parseApiVersion('3.12')).toEqual({ major: 3, minor: 12 });
    for (const raw of ['', '3', '3.0.1', 'v3.0', '03.0', '3.00', '3.0 ', '3.x']) {
      expect(parseApiVersion(raw)).toBeNull();
    }
  });
});
