/**
 * How a conformance suite opens its fixtures on a local engine: with every permission. A suite
 * checks the engine's mechanics, as the cloud's suites do with a full token, and a fixture's own
 * restrictions (a protected PDF's flags) would otherwise decide it. A suite about permissions
 * passes its own scope.
 */
export const EVERY_PERMISSION = { scope: ['*'] } as const;
