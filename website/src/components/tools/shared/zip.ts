/**
 * A zip file of several files, for "save them all" in one download. Files are stored as they are,
 * not compressed again: what PDFs carry (spreadsheets, images, other PDFs) is mostly compressed
 * already, and storing keeps this small enough to own. Names are written as UTF-8.
 */

export interface ZipEntry {
  readonly name: string;
  readonly bytes: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

/** The CRC-32 a zip file records for each file. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** `name`, or `name (2).ext`, `name (3).ext`… when `taken` has it already, ignoring case. */
export function uniqueName(name: string, taken: ReadonlySet<string>): string {
  const lower = new Set([...taken].map((each) => each.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf('.');
  const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let count = 2; ; count++) {
    const candidate = `${stem} (${count})${extension}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}

/** The time and date fields of a zip entry: MS-DOS format, local time. */
function dosDateTime(date: Date): { time: number; date: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date:
      ((Math.max(1980, date.getFullYear()) - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
  };
}

/** A zip file holding `entries`, each under a name of its own. */
export function zip(entries: readonly ZipEntry[], now = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(now);
  const taken = new Set<string>();
  const files = entries.map((entry) => {
    const name = uniqueName(entry.name, taken);
    taken.add(name);
    return { name: encoder.encode(name), bytes: entry.bytes, crc: crc32(entry.bytes) };
  });

  const localSize = files.reduce((sum, file) => sum + 30 + file.name.length + file.bytes.length, 0);
  const centralSize = files.reduce((sum, file) => sum + 46 + file.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let at = 0;
  const u16 = (value: number) => {
    view.setUint16(at, value, true);
    at += 2;
  };
  const u32 = (value: number) => {
    view.setUint32(at, value, true);
    at += 4;
  };
  const put = (bytes: Uint8Array) => {
    out.set(bytes, at);
    at += bytes.length;
  };

  const offsets: number[] = [];
  for (const file of files) {
    offsets.push(at);
    u32(0x04034b50); // local file header
    u16(20); // version needed: 2.0
    u16(0x0800); // the name is UTF-8
    u16(0); // stored
    u16(time);
    u16(date);
    u32(file.crc);
    u32(file.bytes.length);
    u32(file.bytes.length);
    u16(file.name.length);
    u16(0); // no extra field
    put(file.name);
    put(file.bytes);
  }

  const centralStart = at;
  files.forEach((file, index) => {
    u32(0x02014b50); // central directory header
    u16(20); // made by: 2.0
    u16(20);
    u16(0x0800);
    u16(0);
    u16(time);
    u16(date);
    u32(file.crc);
    u32(file.bytes.length);
    u32(file.bytes.length);
    u16(file.name.length);
    u16(0); // extra field
    u16(0); // comment
    u16(0); // disk
    u16(0); // internal attributes
    u32(0); // external attributes
    u32(offsets[index]!);
    put(file.name);
  });

  u32(0x06054b50); // end of central directory
  u16(0);
  u16(0);
  u16(files.length);
  u16(files.length);
  u32(centralSize);
  u32(centralStart);
  u16(0); // comment
  return out;
}
