import { describe, expect, test } from 'vitest';

import { forbiddenAddress, isPublicAddress } from '../../src/server/public-address';

describe('which addresses a route may call', () => {
  test('public addresses', () => {
    for (const address of [
      '93.184.216.34',
      '8.8.8.8',
      '172.15.0.1',
      '172.32.0.1',
      '100.63.255.255',
      '2606:2800:220:1:248:1893:25c8:1946',
      '2001:4860:4860::8888',
      '::ffff:8.8.8.8',
    ]) {
      expect(isPublicAddress(address), address).toBe(true);
    }
  });

  test('private, local and special ones', () => {
    for (const address of [
      '127.0.0.1',
      '127.255.255.254',
      '10.0.0.1',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // where a cloud keeps a machine's credentials
      '100.64.0.1',
      '0.0.0.0',
      '192.0.2.1',
      '198.18.0.1',
      '224.0.0.1',
      '255.255.255.255',
      '::',
      '::1',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
      'ff02::1',
      '2001:db8::1',
      // An IPv4 address inside an IPv6 one is judged as the IPv4 address it is.
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '::ffff:10.0.0.1',
      '::10.0.0.1',
      '64:ff9b::a00:1',
      '2002:a00:1::',
      // Not an address at all.
      'example.com',
      '1.2.3',
      '1.2.3.4.5',
      '256.1.1.1',
      ':::',
      '1::2::3',
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  const refused = (url: string, lookup: ((name: string) => Promise<string[]>) | null = null) =>
    forbiddenAddress(new URL(url), lookup);

  test('only http and https, and no user name or password', async () => {
    expect(await refused('ftp://example.com/list.crl')).toMatch(/only http and https/);
    expect(await refused('file:///etc/passwd')).toMatch(/only http and https/);
    expect(await refused('http://user:secret@example.com/')).toMatch(/user name or password/);
    expect(await refused('https://example.com/list.crl')).toBeNull();
  });

  test('an address written in a way that hides it is still the address it is', async () => {
    for (const url of [
      'http://127.0.0.1/',
      'http://2130706433/', // 127.0.0.1 as one number
      'http://0x7f.0.0.1/',
      'http://017700000001/',
      'http://[::1]/',
      'http://[::ffff:127.0.0.1]/',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.1.2.3:8080/ocsp',
    ]) {
      expect(await refused(url), url).toMatch(/private or local address/);
    }
    expect(await refused('http://93.184.216.34/ocsp')).toBeNull();
    expect(await refused('http://[2606:2800:220:1:248:1893:25c8:1946]/')).toBeNull();
  });

  test('local names', async () => {
    for (const url of [
      'http://localhost/',
      'http://LOCALHOST:3000/',
      'http://db.localhost/',
      'http://intranet/',
    ]) {
      expect(await refused(url), url).toMatch(/local name/);
    }
  });

  test('a name is judged by every address it leads to', async () => {
    const leadsTo =
      (...addresses: string[]) =>
      async () =>
        addresses;
    expect(await refused('http://ocsp.example.com/', leadsTo('93.184.216.34'))).toBeNull();
    expect(await refused('http://ocsp.example.com/', leadsTo('93.184.216.34', '10.0.0.7'))).toMatch(
      /leads to 10\.0\.0\.7/,
    );
    expect(await refused('http://ocsp.example.com/', leadsTo('::1'))).toMatch(/leads to ::1/);
    expect(await refused('http://ocsp.example.com/', leadsTo())).toMatch(/leads to no address/);
    expect(
      await refused('http://ocsp.example.com/', async () => {
        throw new Error('ENOTFOUND');
      }),
    ).toMatch(/leads to no address/);
    // With nothing to look names up with, a name is taken at its word.
    expect(await refused('http://ocsp.example.com/', null)).toBeNull();
  });
});
