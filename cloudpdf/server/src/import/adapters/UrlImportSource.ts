/**
 * URL import source — the universal `documents.import` integration.
 *
 * The caller mints a URL that already carries its authority (a
 * presigned S3 / GCS / Azure / R2 / MinIO GET, or any HTTPS endpoint
 * the deployment's import policy allows) and the server pulls the
 * bytes. No credentials ever cross the API boundary; the URL IS the
 * capability, so it is treated like a secret — `info.location` and
 * every error message carry origin + path only, never the query
 * string.
 *
 * SSRF posture (the reason this adapter is more than `fetch`):
 *   - scheme allowlist: https, plus http only under
 *     `policy.allowHttp` (dev / MinIO);
 *   - userinfo (`https://user:pass@…`) is rejected outright;
 *   - every address the hostname resolves to must be publicly
 *     routable unless `policy.allowPrivateNetworks` — loopback,
 *     RFC1918, CGNAT, link-local (incl. the 169.254.169.254 cloud
 *     metadata endpoint), ULA, NAT64 and multicast are refused;
 *   - the vetted addresses are PINNED for the actual connection via a
 *     custom `lookup` (and `agent: false` disables socket reuse), so
 *     a DNS rebind between check and connect cannot retarget the
 *     request;
 *   - redirects are not followed — a 3xx is an error, because a
 *     redirect is exactly how a "public" URL becomes a private one;
 *   - the response must declare Content-Length (presigned
 *     object-store GETs always do); chunked/unknown lengths are
 *     refused so the byte-exact streaming `put` contract holds
 *     downstream.
 */
import { lookup as dnsLookup } from 'node:dns';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

import type { ImportPolicy } from '../config/ImportPolicySchema';
import {
  ImportSourceError,
  type ImportSource,
  type ImportSourceInfo,
  type ImportSourceOpen,
} from '../ImportSource';

/**
 * Everything that is not publicly routable. v4-mapped v6 addresses
 * (`::ffff:10.0.0.1`) are unwrapped and checked as v4 so the mapped
 * spelling can't smuggle a private target past the v6 rules.
 */
const nonPublicNets = (() => {
  const b = new BlockList();
  const v4: Array<[string, number]> = [
    ['0.0.0.0', 8], // "this network" / unspecified
    ['10.0.0.0', 8], // RFC1918
    ['100.64.0.0', 10], // CGNAT
    ['127.0.0.0', 8], // loopback
    ['169.254.0.0', 16], // link-local incl. cloud metadata
    ['172.16.0.0', 12], // RFC1918
    ['192.0.0.0', 24], // IETF protocol assignments
    ['192.168.0.0', 16], // RFC1918
    ['198.18.0.0', 15], // benchmarking
    ['224.0.0.0', 3], // multicast + reserved + broadcast
  ];
  for (const [addr, prefix] of v4) b.addSubnet(addr, prefix, 'ipv4');
  const v6: Array<[string, number]> = [
    ['::', 128], // unspecified
    ['::1', 128], // loopback
    ['64:ff9b::', 96], // NAT64 (embedded v4 unverifiable here)
    ['fc00::', 7], // ULA
    ['fe80::', 10], // link-local
    ['ff00::', 8], // multicast
  ];
  for (const [addr, prefix] of v6) b.addSubnet(addr, prefix, 'ipv6');
  return b;
})();

export function isPubliclyRoutableAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return false;
  if (family === 6) {
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
    if (mapped) return isPubliclyRoutableAddress(mapped[1]!);
    return !nonPublicNets.check(ip, 'ipv6');
  }
  return !nonPublicNets.check(ip);
}

interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface UrlImportSourceOptions {
  url: string;
  policy: ImportPolicy;
}

export class UrlImportSource implements ImportSource {
  readonly info: ImportSourceInfo;
  private readonly url: URL;
  private readonly policy: ImportPolicy;

