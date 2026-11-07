/**
 * Stand-in for `@azure/keyvault-secrets`, served to every test file that
 * calls `vi.mock('@azure/keyvault-secrets')` without a factory (see
 * "Faking an SDK in tests" in `docs/conventions/server-adapters.md`).
 * Tests set each call's result on {@link keyVaultSecrets} and reset it.
 */
import { vi } from 'vitest';

export const keyVaultSecrets = {
  getSecret: vi.fn(),
  /** What each client was built with. */
  clientOptions: [] as { vaultUrl: string; credential: unknown }[],
};

export class SecretClient {
  constructor(
    readonly vaultUrl: string,
    readonly credential: unknown,
  ) {
    keyVaultSecrets.clientOptions.push({ vaultUrl, credential });
  }
  getSecret(name: string, opts?: unknown): unknown {
    return keyVaultSecrets.getSecret(name, opts);
  }
}
