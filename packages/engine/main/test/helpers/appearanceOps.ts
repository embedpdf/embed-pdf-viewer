/**
 * An appearance stream read back as what it paints: each fill, stroke and
 * text run with its colour, line width, dash and clip, in the stream's own
 * space. The widget painter's drawing flattens to the same items, so the two
 * can be compared one by one (`widget-painter-parity.test.ts`).
 */
import { inflateSync } from 'node:zlib';

export type Segment =
  | { op: 'rect'; x: number; y: number; width: number; height: number }
  | { op: 'move'; x: number; y: number }
  | { op: 'line'; x: number; y: number }
  | { op: 'curve'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: 'close' };

export interface Clip {
  left: number;
  bottom: number;
  right: number;
  top: number;
}

export type Painted =
  | { kind: 'fill'; path: Segment[]; color: number[]; evenOdd: boolean; clip: Clip | null }
  | {
      kind: 'stroke';
      path: Segment[];
      color: number[];
      width: number;
      dash: number[] | null;
      clip: Clip | null;
    }
  | {
      kind: 'text';
      size: number;
      color: number[];
      x: number;
      y: number;
      text: string;
      clip: Clip | null;
    };

/** The appearance streams of an exported appearance document: each one's dictionary and decoded content. */
export function formStreamsOf(bytes: Uint8Array): { dict: string; content: string }[] {
  const text = Buffer.from(bytes).toString('latin1');
  const found: { dict: string; content: string }[] = [];
  const pattern = /<<((?:(?!>>\s*stream)[\s\S])*?)>>\s*stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const dict = match[1]!;
    if (!/\/Subtype\s*\/Form/.test(dict)) continue;
    const start = match.index + match[0].length;
    const end = text.indexOf('endstream', start);
    const raw = Buffer.from(text.slice(start, end), 'latin1');
    const data = /FlateDecode/.test(dict) ? inflateSync(raw) : raw;
    found.push({ dict, content: data.toString('latin1') });
  }
  return found;
}

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'name'; value: string }
  | { kind: 'string'; value: string }
  | { kind: 'array'; value: Token[] }
  | { kind: 'op'; value: string };

