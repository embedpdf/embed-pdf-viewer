/**
 * Stand-in for `@google-cloud/secret-manager`, served to every test file
 * that calls `vi.mock('@google-cloud/secret-manager')` without a factory
 * (see "Faking an SDK in tests" in `docs/conventions/server-adapters.md`).
 * Tests set each call's result on {@link secretManager} and reset it.
 */
import { vi } from 'vitest';

export const secretManager = {
  accessSecretVersion: vi.fn(),
};

export class SecretManagerServiceClient {
  accessSecretVersion(input: unknown): unknown {
    return secretManager.accessSecretVersion(input);
  }
}
