/**
 * Patches for unsupported subtypes are not allowed at the type level.
 * The engine refuses them at runtime with `EngineError(NotImplemented)`.
 */
export type UnsupportedPatch = never;
