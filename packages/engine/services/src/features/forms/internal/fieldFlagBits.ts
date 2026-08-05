/**
 * /Ff bits writable through drafts and patches (1-based spec bit numbers).
 * Family-DEFINING bits (Radio 1<<15, Pushbutton 1<<16, Combo 1<<17) are set
 * once by EPDFForm_CreateField and immutable afterwards - the native
 * setter rejects them.
 */
export const FIELD_FLAG_BITS = {
  readOnly: 1 << 0,
  required: 1 << 1,
  noExport: 1 << 2,
  multiline: 1 << 12,
  password: 1 << 13,
  noToggleToOff: 1 << 14,
  edit: 1 << 18,
  multiSelect: 1 << 21,
  comb: 1 << 24,
  radiosInUnison: 1 << 25,
} as const;

export type FieldFlagName = keyof typeof FIELD_FLAG_BITS;

/**
 * Fold optional booleans into set/clear masks: `true` sets the bit,
 * `false` clears it, `undefined` leaves it alone.
 */
export function flagMasks(flags: Partial<Record<FieldFlagName, boolean | undefined>>): {
  setBits: number;
  clearBits: number;
} {
  let setBits = 0;
  let clearBits = 0;
  for (const [name, bit] of Object.entries(FIELD_FLAG_BITS)) {
    const value = flags[name as FieldFlagName];
    if (value === true) setBits |= bit;
    else if (value === false) clearBits |= bit;
  }
  return { setBits, clearBits };
}