function tokenize(content: string): Token[] {
  const tokens: Token[] = [];
  const stack: Token[][] = [tokens];
  let index = 0;
  const push = (token: Token) => stack[stack.length - 1]!.push(token);
  while (index < content.length) {
    const char = content[index]!;
    if (/\s/.test(char)) {
      index += 1;
    } else if (char === '%') {
      while (index < content.length && content[index] !== '\n') index += 1;
    } else if (char === '[') {
      const array: Token[] = [];
      push({ kind: 'array', value: array });
      stack.push(array);
      index += 1;
    } else if (char === ']') {
      stack.pop();
      index += 1;
    } else if (char === '/') {
      let end = index + 1;
      while (end < content.length && !/[\s/[\]()<>]/.test(content[end]!)) end += 1;
      push({ kind: 'name', value: content.slice(index + 1, end) });
      index = end;
    } else if (char === '(') {
      let depth = 1;
      let value = '';
      index += 1;
      while (depth > 0) {
        const next = content[index]!;
        if (next === '\\') {
          const escaped = content[index + 1]!;
          const map: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
          if (/[0-7]/.test(escaped)) {
            const octal = content.slice(index + 1).match(/^[0-7]{1,3}/)![0];
            value += String.fromCharCode(parseInt(octal, 8));
            index += 1 + octal.length;
          } else {
            value += map[escaped] ?? escaped;
            index += 2;
          }
          continue;
        }
        if (next === '(') depth += 1;
        if (next === ')') depth -= 1;
        if (depth > 0) value += next;
        index += 1;
      }
      push({ kind: 'string', value });
    } else if (/[-+.\d]/.test(char)) {
      const number = content.slice(index).match(/^[-+]?(\d+\.?\d*|\.\d+)/)![0];
      push({ kind: 'number', value: Number(number) });
      index += number.length;
    } else {
      let end = index;
      while (end < content.length && /[A-Za-z*'"]/.test(content[end]!)) end += 1;
      push({ kind: 'op', value: content.slice(index, end) });
      index = Math.max(end, index + 1);
    }
  }
  return tokens;
}

/** WinAnsi's codes 0x80 to 0x9F: the standard fonts' encoding (Node's decoder reads them as C1 controls). */
const WIN_ANSI_HIGH: Record<number, number> = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178,
};
const winAnsi = (bytes: string) =>
  [...bytes]
    .map((char) => String.fromCharCode(WIN_ANSI_HIGH[char.charCodeAt(0)] ?? char.charCodeAt(0)))
    .join('');

/** What the stream paints, in its own space. */
export function paintedOf(content: string): Painted[] {
  interface State {
    fill: number[];
    stroke: number[];
    width: number;
    dash: number[] | null;
    clip: Clip | null;
  }
  let state: State = { fill: [0, 0, 0], stroke: [0, 0, 0], width: 1, dash: null, clip: null };
  const saved: State[] = [];
  const painted: Painted[] = [];
  let path: Segment[] = [];
  let pendingClip = false;
  let operands: Token[] = [];
  let size = 0;
  let line = { x: 0, y: 0 };
  const numbers = () => operands.map((token) => (token.kind === 'number' ? token.value : NaN));
  const gray = (value: number) => [value, value, value];
  const cmyk = ([c, m, y, k]: number[]) => [
    (1 - c!) * (1 - k!),
    (1 - m!) * (1 - k!),
    (1 - y!) * (1 - k!),
  ];
  const endPath = () => {
    if (pendingClip) {
      const rect = path.find((segment) => segment.op === 'rect');
      if (rect && rect.op === 'rect') {
        state.clip = {
          left: rect.x,
          bottom: rect.y,
          right: rect.x + rect.width,
          top: rect.y + rect.height,
        };
      }
    }
    pendingClip = false;
    path = [];
  };
  for (const token of tokenize(content)) {
    if (token.kind !== 'op') {
      operands.push(token);
      continue;
    }
    const args = numbers();
    switch (token.value) {
      case 'q':
        saved.push({ ...state });
        break;
      case 'Q':
        state = saved.pop() ?? state;
        break;
      case 'rg':
        state.fill = args;
        break;
      case 'RG':
        state.stroke = args;
        break;
      case 'g':
        state.fill = gray(args[0]!);
        break;
      case 'G':
        state.stroke = gray(args[0]!);
        break;
      case 'k':
        state.fill = cmyk(args);
        break;
      case 'K':
        state.stroke = cmyk(args);
        break;
      case 'w':
        state.width = args[0]!;
        break;
      case 'd': {
        const array = operands[0];
        const values =
          array?.kind === 'array'
            ? array.value.map((entry) => (entry.kind === 'number' ? entry.value : NaN))
            : [];
        state.dash = values.length ? values : null;
        break;
      }
      case 're':
        path.push({ op: 'rect', x: args[0]!, y: args[1]!, width: args[2]!, height: args[3]! });
        break;
      case 'm':
        path.push({ op: 'move', x: args[0]!, y: args[1]! });
        break;
      case 'l':
        path.push({ op: 'line', x: args[0]!, y: args[1]! });
        break;
      case 'c':
        path.push({
          op: 'curve',
          x1: args[0]!,
          y1: args[1]!,
          x2: args[2]!,
          y2: args[3]!,
          x: args[4]!,
          y: args[5]!,
        });
        break;
      case 'h':
        path.push({ op: 'close' });
        break;
      case 'W':
      case 'W*':
        pendingClip = true;
        break;
      case 'f':
      case 'F':
      case 'f*':
        painted.push({
          kind: 'fill',
          path,
          color: state.fill,
          evenOdd: token.value === 'f*',
          clip: state.clip,
        });
        endPath();
        break;
      case 'S':
      case 's':
        painted.push({
          kind: 'stroke',
          path:
            token.value === 's' && path.at(-1)?.op !== 'rect' ? [...path, { op: 'close' }] : path,
          color: state.stroke,
          width: state.width,
          dash: state.dash,
          clip: state.clip,
        });
        endPath();
        break;
      case 'n':
        endPath();
        break;
      case 'BT':
        line = { x: 0, y: 0 };
        break;
      case 'Tf':
        size = args[1]!;
        break;
      case 'Td':
        line = { x: line.x + args[0]!, y: line.y + args[1]! };
        break;
      case 'Tj': {
        const string = operands[0];
        if (string?.kind === 'string') {
          painted.push({
            kind: 'text',
            size,
            color: state.fill,
            x: line.x,
            y: line.y,
            text: winAnsi(string.value),
            clip: state.clip,
          });
        }
        break;
      }
      default:
        break;
    }
    operands = [];
  }
  return painted;
}
