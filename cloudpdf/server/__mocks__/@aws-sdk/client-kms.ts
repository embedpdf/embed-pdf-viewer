/**
 * Stand-in for `@aws-sdk/client-kms`, served to every test file that calls
 * `vi.mock('@aws-sdk/client-kms')` without a factory (see "Faking an SDK
 * in tests" in `docs/conventions/server-adapters.md`). Tests set each
 * `send` result on {@link awsKms} and reset it.
 */
import { vi } from 'vitest';

export const awsKms = {
  send: vi.fn(),
  /** What each client was built with. */
  clientOptions: [] as unknown[],
};

export class KMSClient {
  constructor(opts: unknown) {
    awsKms.clientOptions.push(opts);
  }
  send(command: unknown): unknown {
    return awsKms.send(command);
  }
}

export class GenerateDataKeyCommand {
  constructor(readonly input: unknown) {}
}

export class DecryptCommand {
  constructor(readonly input: unknown) {}
}
