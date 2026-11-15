/**
 * Whether an address is one on the public internet. A route that calls addresses taken from
 * certificates must not be led to the machine it runs on or to the network behind it: a PDF
 * can carry any certificate, with any address in it.
 */

/** The four numbers of an IPv4 address written with dots, or null when the text is not one. */
function parseIpv4(text: string): number[] | null {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  return numbers.every((number) => number >= 0 && number <= 255) ? numbers : null;
}

/** The eight 16-bit groups of an IPv6 address, or null when the text is not one. */
function parseIpv6(text: string): number[] | null {
  let address = text;
  // A dotted IPv4 tail takes the place of the last two groups.
  const tail = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
  if (tail) {
    const v4 = parseIpv4(tail[2]!);
    if (!v4) return null;
    const high = ((v4[0]! << 8) | v4[1]!).toString(16);
    const low = ((v4[2]! << 8) | v4[3]!).toString(16);
    address = `${tail[1]}${high}:${low}`;
  }
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const groupsOf = (half: string) => (half === '' ? [] : half.split(':'));
  const head = groupsOf(halves[0]!);
  const rest = halves.length === 2 ? groupsOf(halves[1]!) : [];
  const gap = 8 - head.length - rest.length;
  if (halves.length === 2 ? gap < 1 : gap !== 0) return null;
  const groups = [...head, ...new Array<string>(halves.length === 2 ? gap : 0).fill('0'), ...rest];
  const numbers = groups.map((group) =>
    /^[0-9a-f]{1,4}$/i.test(group) ? parseInt(group, 16) : NaN,
  );
  return numbers.length === 8 && numbers.every((number) => !Number.isNaN(number)) ? numbers : null;
}

/** Whether an IPv4 address is outside every range set aside for private, local or special use. */
function publicIpv4([a, b, c]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127) return false; // this network, private, loopback
  if (a === 100 && b! >= 64 && b! <= 127) return false; // shared address space (RFC 6598)
  if (a === 169 && b === 254) return false; // link-local, where cloud metadata lives
  if (a === 172 && b! >= 16 && b! <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // protocol assignments, documentation
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // documentation
  if (a === 203 && b === 0 && c === 113) return false; // documentation
  return a! < 224; // multicast and reserved from 224 up
}

/** Whether an IPv6 address is a public one. An address that wraps an IPv4 address is judged by that one. */
function publicIpv6(groups: number[]): boolean {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const v4 = (high: number, low: number) =>
    publicIpv4([high >> 8, high & 0xff, low >> 8, low & 0xff]);
  const leadingZeros = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  if (leadingZeros && g5 === 0xffff) return v4(g6, g7); // IPv4-mapped
  if (leadingZeros && g5 === 0) return g6 === 0 && g7 <= 1 ? false : v4(g6, g7); // unspecified, loopback, IPv4-compatible
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return v4(g6, g7); // NAT64
  }
  if (g0 === 0x2002) return v4(g1, g2); // 6to4
  if (g0 === 0x2001 && g1 === 0) return false; // Teredo
  if (g0 === 0x2001 && g1 === 0xdb8) return false; // documentation
  if ((g0 & 0xfe00) === 0xfc00) return false; // unique local
  if ((g0 & 0xffc0) === 0xfe80) return false; // link-local
  if ((g0 & 0xff00) === 0xff00) return false; // multicast
  return true;
}

/**
 * Whether `address`, an IPv4 or IPv6 address as text, is a public one. Text that is neither
 * is not.
 */
export function isPublicAddress(address: string): boolean {
  const v4 = parseIpv4(address);
  if (v4) return publicIpv4(v4);
  const v6 = parseIpv6(address);
  return v6 ? publicIpv6(v6) : false;
}

/** The address a host of a URL is, when it is written as one; null for a name. */
export function addressOfHost(hostname: string): string | null {
  const bare =
    hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  return parseIpv4(bare) || parseIpv6(bare) ? bare : null;
}

/** Resolves a host name to the addresses it leads to. */
export type HostLookup = (hostname: string) => Promise<string[]>;

/**
 * The lookup of the runtime, where it has one: Node's resolver, which Bun and Deno have too.
 * Null where there is none, such as a worker at the edge, which cannot reach a private
 * network to begin with.
 */
export async function runtimeLookup(): Promise<HostLookup | null> {
  try {
    // Named through a variable so a bundler for another runtime leaves it alone.
    const name = 'node:dns/promises';
    const dns = (await import(/* @vite-ignore */ name)) as {
      lookup(host: string, options: { all: true }): Promise<{ address: string }[]>;
    };
    return async (hostname) =>
      (await dns.lookup(hostname, { all: true })).map((entry) => entry.address);
  } catch {
    return null;
  }
}

/**
 * Why a URL may not be called, or null when it may: only `http` and `https`, no user name or
 * password, and a host that is a public address or a name that leads only to public ones.
 * A name with no dot, and `localhost`, are local names. With no `lookup`, a name is taken at
 * its word.
 */
export async function forbiddenAddress(
  url: URL,
  lookup: HostLookup | null,
): Promise<string | null> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return `only http and https addresses are asked, not ${url.protocol}`;
  }
  if (url.username || url.password) return 'an address with a user name or password is not asked';
  const address = addressOfHost(url.hostname);
  if (address) {
    return isPublicAddress(address) ? null : `${address} is a private or local address`;
  }
  const name = url.hostname.toLowerCase().replace(/\.$/, '');
  if (name === 'localhost' || name.endsWith('.localhost') || !name.includes('.')) {
    return `${url.hostname} is a local name`;
  }
  if (!lookup) return null;
  let addresses: string[];
  try {
    addresses = await lookup(name);
  } catch {
    return `${url.hostname} leads to no address`;
  }
  if (addresses.length === 0) return `${url.hostname} leads to no address`;
  const local = addresses.find((entry) => !isPublicAddress(entry));
  return local ? `${url.hostname} leads to ${local}, a private or local address` : null;
}
