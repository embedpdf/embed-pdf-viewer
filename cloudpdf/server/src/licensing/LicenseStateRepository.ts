import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';

import type { Database, LicenseRuntimeStateTable } from '../db/schema';

export type LicenseRuntimeState = Selectable<LicenseRuntimeStateTable>;

export class LicenseStateRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async getOrCreate(): Promise<LicenseRuntimeState> {
    const now = Date.now();
    await this.db
      .insertInto('license_runtime_state')
      .values({
        singleton_id: 1,
        deployment_id: randomUUID(),
        license_mode: null,
        license_key_fingerprint: null,
        keygen_license_id: null,
        installed_certificate: null,
        certificate_installed_at: null,
        last_validated_at: null,
        last_observed_time: now,
        validation_data_json: null,
        created_at: now,
        updated_at: now,
      })
      .onConflict((conflict) => conflict.column('singleton_id').doNothing())
      .execute();
    return this.load();
  }

  async installCertificate(certificate: string, validationData: unknown): Promise<void> {
    const now = Date.now();
    await this.db
      .updateTable('license_runtime_state')
      .set({
        certificate_installed_at: now,
        installed_certificate: certificate,
        last_observed_time: now,
        last_validated_at: now,
        license_key_fingerprint: null,
        license_mode: 'air-gapped',
        validation_data_json: JSON.stringify(validationData),
        updated_at: now,
      })
      .where('singleton_id', '=', 1)
      .executeTakeFirstOrThrow();
  }

  async load(): Promise<LicenseRuntimeState> {
    return this.db
      .selectFrom('license_runtime_state')
      .selectAll()
      .where('singleton_id', '=', 1)
      .executeTakeFirstOrThrow();
  }

  async saveConnectedValidation(input: {
    keyFingerprint: string;
    keygenLicenseId: string;
    validationData: unknown;
  }): Promise<void> {
    const now = Date.now();
    await this.db
      .updateTable('license_runtime_state')
      .set({
        installed_certificate: null,
        certificate_installed_at: null,
        keygen_license_id: input.keygenLicenseId,
        last_observed_time: now,
        last_validated_at: now,
        license_key_fingerprint: input.keyFingerprint,
        license_mode: 'connected',
        validation_data_json: JSON.stringify(input.validationData),
        updated_at: now,
      })
      .where('singleton_id', '=', 1)
      .executeTakeFirstOrThrow();
  }

  async touchObservedTime(now = Date.now()): Promise<void> {
    await this.db
      .updateTable('license_runtime_state')
      .set({ last_observed_time: now, updated_at: now })
      .where('singleton_id', '=', 1)
      .executeTakeFirstOrThrow();
  }

  async acquireLease(
    name: string,
    ownerId: string,
    durationMs: number,
    now = Date.now(),
  ): Promise<boolean> {
    await this.db
      .insertInto('license_operation_lease')
      .values({ name, owner_id: ownerId, expires_at: now, updated_at: now })
      .onConflict((conflict) => conflict.column('name').doNothing())
      .execute();
    const result = await this.db
      .updateTable('license_operation_lease')
      .set({ owner_id: ownerId, expires_at: now + durationMs, updated_at: now })
      .where('name', '=', name)
      .where((expression) =>
        expression.or([expression('owner_id', '=', ownerId), expression('expires_at', '<=', now)]),
      )
      .executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  }

  async releaseLease(name: string, ownerId: string): Promise<void> {
    await this.db
      .deleteFrom('license_operation_lease')
      .where('name', '=', name)
      .where('owner_id', '=', ownerId)
      .execute();
  }
}
