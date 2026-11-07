/**
 * Stand-in for `@azure/keyvault-keys`, served to every test file that
 * calls `vi.mock('@azure/keyvault-keys')` without a factory (see "Faking
 * an SDK in tests" in `docs/conventions/server-adapters.md`). Tests set
 * each call's result on {@link keyVaultKeys} and reset it.
 */
import { vi } from 'vitest';

export const keyVaultKeys = {
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  wrapKey: vi.fn(),
  unwrapKey: vi.fn(),
  /** What each client was built with. */
  clientOptions: [] as { keyId: string; credential: unknown }[],
};

export class CryptographyClient {
  constructor(
    readonly keyId: string,
    readonly credential: unknown,
  ) {
    keyVaultKeys.clientOptions.push({ keyId, credential });
  }
  encrypt(input: unknown): unknown {
    return keyVaultKeys.encrypt(input);
  }
  decrypt(input: unknown): unknown {
    return keyVaultKeys.decrypt(input);
  }
  wrapKey(algorithm: string, key: Buffer): unknown {
    return keyVaultKeys.wrapKey(algorithm, key);
  }
  unwrapKey(algorithm: string, encryptedKey: Buffer): unknown {
    return keyVaultKeys.unwrapKey(algorithm, encryptedKey);
  }
}
