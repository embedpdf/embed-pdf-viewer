import { sql, type Kysely } from 'kysely';

import type { VisitorAnswers } from '../../auth/visitor-identity';
import type { Database as Schema } from '../schema';

/** A grant's visitor who answered its questions or wrote (migration 042). */
export interface GrantVisitorRow {
  grantId: string;
  visitorId: string;
  docId: string;
  answers: VisitorAnswers;
  emailVerifiedAt: number | null;
  /** When the visitor gave their answers; null for one who only wrote. */
  consentedAt: number | null;
  firstSeenAt: number;
  lastSeenAt: number;
}

/** A visitor as the visitors list shows it, with their own layer when it holds changes. */
export interface ListedGrantVisitor extends GrantVisitorRow {
  layer: { name: string; storageSizeBytes: number | null } | null;
}

export interface GrantVisitorListOptions {
  limit: number;
  /** Keyset cursor over `firstSeenAt`, the same shape as the other lists. */
  before?: { createdAt: number; id: string };
}

/** A visitor nobody has seen for longer than their grant's idle time. */
export interface IdleGrantVisitor {
  tenantId: string;
  grantId: string;
  visitorId: string;
  docId: string;
}

const ANSWER_COLUMNS = {
  displayName: 'display_name',
  email: 'email',
  title: 'title',
  organization: 'organization',
  organizationalUnit: 'organizational_unit',
} as const;

export class GrantVisitorsRepo {
  constructor(private readonly db: Kysely<Schema>) {}

  async find(grantId: string, visitorId: string): Promise<GrantVisitorRow | null> {
    const row = await this.db
      .selectFrom('grant_visitors')
      .selectAll()
      .where('grant_id', '=', grantId)
      .where('visitor_id', '=', visitorId)
      .executeTakeFirst();
    return row ? mapRow(row) : null;
  }

  /**
   * Record the visitor: their answers (`added`, for fields they hadn't
   * answered; one already given is never replaced) or their first write.
   * Seen now. A grant deleted meanwhile records nothing.
   */
  async record(input: {
    grantId: string;
    visitorId: string;
    docId: string;
    added?: VisitorAnswers;
    now: number;
  }): Promise<void> {
    const { grantId, visitorId, docId, now } = input;
    const added = input.added ?? {};
    const answered = Object.keys(added).length > 0;
    const grant = await this.db
      .selectFrom('grants')
      .select('id')
      .where('id', '=', grantId)
      .executeTakeFirst();
    if (!grant) return;
    await this.db
      .insertInto('grant_visitors')
      .values({
        grant_id: grantId,
        visitor_id: visitorId,
        doc_id: docId,
        display_name: added.displayName ?? null,
        email: added.email ?? null,
        title: added.title ?? null,
        organization: added.organization ?? null,
        organizational_unit: added.organizationalUnit ?? null,
        email_verified_at: null,
        consented_at: answered ? now : null,
        first_seen_at: now,
        last_seen_at: now,
      })
      .onConflict((oc) => oc.columns(['grant_id', 'visitor_id']).doNothing())
      .execute();
    const filled: Record<string, unknown> = { last_seen_at: now };
    for (const [field, column] of Object.entries(ANSWER_COLUMNS)) {
      const value = added[field as keyof VisitorAnswers];
      if (value !== undefined) filled[column] = sql`coalesce(${sql.ref(column)}, ${value})`;
    }
    if (answered) filled['consented_at'] = sql`coalesce(consented_at, ${now})`;
    await this.db
      .updateTable('grant_visitors')
      .set(filled)
      .where('grant_id', '=', grantId)
      .where('visitor_id', '=', visitorId)
      .execute();
  }

  /** The visitor came back: their idle clock restarts. Nothing to do for one without a row. */
  async see(grantId: string, visitorId: string, now: number): Promise<void> {
    await this.db
      .updateTable('grant_visitors')
      .set({ last_seen_at: now })
      .where('grant_id', '=', grantId)
      .where('visitor_id', '=', visitorId)
      .execute();
  }

