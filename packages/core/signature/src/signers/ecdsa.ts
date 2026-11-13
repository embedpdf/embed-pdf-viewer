import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';

import { CmsError } from '../cms/parse';
import { childrenOf, readElement } from '../cms/splice';

/** The size in bytes of each of an ECDSA signature's two numbers, by curve. */
const NUMBER_SIZE = { 'P-256': 32, 'P-384': 48, 'P-521': 66 } as const;

/**
 * An ECDSA signature as a `RawSigner` returns it, `r || s` with each number at the curve's
 * fixed size, from the DER most signing services return (`SEQUENCE { r, s }`). A raw key that
 * returns the DER as it is gets its signature encoded twice, and no reader can check it.
 * Throws `InvalidArg` for bytes that aren't such a signature, or numbers too large for the curve.
 */
export function ecdsaRawFromDer(der: Uint8Array, curve: 'P-256' | 'P-384' | 'P-521'): Uint8Array {
  const size = NUMBER_SIZE[curve];
  const invalid = (why: string) =>
    new EngineError(EngineErrorCode.InvalidArg, `not a DER ECDSA signature: ${why}`, {
      details: { field: 'der' },
    });
  let numbers;
  try {
    const sequence = readElement(der, 0, der.byteLength);
    if (sequence.tag !== 0x30) throw invalid('it is not a sequence');
    numbers = childrenOf(der, sequence);
  } catch (error) {
    throw error instanceof CmsError ? invalid('it does not parse') : error;
  }
  if (numbers.length !== 2 || numbers.some((number) => number.tag !== 0x02)) {
    throw invalid('it does not hold two integers');
  }
  const raw = new Uint8Array(size * 2);
  numbers.forEach((number, index) => {
    // A DER integer carries a leading zero when its first bit is set, and none it doesn't need.
    let start = number.contentStart;
    while (start < number.contentEnd - 1 && der[start] === 0) start++;
    const length = number.contentEnd - start;
    if (length > size) throw invalid(`a number is ${length} bytes, ${curve} takes ${size}`);
    raw.set(der.subarray(start, number.contentEnd), (index + 1) * size - length);
  });
  return raw;
}