  constructor(opts: UrlImportSourceOptions) {
    let parsed: URL;
    try {
      parsed = new URL(opts.url);
    } catch {
      throw new ImportSourceError('policy', 'source.url is not a valid absolute URL', false);
    }
    if (parsed.username || parsed.password) {
      throw new ImportSourceError('policy', 'source.url must not embed credentials', false);
    }
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && opts.policy.allowHttp)) {
      throw new ImportSourceError(
        'policy',
        parsed.protocol === 'http:'
          ? 'http: sources are disabled by this deployment (CLOUDPDF_IMPORT_ALLOW_HTTP)'
          : `unsupported source scheme ${parsed.protocol.replace(':', '')}; use https`,
        false,
      );
    }
    this.url = parsed;
    this.policy = opts.policy;
    // Origin + path only. The query string of a presigned URL is the
    // credential — it must never appear in diagnostics.
    this.info = { kind: 'url', location: `${parsed.origin}${parsed.pathname}` };
  }

  async open(opts: { signal: AbortSignal }): Promise<ImportSourceOpen> {
    const addresses = await this.resolveVetted();
    const res = await this.get(addresses, opts.signal);
    const status = res.statusCode ?? 0;
    const refuse = (err: ImportSourceError): never => {
      res.destroy();
      throw err;
    };
    if (status >= 300 && status < 400) {
      refuse(
        new ImportSourceError(
          'unsupported',
          'source responded with a redirect; imports require a direct URL',
          false,
        ),
      );
    }
    if (status === 404 || status === 410) {
      refuse(
        new ImportSourceError(
          'not_found',
          `source object not found at ${this.info.location}`,
          false,
        ),
      );
    }
    if (status === 401 || status === 403) {
      refuse(
        new ImportSourceError(
          'denied',
          `source refused access (HTTP ${status}) — presigned URL expired or unauthorized`,
          false,
        ),
      );
    }
    if (status >= 500) {
      refuse(new ImportSourceError('upstream', `source responded HTTP ${status}`, true));
    }
    if (status !== 200) {
      refuse(
        new ImportSourceError(
          'unsupported',
          `source responded HTTP ${status}; expected 200`,
          false,
        ),
      );
    }
    const rawLength = res.headers['content-length'];
    const contentLength = rawLength === undefined ? Number.NaN : Number(rawLength);
    if (!Number.isFinite(contentLength) || contentLength < 1) {
      refuse(
        new ImportSourceError(
          'unsupported',
          'source did not declare a positive Content-Length; imports require a known length',
          false,
        ),
      );
    }
    if (contentLength > this.policy.maxBytes) {
      refuse(
        new ImportSourceError(
          'too_large',
          `source declares ${contentLength} bytes; this deployment caps imports at ${this.policy.maxBytes}`,
          false,
        ),
      );
    }
    const contentType = res.headers['content-type'];
    // Opportunistic revision provenance: presigned object-store GETs
    // report the served version in a provider header.
    const resolvedRevision =
      headerValue(res.headers['x-amz-version-id']) ??
      headerValue(res.headers['x-goog-generation']) ??
      headerValue(res.headers['x-ms-version-id']);
    return {
      body: res,
      contentLength,
      ...(contentType ? { contentType } : {}),
      ...(resolvedRevision ? { resolvedRevision } : {}),
    };
  }

  /** Resolve the hostname and refuse any non-public destination. */
  private async resolveVetted(): Promise<ResolvedAddress[]> {
    const host = this.url.hostname.replace(/^\[|\]$/g, ''); // URL brackets IPv6 literals
    const literalFamily = isIP(host);
    let addresses: ResolvedAddress[];
    if (literalFamily !== 0) {
      addresses = [{ address: host, family: literalFamily as 4 | 6 }];
    } else {
      const resolved = await new Promise<Array<{ address: string; family: number }>>(
        (resolve, reject) => {
          dnsLookup(host, { all: true }, (err, addrs) => (err ? reject(err) : resolve(addrs)));
        },
      ).catch((err: NodeJS.ErrnoException) => {
        throw new ImportSourceError(
          'upstream',
          `could not resolve source host ${host}${err.code ? ` (${err.code})` : ''}`,
          true,
        );
      });
      addresses = resolved.map((a) => ({ address: a.address, family: a.family === 6 ? 6 : 4 }));
    }
    if (addresses.length === 0) {
      throw new ImportSourceError('upstream', `source host ${host} resolved to no addresses`, true);
    }
    if (!this.policy.allowPrivateNetworks) {
      const blocked = addresses.find((a) => !isPubliclyRoutableAddress(a.address));
      if (blocked) {
        throw new ImportSourceError(
          'policy',
          `source host ${host} resolves to a non-public address; private-network imports are disabled (CLOUDPDF_IMPORT_ALLOW_PRIVATE_NETWORKS)`,
          false,
        );
      }
    }
    return addresses;
  }

  /**
   * Issue the GET against the PINNED addresses. `agent: false` gives
   * the request its own connection (no pooled-socket reuse), and the
   * custom lookup answers with the vetted set no matter what DNS says
   * now — together they close the vet-then-rebind window.
   */
  private get(addresses: ResolvedAddress[], signal: AbortSignal): Promise<IncomingMessage> {
    let next = 0;
    const pinnedLookup = ((
      _host: string,
      options: { all?: boolean },
      cb: (err: NodeJS.ErrnoException | null, address: unknown, family?: number) => void,
    ): void => {
      if (options.all) {
        cb(
          null,
          addresses.map((a) => ({ address: a.address, family: a.family })),
        );
      } else {
        const pick = addresses[Math.min(next++, addresses.length - 1)]!;
        cb(null, pick.address, pick.family);
      }
    }) as unknown as LookupFunction;
    const request = this.url.protocol === 'https:' ? httpsRequest : httpRequest;
    return new Promise((resolve, reject) => {
      const req = request(
        this.url,
        {
          method: 'GET',
          signal,
          agent: false,
          lookup: pinnedLookup,
          headers: { accept: 'application/pdf, */*' },
        },
        resolve,
      );
      req.on('error', (err: NodeJS.ErrnoException) => {
        reject(
          signal.aborted
            ? new ImportSourceError(
                'upstream',
                'import timed out or was aborted while contacting the source',
                true,
              )
            : new ImportSourceError(
                'upstream',
                `could not fetch from source: ${err.code ?? err.message}`,
                true,
              ),
        );
      });
      req.end();
    });
  }
}

function headerValue(raw: string | string[] | undefined): string | null {
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw && raw.length > 0 ? raw : null;
}
