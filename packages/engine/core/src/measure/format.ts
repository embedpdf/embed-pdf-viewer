import type { PdfNumberFormat } from '../dto/Measure';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';

const group = (value: string, separator: string): string =>
  value.replace(/\B(?=(\d{3})+(?!\d))/g, () => separator);
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

export function validNumberFormat(nf: PdfNumberFormat): boolean {
  const c = Math.fround(nf.conversion ?? NaN);
  if (!Number.isFinite(c) || c <= 0) return false;
  const d = nf.precision ?? (nf.fraction === 'fraction' ? 16 : 100);
  if (!Number.isInteger(d) || d < 1 || d > 2147483647) return false;
  if ((nf.fraction ?? 'decimal') === 'decimal' && !Number.isInteger(Math.log10(d))) return false;
  return true;
}

function last(value: number, nf: PdfNumberFormat): string {
  const mode = nf.fraction ?? 'decimal';
  const sep = nf.thousands ?? ',';
  if (mode === 'round') return group(String(Math.round(value)), sep);
  if (mode === 'truncate') return group(String(Math.trunc(value)), sep);
  if (mode === 'fraction') {
    const denominator = nf.precision ?? 16;
    let whole = Math.floor(value);
    let numerator = Math.round((value - whole) * denominator);
    if (numerator === denominator) {
      whole++;
      numerator = 0;
    }
    if (!numerator) return group(String(whole), sep);
    const divisor = nf.fixed ? 1 : gcd(numerator, denominator);
    return `${whole ? `${group(String(whole), sep)} ` : ''}${numerator / divisor}/${denominator / divisor}`;
  }
  // Every digit /RD asks for, /FD or not, as Acrobat shows it ("1.50 m"):
  // ISO 32000-2 would let a reader drop the trailing zeros without /FD.
  const digits = Math.log10(nf.precision ?? 100);
  const [integer, decimal = ''] = value.toFixed(digits).split('.');
  return group(integer, sep) + (decimal ? (nf.decimal || '.') + decimal : '');
}

/** ISO 32000-2 §12.9.2 cascade. PDF float conversions are normalized before use.
 * Unit text and explicit spacing are preserved, including trailing unit spaces. */
export function formatMeasurement(value: number, formats: readonly PdfNumberFormat[]): string {
  if (!Number.isFinite(value) || !formats.length || !formats.every(validNumberFormat)) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'Measurement requires a finite value and valid number formats',
    );
  }
  let remainder = Math.abs(value);
  const parts: string[] = [];
  for (const [index, nf] of formats.entries()) {
    remainder *= Math.fround(nf.conversion!);
    if (!Number.isFinite(remainder))
      throw new EngineError(EngineErrorCode.InvalidArg, 'Measurement overflow');
    const whole = Math.floor(remainder);
    const fraction = remainder - whole;
    const final = index === formats.length - 1;
    const terminal = final || fraction === 0;
    // A cascade that stops early on a whole unit shows it whole ("2 ft").
    const number = final ? last(remainder, nf) : group(String(whole), nf.thousands ?? ',');
    // Omit only the implicit outer padding, never trim the unit or explicit separators.
    const prefix = nf.labelPosition === 'prefix';
    const ps = nf.prefixSpacing ?? (prefix && index === 0 ? '' : ' ');
    const ss = nf.suffixSpacing ?? (!prefix && terminal ? '' : ' ');
    const label = ps + nf.unit + ss;
    parts.push(prefix ? label + number : number + label);
    if (terminal) break;
    remainder = fraction;
  }
  return (value < 0 ? '-' : '') + parts.join('');
}
