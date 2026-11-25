import { pdfOfParts, type PdfStreamObject } from './pdfOf';

/**
 * A font dictionary as one editor writes it: a TrueType font embedding the
 * fixture's program under `baseFont`, or a Type 3 font with no PostScript
 * name. `family` and `weight` are the descriptor's `/FontFamily` and
 * `/FontWeight`; left out, the engine reads them from the name, as it does
 * for an editor that doesn't write them.
 */
export interface FontDictionarySpec {
  baseFont?: string;
  family?: string;
  weight?: number;
  italic?: boolean;
}

/**
 * One page whose resources hold a font dictionary per spec, each TrueType one
 * with its own copy of `program`: the fonts different editors leave in one
 * document.
 */
export function pdfWithFontDictionaries(
  program: Uint8Array,
  fonts: readonly FontDictionarySpec[],
): Uint8Array {
  const objects: (string | PdfStreamObject)[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  ];
  const add = (object: string | PdfStreamObject) => objects.push(object);
  const fontRefs: number[] = [];
  // The page and its content come next; the fonts after them.
  const resources = () => fontRefs.map((ref, index) => `/F${index + 1} ${ref} 0 R`).join(' ');
  const content = fonts
    .map((_, index) => `BT /F${index + 1} 12 Tf 72 ${720 - index * 20} Td <20> Tj ET`)
    .join('\n');
  objects.push('', { dictionary: '', data: new TextEncoder().encode(content) });
  for (const font of fonts) {
    const extra =
      (font.family !== undefined ? ` /FontFamily (${font.family})` : '') +
      (font.weight !== undefined ? ` /FontWeight ${font.weight}` : '') +
      ` /ItalicAngle ${font.italic ? -12 : 0}`;
    if (font.baseFont === undefined) {
      add({
        dictionary: '',
        data: new TextEncoder().encode('500 0 0 0 500 500 d1 0 0 500 500 re f'),
      });
      const glyph = objects.length;
      add(`<< /Type /FontDescriptor /FontName /Drawn /Flags 32 /FontBBox [0 0 500 500]${extra} >>`);
      const descriptor = objects.length;
      add(
        `<< /Type /Font /Subtype /Type3 /FontBBox [0 0 500 500] /FontMatrix [0.001 0 0 0.001 0 0] ` +
          `/CharProcs << /g ${glyph} 0 R >> /Encoding << /Type /Encoding /Differences [32 /g] >> ` +
          `/FirstChar 32 /LastChar 32 /Widths [500] /Resources << >> /FontDescriptor ${descriptor} 0 R >>`,
      );
    } else {
      add({ dictionary: `/Length1 ${program.length}`, data: program });
      const file = objects.length;
      add(
        `<< /Type /FontDescriptor /FontName /${font.baseFont} /Flags 32 /FontBBox [0 -300 1000 900] ` +
          `/Ascent 900 /Descent -300 /CapHeight 700 /StemV 80${extra} /FontFile2 ${file} 0 R >>`,
      );
      const descriptor = objects.length;
      add(
        `<< /Type /Font /Subtype /TrueType /BaseFont /${font.baseFont} /FirstChar 32 /LastChar 32 ` +
          `/Widths [250] /Encoding /WinAnsiEncoding /FontDescriptor ${descriptor} 0 R >>`,
      );
    }
    fontRefs.push(objects.length);
  }
  objects[2] =
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
    `/Resources << /Font << ${resources()} >> >> /Contents 4 0 R >>`;
  return pdfOfParts(objects);
}

/**
 * One page that writes `text` at 48 points from (20, 30), each character 600
 * thousandths wide, in a font the document names but does not embed: a simple
 * TrueType font, or a composite (Type 0) one.
 */
export function pdfNamingFont(kind: 'simple' | 'composite', text: string): Uint8Array {
  const characters = [...text];
  const hex = (value: number, digits: number) =>
    value.toString(16).toUpperCase().padStart(digits, '0');
  const unicode = characters.map((character) => hex(character.codePointAt(0)!, 4));
  const code = (index: number) => (kind === 'simple' ? hex(65 + index, 2) : hex(1 + index, 4));
  const stream = (content: string): PdfStreamObject => ({
    dictionary: '',
    data: new TextEncoder().encode(content),
  });
  const objects: (string | PdfStreamObject)[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] ' +
      '/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    stream(`BT /F1 48 Tf 20 30 Td <${characters.map((_, index) => code(index)).join('')}> Tj ET`),
  ];
  const descriptor =
    '<< /Type /FontDescriptor /FontName /David /Flags 32 /FontBBox [0 -300 1000 900] ' +
    '/ItalicAngle 0 /Ascent 900 /Descent -300 /CapHeight 700 /StemV 80 >>';
  if (kind === 'simple') {
    objects.push(
      '<< /Type /Font /Subtype /TrueType /BaseFont /David /FirstChar 65 ' +
        `/LastChar ${64 + characters.length} /Widths [${characters.map(() => 600).join(' ')}] ` +
        '/FontDescriptor 6 0 R /Encoding << /Type /Encoding ' +
        `/Differences [65 ${unicode.map((value) => `/uni${value}`).join(' ')}] >> >>`,
      descriptor,
    );
  } else {
    objects.push(
      '<< /Type /Font /Subtype /Type0 /BaseFont /David /Encoding /Identity-H ' +
        '/DescendantFonts [6 0 R] /ToUnicode 8 0 R >>',
      '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /David /DW 600 /CIDToGIDMap /Identity ' +
        '/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> ' +
        '/FontDescriptor 7 0 R >>',
      descriptor,
      stream(
        '/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CMapName /ToUnicode def ' +
          '/CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange\n' +
          `${characters.length} beginbfchar\n` +
          unicode.map((value, index) => `<${code(index)}> <${value}>\n`).join('') +
          'endbfchar endcmap end end',
      ),
    );
  }
  return pdfOfParts(objects);
}
