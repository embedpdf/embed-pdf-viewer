/**
 * The shortest decimal that is the same float32 as `value`: how a number a
 * PDF stores as a float (PDFium's `CPDF_Number`) reads back as it was
 * written, `0.3` and not `0.30000001192092896`. Any number written through
 * a float reads back as itself this way.
 */
export function float32Decimal(value: number): number {
  const float = Math.fround(value);
  if (!Number.isFinite(float)) return float;
  for (let digits = 1; digits < 9; digits++) {
    const decimal = Number(float.toPrecision(digits));
    if (Math.fround(decimal) === float) return decimal;
  }
  return float;
}
