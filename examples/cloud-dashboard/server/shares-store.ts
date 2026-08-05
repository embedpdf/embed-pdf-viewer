import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

/**
 * The demo's stand-in for the sharing table a real integrator would keep in
 * their own database: who was issued a doc-scoped token, with which scopes,
 * for which layer, until when.
 *
 * A JSON sidecar rather than the CloudPDF database on purpose — shares are
 * *the customer's* data in this architecture, never the PDF server's. Keeping
 * them outside the server's schema is the honest shape, and it survives a page
 * reload, which the old smoke example's in-memory tokens did not.
 */

export interface StoredShare {
  id: string;
  tenantId: string;
  docId: string;
  name: string;
  role: string;
  layerName: string;
  scope: string[];
  identity: Record<string, unknown>;
  token: string;
  createdAt: number;
  expiresAt: number;
  /**
   * Set by callers that must not create twice for the same intent — the
   * dashboard's "open your own document" path, which React re-runs on
   * every remount. Creating with a key that already has a LIVE share
   * returns that share instead of minting a second token.
   */
  idempotencyKey?: string;
}

export class SharesStore {
  private shares: StoredShare[] = [];
  /** Serializes writes so two concurrent creates can't clobber the file. */
  private writing: Promise<void> = Promise.resolve();

  private constructor(private readonly path: string) {}

  static async open(path: string): Promise<SharesStore> {
    const store = new SharesStore(path);
    try {
      const raw = await readFile(path, 'utf8');
      const parsed = JSON.parse(raw) as { shares?: StoredShare[] };
      store.shares = parsed.shares ?? [];
    } catch {
      // No file yet (or an unreadable one): start empty. This is demo state,
      // never a source of truth worth failing a boot over.
    }
    return store;
  }

  /** Live shares for a tenant, newest first. Expired ones are dropped lazily. */
  list(tenantId: string, docId?: string): StoredShare[] {
    const now = Date.now();
    return this.shares
      .filter((s) => s.tenantId === tenantId && s.expiresAt > now)
      .filter((s) => (docId ? s.docId === docId : true))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  countByDoc(tenantId: string): Map<string, number> {
    const counts = new Map<string, number>();
    for (const share of this.list(tenantId)) {
      counts.set(share.docId, (counts.get(share.docId) ?? 0) + 1);
    }
    return counts;
  }

  async create(input: Omit<StoredShare, 'id' | 'createdAt'>): Promise<StoredShare> {
    if (input.idempotencyKey) {
      const existing = this.list(input.tenantId, input.docId).find(
        (s) => s.idempotencyKey === input.idempotencyKey,
      );
      if (existing) return existing;
    }
    const share: StoredShare = { ...input, id: randomUUID(), createdAt: Date.now() };
    this.shares.push(share);
    await this.persist();
    return share;
  }

  async remove(tenantId: string, id: string): Promise<void> {
    this.shares = this.shares.filter((s) => !(s.id === id && s.tenantId === tenantId));
    await this.persist();
  }

  /** Drop every share for a document — called when the document is deleted. */
  async removeForDocument(tenantId: string, docId: string): Promise<void> {
    this.shares = this.shares.filter((s) => !(s.tenantId === tenantId && s.docId === docId));
    await this.persist();
  }

  private persist(): Promise<void> {
    this.writing = this.writing.then(() =>
      writeFile(this.path, JSON.stringify({ shares: this.shares }, null, 2), 'utf8'),
    );
    return this.writing;
  }
}
