/**
 * Stand-in for `@aws-sdk/client-secrets-manager`, served to every test
 * file that calls `vi.mock('@aws-sdk/client-secrets-manager')` without a
 * factory (see "Faking an SDK in tests" in
 * `docs/conventions/server-adapters.md`). Tests set each `send` result on
 * {@link secretsManager} and reset it.
 */
import { vi } from 'vitest';

export const secretsManager = {
  send: vi.fn(),
  /** What each client was built with. */
  clientOptions: [] as unknown[],
};

export class SecretsManagerClient {
  constructor(opts: unknown) {
    secretsManager.clientOptions.push(opts);
  }
  send(command: unknown): unknown {
    return secretsManager.send(command);
  }
}

export class GetSecretValueCommand {
  constructor(readonly input: unknown) {}
}
