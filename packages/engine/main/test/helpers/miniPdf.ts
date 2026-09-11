/**
 * A tiny PDF writer for adversarial analysis fixtures: classic cross-reference
 * tables, one object per entry, latin1 throughout. `pdf()` writes a first
 * revision, `append()` adds an incremental update whose trailer chains to the
 * previous one. Object bodies are written verbatim, so a test can place any
 * key it likes anywhere.
 */

export type Objects = Record<number, string>;

export function bytesOf(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, 'latin1'));
}

export function latin1(bytes: Uint8Array | ArrayBuffer): string {
  return Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString('latin1');
}

export function pdf(objects: Objects, trailerExtra = ''): Uint8Array {
  let text = '%PDF-1.7\n';
  const offsets: Record<number, number> = {};
  const size = Math.max(...Object.keys(objects).map(Number)) + 1;
  for (const [n, value] of Object.entries(objects)) {
    offsets[Number(n)] = text.length;
    text += `${n} 0 obj\n${value}\nendobj\n`;
  }
  const xref = text.length;
  text += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let n = 1; n < size; n++) {
    text += offsets[n] !== undefined ? `${String(offsets[n]).padStart(10, '0')} 00000 n \n` : '0000000000 00000 f \n';
  }
  text += `trailer\n<< /Root 1 0 R /Size ${size}${trailerExtra ? ' ' + trailerExtra : ''} >>\nstartxref\n${xref}\n%%EOF\n`;
  return bytesOf(text);
}

export function append(base: Uint8Array, objects: Objects, trailerExtra = ''): Uint8Array {
  let text = latin1(base);
  const prev = Number([...text.matchAll(/startxref\s+(\d+)/g)].at(-1)![1]);
  const oldSize = Number([...text.matchAll(/\/Size\s+(\d+)/g)].at(-1)![1]);
  const entries: Record<number, number> = {};
  for (const [n, value] of Object.entries(objects)) {
    entries[Number(n)] = text.length;
    text += `${n} 0 obj\n${value}\nendobj\n`;
  }
  const xref = text.length;
  text += 'xref\n';
  for (const [n, offset] of Object.entries(entries)) {
    text += `${n} 1\n${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  const size = Math.max(oldSize, ...Object.keys(objects).map((n) => Number(n) + 1));
  text += `trailer\n<< /Root 1 0 R /Size ${size} /Prev ${prev}${trailerExtra ? ' ' + trailerExtra : ''} >>\nstartxref\n${xref}\n%%EOF\n`;
  return bytesOf(text);
}

/** The last `n 0 obj ... endobj` body in `bytes`. */
export function lastObjectBody(bytes: Uint8Array | ArrayBuffer, objectNumber: number): string {
  const text = latin1(bytes);
  const matches = [...text.matchAll(new RegExp(`(?:^|[\\r\\n])${objectNumber} 0 obj\\s*([\\s\\S]*?)endobj`, 'g'))];
  if (matches.length === 0) throw new Error(`object ${objectNumber} not found`);
  return matches.at(-1)![1];
}

/**
 * Append an update that adds signature field `fieldNum` (merged widget on
 * page 3, appended to /Annots and /AcroForm /Fields) and signs it with a
 * placeholder CMS whose /ByteRange covers the whole revision. `extraField`
 * is spliced into the field dictionary; `extraObjects` are written first.
 */
export function appendSignedField(
  signed: Uint8Array,
  opts: {
    fieldNum: number;
    valueNum: number;
    name: string;
    pageAnnots: number[];
    acroFields: number[];
    extraField?: string;
    extraObjects?: Objects;
  },
): Uint8Array {
  const { fieldNum, valueNum, name, pageAnnots, acroFields } = opts;
  const refs = (nums: number[]) => nums.map((n) => `${n} 0 R`).join(' ');
  return appendWholeRevisionSignature(signed, valueNum, {
    ...(opts.extraObjects ?? {}),
    3: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Annots [${refs(pageAnnots)}] /Resources <<>> >>`,
    10: `<< /Fields [${refs(acroFields)}] /SigFlags 3 >>`,
    [fieldNum]: `<< /Type /Annot /Subtype /Widget /FT /Sig /T (${name}) /Rect [110 10 200 40] /P 3 0 R /V ${valueNum} 0 R${opts.extraField ? ' ' + opts.extraField : ''} >>`,
  });
}

/**
 * Sign an EXISTING signature field in one appended revision: the field
 * dictionary is rewritten as `fieldDict` plus `/V`, the value carries a
 * placeholder CMS with a whole-revision /ByteRange.
 */
export function appendSignedExistingField(
  signed: Uint8Array,
  opts: { fieldNum: number; valueNum: number; fieldDict: string; extraObjects?: Objects },
): Uint8Array {
  const body = opts.fieldDict.trim().replace(/>>\s*$/, '');
  return appendWholeRevisionSignature(signed, opts.valueNum, {
    ...(opts.extraObjects ?? {}),
    [opts.fieldNum]: `${body} /V ${opts.valueNum} 0 R >>`,
  });
}

function appendWholeRevisionSignature(signed: Uint8Array, valueNum: number, objects: Objects): Uint8Array {
  let text = latin1(
    append(signed, {
      ...objects,
      [valueNum]:
        '<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /ETSI.CAdES.detached /ByteRange [0 0000000000 0000000000 0000000000] /Contents <3003020101' +
        '0'.repeat(100) +
        '> >>',
    }),
  );
  const contents = text.lastIndexOf('/Contents <') + '/Contents '.length;
  const end = text.indexOf('>', contents) + 1;
  text = text.replace(
    '/ByteRange [0 0000000000 0000000000 0000000000]',
    `/ByteRange [0 ${String(contents).padStart(10, '0')} ${String(end).padStart(10, '0')} ${String(text.length - end).padStart(10, '0')}]`,
  );
  return bytesOf(text);
}
