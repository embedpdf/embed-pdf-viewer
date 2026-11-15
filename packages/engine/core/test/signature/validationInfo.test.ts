import { describe, expect, test } from 'vitest';
import { VALIDATION_INFO_LIMITS, validationInfoEntryProblem } from '../../src/shared';

/** A DER element: its identifier, the shortest length that says `contents.length`, the contents. */
function element(identifier: number, ...contents: (number[] | Uint8Array)[]): Uint8Array {
  const body = contents.flatMap((part) => [...part]);
  const length =
    body.length < 0x80
      ? [body.length]
      : body.length < 0x100
        ? [0x81, body.length]
        : body.length < 0x10000
          ? [0x82, body.length >> 8, body.length & 0xff]
          : [0x83, body.length >> 16, (body.length >> 8) & 0xff, body.length & 0xff];
  return Uint8Array.from([identifier, ...length, ...body]);
}

const SEQUENCE = 0x30;
const INTEGER = 0x02;
const OCTET_STRING = 0x04;

describe("an entry of a document's validation data", () => {
  test('one SEQUENCE that spans the bytes is accepted, whatever it holds', () => {
    const inner = element(SEQUENCE, element(INTEGER, [1]), element(OCTET_STRING, [0, 0xff, 0x30]));
    expect(validationInfoEntryProblem(element(SEQUENCE, inner, element(INTEGER, [5])))).toBeNull();
    expect(validationInfoEntryProblem(element(SEQUENCE))).toBeNull();
    // A long form of the length, and contents past 64 KiB.
    expect(
      validationInfoEntryProblem(element(SEQUENCE, element(OCTET_STRING, new Uint8Array(70_000)))),
    ).toBeNull();
    // A context tag with a number past 30, and an explicit tag around an element.
    expect(
      validationInfoEntryProblem(
        element(
          SEQUENCE,
          [0xbf, 0x21, 0x03],
          element(INTEGER, [7]),
          element(0xa0, element(INTEGER, [1])),
        ),
      ),
    ).toBeNull();
  });

  test('what is not one DER SEQUENCE is refused, with the reason', () => {
    expect(validationInfoEntryProblem(new Uint8Array())).toMatch(/empty/);
    // A PEM file, which is text: the usual mistake.
    const pem = new TextEncoder().encode('-----BEGIN CERTIFICATE-----\nMIIB\n');
    expect(validationInfoEntryProblem(pem)).toMatch(/not a DER SEQUENCE/);
    expect(validationInfoEntryProblem(element(INTEGER, [1]))).toMatch(/not a DER SEQUENCE/);
  });

  test('a cut, padded or doubled object is refused', () => {
    const whole = element(SEQUENCE, element(INTEGER, [1]), element(INTEGER, [2]));
    expect(validationInfoEntryProblem(whole.slice(0, whole.length - 1))).toMatch(/more bytes/);
    expect(validationInfoEntryProblem(Uint8Array.from([...whole, 0]))).toMatch(/bytes follow/);
    expect(validationInfoEntryProblem(Uint8Array.from([...whole, ...whole]))).toMatch(
      /bytes follow/,
    );
    // Only the identifier.
    expect(validationInfoEntryProblem(Uint8Array.from([SEQUENCE]))).toMatch(/DER length/);
  });

  test('an indefinite length is refused: DER has none', () => {
    expect(
      validationInfoEntryProblem(Uint8Array.from([SEQUENCE, 0x80, 0x02, 0x01, 0x01, 0, 0])),
    ).toMatch(/DER length/);
    // Inside the object too.
    expect(
      validationInfoEntryProblem(element(SEQUENCE, [SEQUENCE, 0x80, 0x02, 0x01, 0x01, 0, 0])),
    ).toMatch(/inside it/);
  });

  test('an element that does not fill its parent is refused', () => {
    // The inner integer says three bytes and the sequence around it holds two.
    expect(validationInfoEntryProblem(element(SEQUENCE, [INTEGER, 0x03, 0x01, 0x02]))).toMatch(
      /inside it/,
    );
    // Bytes left over after the last element of an inner sequence.
    expect(
      validationInfoEntryProblem(
        element(SEQUENCE, element(SEQUENCE, element(INTEGER, [1]), [0x02])),
      ),
    ).toMatch(/inside it/);
    // The contents of a primitive element are not looked at.
    expect(
      validationInfoEntryProblem(element(SEQUENCE, element(OCTET_STRING, [INTEGER, 0x09]))),
    ).toBeNull();
  });

  test('an entry past the size limit is refused before it is read', () => {
    const large = new Uint8Array(VALIDATION_INFO_LIMITS.entryBytes + 1);
    large[0] = SEQUENCE;
    expect(validationInfoEntryProblem(large)).toMatch(/larger than/);
  });

  test('nesting past any real object is refused, and does not overflow the stack', () => {
    let nested = element(SEQUENCE);
    for (let depth = 0; depth < 200; depth++) nested = element(SEQUENCE, nested);
    expect(validationInfoEntryProblem(nested)).toMatch(/inside it/);
  });
});