  /** A grant's visitors newest first, with their own layer when it holds changes. */
  async list(grantId: string, opts: GrantVisitorListOptions): Promise<ListedGrantVisitor[]> {
    let q = this.db
      .selectFrom('grant_visitors as v')
      .leftJoin('layers as l', (join) =>
        join
          .onRef('l.grant_id', '=', 'v.grant_id')
          .onRef('l.visitor_id', '=', 'v.visitor_id')
          .on('l.deleted_at', 'is', null),
      )
      .selectAll('v')
      .select(['l.name as layer_name', 'l.current_artifact_size as layer_size'])
      .where('v.grant_id', '=', grantId)
      .orderBy('v.first_seen_at', 'desc')
      .orderBy('v.visitor_id', 'desc');
    if (opts.before) {
      const { createdAt, id } = opts.before;
      q = q.where((eb) =>
        eb.or([
          eb('v.first_seen_at', '<', createdAt),
          eb.and([eb('v.first_seen_at', '=', createdAt), eb('v.visitor_id', '<', id)]),
        ]),
      );
    }
    const rows = await q.limit(opts.limit).execute();
    return rows.map((row) => ({
      ...mapRow(row),
      layer:
        row.layer_name === null
          ? null
          : {
              name: row.layer_name,
              storageSizeBytes: row.layer_size === null ? null : Number(row.layer_size),
            },
    }));
  }

  async delete(grantId: string, visitorId: string): Promise<void> {
    await this.db
      .deleteFrom('grant_visitors')
      .where('grant_id', '=', grantId)
      .where('visitor_id', '=', visitorId)
      .execute();
  }

  /** How many visitors a grant has: what keeps it from being deleted. */
  async countForGrant(grantId: string): Promise<number> {
    const row = await this.db
      .selectFrom('grant_visitors')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('grant_id', '=', grantId)
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  /**
   * Up to `limit` visitors nobody has seen for longer than their grant's idle
   * time, the longest unseen first; only grants that set one.
   */
  async idle(now: number, limit: number): Promise<IdleGrantVisitor[]> {
    const rows = await this.db
      .selectFrom('grant_visitors as v')
      .innerJoin('grants as g', 'g.id', 'v.grant_id')
      .select(['g.tenant_id', 'v.grant_id', 'v.visitor_id', 'v.doc_id'])
      .where('g.visitor_idle_seconds', 'is not', null)
      .where(sql<number>`v.last_seen_at + g.visitor_idle_seconds * 1000`, '<', now)
      .orderBy('v.last_seen_at')
      .limit(limit)
      .execute();
    return rows.map((row) => ({
      tenantId: row.tenant_id,
      grantId: row.grant_id,
      visitorId: row.visitor_id,
      docId: row.doc_id,
    }));
  }
}

function mapRow(row: {
  grant_id: string;
  visitor_id: string;
  doc_id: string;
  display_name: string | null;
  email: string | null;
  title: string | null;
  organization: string | null;
  organizational_unit: string | null;
  email_verified_at: number | null;
  consented_at: number | null;
  first_seen_at: number;
  last_seen_at: number;
}): GrantVisitorRow {
  const answers: VisitorAnswers = {};
  for (const [field, column] of Object.entries(ANSWER_COLUMNS)) {
    const value = row[column];
    if (value !== null) answers[field as keyof VisitorAnswers] = value;
  }
  return {
    grantId: row.grant_id,
    visitorId: row.visitor_id,
    docId: row.doc_id,
    answers,
    emailVerifiedAt: row.email_verified_at === null ? null : Number(row.email_verified_at),
    consentedAt: row.consented_at === null ? null : Number(row.consented_at),
    firstSeenAt: Number(row.first_seen_at),
    lastSeenAt: Number(row.last_seen_at),
  };
}
