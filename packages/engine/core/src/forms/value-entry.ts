/** Lossless shape of a field's effective PDF `/V` or `/DV` object. */
export type FormValueEntry =
  | { kind: 'none' }
  | { kind: 'scalar'; value: string }
  | { kind: 'array'; values: string[] }
  | { kind: 'unsupported' };
