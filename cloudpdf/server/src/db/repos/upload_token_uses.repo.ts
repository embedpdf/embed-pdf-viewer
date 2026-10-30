import { sql, type Kysely } from 'kysely';

import type { Database as Schema } from '../schema';

/** How many documents each upload token has started (`upload_token_uses`). */
export class UploadTokenUsesRepo {
  constructor(private readonly db: Kysely<Schema>) {}

  /**
   * Takes one of the token's `maxFiles` uses in a single statement: the
   * row is made on the first, and raised only while under the limit, so
   * concurrent inits each take their own and none takes one past the
   * last. False when every use is taken.
   */
  async claim(input: {
    jti: string;
    tenantId: string;
    maxFiles: number;
    expiresAt: number;
  }): Promise<boolean> {
    const row = await this.db
      .insertInto('upload_token_uses')
      .values({ jti: input.jti, tenant_id: input.tenantId, files: 1, expires_at: input.expiresAt })
      .onConflict((oc) =>
        oc
          .column('jti')
          .doUpdateSet({ files: sql<number>`upload_token_uses.files + 1` })
          .where('upload_token_uses.files', '<', input.maxFiles),
      )
      .returning('files')
      .executeTakeFirst();
    return row !== undefined;
  }

  /** Gives a use back, when the document it was taken for wasn't made. */
  async release(jti: string): Promise<void> {
    await this.db
      .updateTable('upload_token_uses')
      .set({ files: sql<number>`files - 1` })
      .where('jti', '=', jti)
      .where('files', '>', 0)
      .execute();
  }
}
