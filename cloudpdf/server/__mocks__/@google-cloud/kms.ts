/**
 * Stand-in for `@google-cloud/kms`, served to every test file that calls
 * `vi.mock('@google-cloud/kms')` without a factory (see "Faking an SDK in
 * tests" in `docs/conventions/server-adapters.md`). Tests set each call's
 * result on {@link cloudKms} and reset it.
 */
import { vi } from 'vitest';

export const cloudKms = {
  encrypt: vi.fn(),
  decrypt: vi.fn(),
};

export class KeyManagementServiceClient {
  encrypt(input: unknown): unknown {
    return cloudKms.encrypt(input);
  }
  decrypt(input: unknown): unknown {
    return cloudKms.decrypt(input);
  }
}
