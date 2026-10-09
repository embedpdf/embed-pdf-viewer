// Writes a small PDF from page specs, for the fixture generators in this folder.
//
// Each spec has `content` (the page's content stream), optional `resources` (the
// inside of its resource dictionary) and optional `extra`: stream objects by fixed
// object number, as { dict, stream }. Streams are Flate-compressed. Pages are 200
// by 200 points.

import { deflateSync } from 'node:zlib';

export function buildPdf(pageSpecs) {
  const objects = new Map();
  const pageIds = [];
  let next = 3;
  const reserved = new Set(pageSpecs.flatMap((page) => Object.keys(page.extra ?? {}).map(Number)));
  const take = () => {
    while (reserved.has(next)) next++;
    return next++;
  };
  for (const page of pageSpecs) {
    const pageId = take();
    const contentId = take();
    pageIds.push(pageId);
    objects.set(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents ${contentId} 0 R /Resources << ${page.resources ?? ''} >> >>`,
    );
    objects.set(contentId, stream('', page.content));
    for (const [id, spec] of Object.entries(page.extra ?? {})) {
      objects.set(Number(id), stream(spec.dict, spec.stream));
    }
  }
  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(
    2,
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`,
  );

  const parts = [Buffer.from('%PDF-1.7\n')];
  let length = parts[0].length;
  const push = (part) => {
    const buffer = typeof part === 'string' ? Buffer.from(part, 'latin1') : part;
    parts.push(buffer);
    length += buffer.length;
  };
  const offsets = [];
  const ids = [...objects.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    for (const piece of [].concat(objects.get(id))) push(piece);
    push('\nendobj\n');
  }
  const size = ids[ids.length - 1] + 1;
  const xref = length;
  push(`xref\n0 ${size}\n0000000000 65535 f \n`);
  for (let id = 1; id < size; id++) {
    push(
      offsets[id] === undefined
        ? '0000000000 65535 f \n'
        : `${String(offsets[id]).padStart(10, '0')} 00000 n \n`,
    );
  }
  push(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(parts);
}

function stream(dict, content) {
  const data = deflateSync(Buffer.from(content, 'latin1'));
  return [
    `<< ${dict} /Filter /FlateDecode /Length ${data.length} >>\nstream\n`,
    data,
    '\nendstream',
  ];
}
