/**
 * Stand-in for `@azure/identity`, served to every test file that calls
 * `vi.mock('@azure/identity')` without a factory (see "Faking an SDK in
 * tests" in `docs/conventions/server-adapters.md`).
 */
export const identity = {
  /** How many credentials adapters built. */
  credentials: 0,
};

export class DefaultAzureCredential {
  constructor() {
    identity.credentials++;
  }
}
