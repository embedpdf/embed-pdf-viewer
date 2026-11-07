import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Grant visitors. Every exchange names a visitor: the session token
 * makes them the author of what they add, and on a per-visitor grant it pins
 * their own layer, `visitor-<id>`. The visitor comes back as a handle,
 * `vis_<id>.<issued>.<mac>`: when it was issued (seconds, base 36), and an
 * HMAC over the grant, the visitor and that time. A handle works only for
 * the grant that issued it, needs no table, and can't be made to look
 * newer than it is.
 */

/** Every visitor layer's name starts with it; a layer a grant or token names never does. */
export const VISITOR_LAYER_PREFIX = 'visitor-';

/** A new visitor: 96 random bits as hex, so layer names and handles stay URL-safe. */
export function newVisitorId(): string {
  return randomBytes(12).toString('hex');
}

/** The visitor's own layer on a per-visitor grant. */
export function visitorLayerName(visitorId: string): string {
  return `${VISITOR_LAYER_PREFIX}${visitorId}`;
}

/** The visitor as the author in a session token's identity. */
export function visitorUserId(visitorId: string): string {
  return `visitor_${visitorId}`;
}

export function isVisitorLayerName(layerName: string): boolean {
  return layerName.startsWith(VISITOR_LAYER_PREFIX);
}

/**
 * The grant and visitor a layer belongs to, when a grant session of that
 * visitor writes it: the stamps its row gets at the first write.
 */
export function visitorLayerOf(
  sub: string,
  layerName: string,
): { grantId: string; visitorId: string } | null {
  if (!sub.startsWith('grant:') || !isVisitorLayerName(layerName)) return null;
  return {
    grantId: sub.slice('grant:'.length),
    visitorId: layerName.slice(VISITOR_LAYER_PREFIX.length),
  };
}

const HANDLE = /^vis_([0-9a-f]{24})\.([0-9a-z]{1,10})\.([A-Za-z0-9_-]{22})$/;

/** A visitor a handle names, and when it was issued (ms since the epoch). */
export interface ReturningVisitor {
  readonly visitorId: string;
  readonly issuedAt: number;
}

export class VisitorHandles {
  private readonly key: Buffer;

  /** `secret`: the deployment's signing secret, the same authority that mints the session tokens. */
  constructor(secret: string | Buffer) {
    this.key = createHmac('sha256', secret).update('cloudpdf visitor handle v1').digest();
  }

  /** The visitor's handle, issued at `now` (ms since the epoch). */
  issue(grantId: string, visitorId: string, now: number): string {
    const issued = Math.floor(now / 1000).toString(36);
    return `vis_${visitorId}.${issued}.${this.mac(grantId, visitorId, issued)}`;
  }

  /** The visitor a handle names and when, when this grant issued it; `null` otherwise. */
  read(grantId: string, handle: string): ReturningVisitor | null {
    const match = HANDLE.exec(handle);
    if (!match) return null;
    const [, visitorId, issued, mac] = match as unknown as [string, string, string, string];
    const expected = Buffer.from(this.mac(grantId, visitorId, issued));
    const given = Buffer.from(mac);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    return { visitorId, issuedAt: parseInt(issued, 36) * 1000 };
  }

  private mac(grantId: string, visitorId: string, issued: string): string {
    return createHmac('sha256', this.key)
      .update(`${grantId}\n${visitorId}\n${issued}`)
      .digest('base64url')
      .slice(0, 22);
  }
}
