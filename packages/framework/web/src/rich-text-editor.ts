/**
 * Rich text editor binding — the ONE contentEditable mechanics module for a
 * FreeText annotation, shared by every framework adapter (React, Angular,
 * Vue, Svelte…) so editing can never drift between them:
 *
 *   • render a rich document (runs of style deltas over a body) into the
 *     element as paragraphs of inline-styled spans
 *   • serialise the element back into runs on `input` — inline styles only,
 *     never computed styles, so the editor cannot invent properties
 *   • map the DOM selection to flat offsets over the plain projection (and
 *     back), and keep the caret through a model-driven re-render
 *   • hold re-renders during IME composition, paste as plain text, forward
 *     Cmd/Ctrl+B/I/U as commands
 *
 * The browser owns typing; this module only translates. The POLICY — what a
 * command does to the document, when to commit, what a family maps to —
 * belongs to the host (the annotation plugin), reached through the
 * structural {@link RichTextEditorHost}: @embedpdf/web imports no plugin,
 * per the layering law. The return shape is a Svelte action; the other
 * frameworks call the same two functions from their effects.
 *
 * Offsets: positions in the plain projection — paragraphs joined by `\r`,
 * runs concatenated, a hard break inside a run is a `\r` too. The same
 * arithmetic the core's run algebra uses.
 *
 * Known limits (by design, recorded in the plan): the browser's native undo
 * stack does not span a host-driven restyle; DOM line wrapping approximates
 * the engine's layout, the appearance stream is the truth.
 */

import { observeWebFonts } from './web-font';
import {
  firstLineShiftFor,
  lineModelFor,
  webFontMetrics,
  type WebFontMetrics,
} from './web-font-metrics';

export type RichTextEditorDecoration = 'underline' | 'line-through' | 'word';
export type RichTextEditorScript = 'normal' | 'sub' | 'super';
export type RichTextEditorAlign = 'left' | 'center' | 'right' | 'justify';

/** A run's style delta — the engine's `RichTextRunStyle`, structurally. */
export interface RichTextEditorStyle {
  family?: string;
  weight?: number;
  italic?: boolean;
  size?: number;
  color?: string;
  decoration?: RichTextEditorDecoration[];
  script?: RichTextEditorScript;
  letterSpacing?: number;
  horizontalScale?: number;
  unknown?: string;
}

export interface RichTextEditorRun {
  text: string;
  style?: RichTextEditorStyle;
}

export interface RichTextEditorParagraph {
  align?: RichTextEditorAlign;
  dir?: 'ltr' | 'rtl';
  runs: RichTextEditorRun[];
}

/** The document the editor renders and produces (the engine's input shape). */
export interface RichTextEditorDocument {
  paragraphs: RichTextEditorParagraph[];
}

export interface RichTextEditorRange {
  start: number;
  end: number;
}

export type RichTextEditorCommand = 'bold' | 'italic' | 'underline';

/** What the binding needs from the plugin — structural, no plugin import. */
export interface RichTextEditorHost {
  /** The element's content changed by typing: here is the serialised document. */
  onInput(doc: RichTextEditorDocument): void;
  /** The selection inside the editor moved (null: the editor has none). */
  onSelectionChange(range: RichTextEditorRange | null): void;
  /** A keyboard command the host applies to the current selection. */
  onCommand(command: RichTextEditorCommand): void;
  /** The CSS family list for a PDF family ("Helvetica" → a web stack, a
   *  registered family → itself, mounted as a @font-face). */
  cssFontFamily(family: string): string;
}

export interface RichTextEditorProps {
  document: RichTextEditorDocument;
  /** Screen px per content unit (the page scale): sizes are content points. */
  scale: number;
}

export interface RichTextEditorBinding {
  update(props: RichTextEditorProps): void;
  /** The current selection as flat offsets, or null when not in the editor. */
  selection(): RichTextEditorRange | null;
  /** Place the selection (after the host restyled the document). */
  select(range: RichTextEditorRange): void;
  detach(): void;
}

// ---- Minimal DOM shapes (so the pure parts test with fake nodes) ---------------

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

export interface EditorStyle {
  marginTop?: string;
  lineHeight?: string;
  fontWeight: string;
  fontStyle: string;
  textDecoration: string;
  textDecorationLine?: string;
  color: string;
  fontSize: string;
  fontFamily: string;
  verticalAlign: string;
  letterSpacing: string;
  textAlign: string;
  direction: string;
}

export interface EditorNode {
  nodeType: number;
  nodeName: string;
  nodeValue?: string | null;
  childNodes: ArrayLike<EditorNode>;
  parentNode?: EditorNode | null;
  style?: EditorStyle;
}

export interface EditorElement extends EditorNode {
  style: EditorStyle;
  appendChild(node: EditorNode): unknown;
}

export interface EditorDocumentFactory {
  createElement(tag: string): EditorElement;
  createTextNode(text: string): EditorNode;
}

export interface EditorRoot extends EditorNode {
  ownerDocument: EditorDocumentFactory | null;
  appendChild(node: EditorNode): unknown;
  replaceChildren?(...nodes: EditorNode[]): void;
  removeChild?(node: EditorNode): unknown;
  firstChild?: EditorNode | null;
}

function isBlock(node: EditorNode): boolean {
  if (node.nodeType !== ELEMENT_NODE) return false;
  const name = node.nodeName.toUpperCase();
  return name === 'DIV' || name === 'P';
}

function isBreak(node: EditorNode): boolean {
  return node.nodeType === ELEMENT_NODE && node.nodeName.toUpperCase() === 'BR';
}

function lastChild(node: EditorNode): EditorNode | undefined {
  return node.childNodes[node.childNodes.length - 1];
}

/**
 * A `<br>` that nothing follows inside its block (or the root) is the
 * browser's caret placeholder, not content — even wrapped in a span, as
 * Chrome does for a new styled line. Every other break is a hard line break.
 */
function isTrailingBreak(node: EditorNode, root: EditorNode): boolean {
  for (let n: EditorNode = node; ; ) {
    const parent = n.parentNode;
    if (!parent) return false;
    if (lastChild(parent) !== n) return false;
    if (parent === root || isBlock(parent)) return true;
    n = parent;
  }
}

function contains(root: EditorNode, node: EditorNode | null | undefined): boolean {
  for (let n = node; n; n = n.parentNode) if (n === root) return true;
  return false;
}

// ---- Style ↔ CSS ---------------------------------------------------------------

const HEX = /^#([0-9a-f]{6})$/i;
const RGB = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i;

function cssColorToHex(css: string): string | undefined {
  const trimmed = css.trim();
  if (HEX.test(trimmed)) return trimmed.toUpperCase();
  const m = RGB.exec(trimmed);
  if (!m) return undefined;
  const hex = (n: string) =>
    Math.max(0, Math.min(255, Number(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${hex(m[1]!)}${hex(m[2]!)}${hex(m[3]!)}`.toUpperCase();
}

function firstFamily(css: string): string | undefined {
  const first = css
    .split(',')[0]
    ?.trim()
    .replace(/^["']|["']$/g, '');
  return first ? first : undefined;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The inline style declarations a span carries, as a style delta. Only what
 *  the span itself sets: an unset property means "inherit", never a value. */
export function styleDeltaOf(style: EditorStyle | undefined, scale: number): RichTextEditorStyle {
  const delta: RichTextEditorStyle = {};
  if (!style) return delta;
  const weight = style.fontWeight;
  if (weight) {
    const parsed = weight === 'bold' ? 700 : weight === 'normal' ? 400 : Number(weight);
    if (Number.isFinite(parsed) && parsed > 0) delta.weight = parsed;
  }
  if (style.fontStyle) delta.italic = style.fontStyle === 'italic' || style.fontStyle === 'oblique';
  const decoration = style.textDecorationLine || style.textDecoration;
  if (decoration) {
    delta.decoration = decoration
      .split(/\s+/)
      .filter((p): p is 'underline' | 'line-through' => p === 'underline' || p === 'line-through');
  }
  if (style.color) {
    const hex = cssColorToHex(style.color);
    if (hex) delta.color = hex;
  }
  const script = style.verticalAlign;
  if (script === 'sub' || script === 'super') delta.script = script;
  if (style.fontSize && !delta.script) {
    const px = parseFloat(style.fontSize);
    if (Number.isFinite(px) && scale > 0) delta.size = round2(px / scale);
  }
  if (style.fontFamily) {
    const family = firstFamily(style.fontFamily);
    if (family) delta.family = family;
  }
  if (style.letterSpacing) {
    const px = parseFloat(style.letterSpacing);
    if (Number.isFinite(px) && scale > 0) delta.letterSpacing = round2(px / scale);
  }
  return delta;
}

function applyStyleDelta(
  style: EditorStyle,
  delta: RichTextEditorStyle,
  scale: number,
  cssFontFamily: (family: string) => string,
): void {
  if (delta.weight !== undefined) style.fontWeight = String(delta.weight);
  if (delta.italic !== undefined) style.fontStyle = delta.italic ? 'italic' : 'normal';
  if (delta.decoration !== undefined) {
    const lines = delta.decoration.map((d) => (d === 'word' ? 'underline' : d));
    style.textDecoration = lines.length ? [...new Set(lines)].join(' ') : 'none';
  }
  if (delta.color !== undefined) style.color = delta.color;
  if (delta.script !== undefined && delta.script !== 'normal') {
    // The engine's sub/superscript ratio; the size itself stays inherited.
    style.verticalAlign = delta.script;
    style.fontSize = '0.66em';
  } else if (delta.size !== undefined) {
    style.fontSize = `${delta.size * scale}px`;
  }
  if (delta.family !== undefined) style.fontFamily = cssFontFamily(delta.family);
  if (delta.letterSpacing !== undefined) style.letterSpacing = `${delta.letterSpacing * scale}px`;
}

function mergeDelta(base: RichTextEditorStyle, over: RichTextEditorStyle): RichTextEditorStyle {
  return { ...base, ...over };
}

function sameDelta(
  a: RichTextEditorStyle | undefined,
  b: RichTextEditorStyle | undefined,
): boolean {
  const da = (a ?? {}) as Record<string, unknown>;
  const db = (b ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(da), ...Object.keys(db)]);
  for (const key of keys) {
    const va = da[key];
    const vb = db[key];
    if (Array.isArray(va) || Array.isArray(vb)) {
      const sa = [...((va as string[] | undefined) ?? [])].sort().join(' ');
      const sb = [...((vb as string[] | undefined) ?? [])].sort().join(' ');
      if (sa !== sb) return false;
    } else if (va !== vb) {
      return false;
    }
  }
  return true;
}

// ---- Render -------------------------------------------------------------------

/** Render a document into the element: one block per paragraph, one span per
 *  styled run, `<br>` for a hard break, a placeholder `<br>` at the end of a
 *  block that is empty or ends on a break so the caret has a home. */
export function renderRichText(
  root: EditorRoot,
  doc: RichTextEditorDocument,
  options: { scale: number; cssFontFamily: (family: string) => string },
): void {
  const factory = root.ownerDocument;
  if (!factory) return;
  const blocks: EditorElement[] = [];
  const paragraphs = doc.paragraphs.length ? doc.paragraphs : [{ runs: [{ text: '' }] }];
  for (const paragraph of paragraphs) {
    const block = factory.createElement('div');
    if (paragraph.align) block.style.textAlign = paragraph.align;
    if (paragraph.dir) block.style.direction = paragraph.dir;
    let endsWithBreak = false;
    for (const run of paragraph.runs) {
      // A styled run keeps its hard breaks inside its span, so the break
      // inherits the run's style and serialises back into the same run.
      let container: EditorElement = block;
      if (run.style && Object.keys(run.style).length) {
        container = factory.createElement('span');
        applyStyleDelta(container.style, run.style, options.scale, options.cssFontFamily);
        block.appendChild(container);
      }
      const pieces = run.text.split(/\r\n|\r|\n/);
      for (let i = 0; i < pieces.length; i++) {
        if (i > 0) {
          container.appendChild(factory.createElement('br'));
          endsWithBreak = true;
        }
        const piece = pieces[i]!;
        if (!piece) continue;
        container.appendChild(factory.createTextNode(piece));
        endsWithBreak = false;
      }
    }
    if (endsWithBreak || !lastChild(block)) block.appendChild(factory.createElement('br'));
    blocks.push(block);
  }
  if (root.replaceChildren) {
    root.replaceChildren(...blocks);
  } else {
    while (root.firstChild && root.removeChild) root.removeChild(root.firstChild);
    for (const block of blocks) root.appendChild(block);
  }
}

/** Keep the baseline adjustment on the first block after Enter clones it. */
export function applyFirstLineShift(root: EditorNode, shift: number | undefined): void {
  for (let i = 0; i < root.childNodes.length; i++) {
    const node = root.childNodes[i]!;
    if (!node.style) continue;
    node.style.marginTop = i === 0 && shift ? `${-shift}px` : '';
  }
}

// ---- Serialise ----------------------------------------------------------------

interface Walk {
  root: EditorNode;
  scale: number;
  paragraphs: RichTextEditorParagraph[];
  current: RichTextEditorParagraph | null;
}

function pushText(walk: Walk, text: string, style: RichTextEditorStyle): void {
  if (!walk.current) {
    walk.current = { runs: [] };
    walk.paragraphs.push(walk.current);
  }
  const runs = walk.current.runs;
  const delta = Object.keys(style).length ? style : undefined;
  const last = runs[runs.length - 1];
  if (last && sameDelta(last.style, delta)) {
    last.text += text;
  } else {
    runs.push(delta ? { text, style: delta } : { text });
  }
}

function walkNode(node: EditorNode, inherited: RichTextEditorStyle, walk: Walk): void {
  if (node.nodeType === TEXT_NODE) {
    const text = (node.nodeValue ?? '').replace(/\r\n|\n/g, '\r');
    if (text) pushText(walk, text, inherited);
    return;
  }
  if (node.nodeType !== ELEMENT_NODE) return;
  if (isBreak(node)) {
    if (!isTrailingBreak(node, walk.root)) pushText(walk, '\r', inherited);
    return;
  }
  const name = node.nodeName.toUpperCase();
  let style = inherited;
  if (name === 'B' || name === 'STRONG') style = mergeDelta(style, { weight: 700 });
  if (name === 'I' || name === 'EM') style = mergeDelta(style, { italic: true });
  if (name === 'U') style = mergeDelta(style, { decoration: ['underline'] });
  if (name === 'SUB') style = mergeDelta(style, { script: 'sub' });
  if (name === 'SUP') style = mergeDelta(style, { script: 'super' });
  style = mergeDelta(style, styleDeltaOf(node.style, walk.scale));

  if (isBlock(node)) {
    // A block starts a paragraph: the top-level ones by design, nested ones
    // because the browser wrapped a line during an edit.
    const paragraph: RichTextEditorParagraph = { runs: [] };
    const align = node.style?.textAlign;
    if (align === 'left' || align === 'center' || align === 'right' || align === 'justify') {
      paragraph.align = align;
    }
    if (node.style?.direction === 'rtl') paragraph.dir = 'rtl';
    walk.paragraphs.push(paragraph);
    walk.current = paragraph;
    for (let i = 0; i < node.childNodes.length; i++) walkNode(node.childNodes[i]!, style, walk);
    walk.current = null; // inline content after a block starts a new paragraph
    return;
  }
  for (let i = 0; i < node.childNodes.length; i++) walkNode(node.childNodes[i]!, style, walk);
}

/** The element's content as a document. Inline styles (and the semantic
 *  b/i/u/sub/sup tags a browser may insert) only. */
export function serializeRichText(root: EditorNode, scale: number): RichTextEditorDocument {
  const walk: Walk = { root, scale, paragraphs: [], current: null };
  for (let i = 0; i < root.childNodes.length; i++) walkNode(root.childNodes[i]!, {}, walk);
  for (const paragraph of walk.paragraphs) {
    if (paragraph.runs.length === 0) paragraph.runs.push({ text: '' });
  }
  if (walk.paragraphs.length === 0) walk.paragraphs.push({ runs: [{ text: '' }] });
  return { paragraphs: walk.paragraphs };
}

// ---- Offsets ------------------------------------------------------------------

export interface EditorPosition {
  node: EditorNode;
  offset: number;
}

interface OffsetEvent {
  kind: 'enter' | 'exit' | 'text' | 'break';
  node: EditorNode;
  /** Flat offset where this node's content starts (text/break) or where the
   *  element begins/ends. */
  at: number;
  length: number;
}

/** The element in document order, each node with its flat offset — counted
 *  like the projection: text length, 1 per hard break, 1 between blocks. */
function collectOffsets(root: EditorNode): OffsetEvent[] {
  const events: OffsetEvent[] = [];
  let offset = 0;
  let blocks = 0;
  const visit = (node: EditorNode): void => {
    if (node.nodeType === TEXT_NODE) {
      const length = (node.nodeValue ?? '').length;
      events.push({ kind: 'text', node, at: offset, length });
      offset += length;
      return;
    }
    if (node.nodeType !== ELEMENT_NODE) return;
    if (isBreak(node)) {
      if (isTrailingBreak(node, root)) return;
      events.push({ kind: 'break', node, at: offset, length: 1 });
      offset += 1;
      return;
    }
    if (isBlock(node)) {
      if (blocks > 0) offset += 1; // the paragraph separator
      blocks++;
    }
    events.push({ kind: 'enter', node, at: offset, length: 0 });
    for (let i = 0; i < node.childNodes.length; i++) visit(node.childNodes[i]!);
    events.push({ kind: 'exit', node, at: offset, length: 0 });
  };
  for (let i = 0; i < root.childNodes.length; i++) visit(root.childNodes[i]!);
  return events;
}

/** The flat offset of a DOM position (a node and an offset within it). */
export function offsetOfPosition(root: EditorNode, position: EditorPosition): number {
  if (!contains(root, position.node)) return 0;
  const events = collectOffsets(root);
  if (position.node.nodeType === TEXT_NODE) {
    const event = events.find((e) => e.kind === 'text' && e.node === position.node);
    return event ? event.at + Math.min(position.offset, event.length) : 0;
  }
  if (isBreak(position.node)) {
    const event = events.find((e) => e.kind === 'break' && e.node === position.node);
    if (event) return event.at + (position.offset > 0 ? 1 : 0);
    const exit = events.find((e) => e.kind === 'exit' && e.node === position.node.parentNode);
    return exit ? exit.at : 0;
  }
  // An element position: before its Nth child, or past its last child.
  const child = position.node.childNodes[position.offset];
  if (child) {
    const event = events.find(
      (e) => e.node === child || (e.kind !== 'exit' && contains(child, e.node)),
    );
    if (event) return event.at;
  }
  if (position.node === root) {
    const last = events[events.length - 1];
    return last ? last.at + last.length : 0;
  }
  const exit = events.find((e) => e.kind === 'exit' && e.node === position.node);
  return exit ? exit.at : 0;
}

function indexIn(parent: EditorNode, node: EditorNode): number {
  for (let i = 0; i < parent.childNodes.length; i++) if (parent.childNodes[i] === node) return i;
  return 0;
}

/** The DOM position of a flat offset: inside a text node when one covers it,
 *  else the empty block / the slot after a hard break the offset names. */
export function positionOfOffset(root: EditorNode, offset: number): EditorPosition | null {
  const events = collectOffsets(root);
  const text = events.find((e) => e.kind === 'text' && offset >= e.at && offset <= e.at + e.length);
  if (text) return { node: text.node, offset: offset - text.at };
  const block = events.find((e) => e.kind === 'enter' && isBlock(e.node) && e.at === offset);
  if (block) return { node: block.node, offset: 0 };
  const after = events.find((e) => e.kind === 'break' && e.at + 1 === offset);
  if (after && after.node.parentNode) {
    return { node: after.node.parentNode, offset: indexIn(after.node.parentNode, after.node) + 1 };
  }
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.kind === 'text') return { node: e.node, offset: e.length };
  }
  const first = root.childNodes[0];
  return first ? { node: first, offset: 0 } : null;
}

// ---- The binding --------------------------------------------------------------

/** What the binding reads off a live DOM range (a `Range` or a `StaticRange`). */
interface RangeLike {
  startContainer: Node;
  startOffset: number;
  endContainer: Node;
  endOffset: number;
}

/** The selection's range as the shadow tree sees it: the standard
 *  `getComposedRanges` (options form, then the earlier positional form). */
function composedRange(sel: Selection, shadowRoot: ShadowRoot): RangeLike | null {
  const s = sel as Selection & { getComposedRanges?: (...args: unknown[]) => RangeLike[] };
  if (typeof s.getComposedRanges !== 'function') return null;
  for (const args of [[{ shadowRoots: [shadowRoot] }], [shadowRoot]]) {
    try {
      const ranges = s.getComposedRanges(...args);
      if (ranges.length) return ranges[0]!;
    } catch {
      // an engine with the other signature
    }
  }
  return null;
}

function documentsEqual(a: RichTextEditorDocument, b: RichTextEditorDocument): boolean {
  if (a.paragraphs.length !== b.paragraphs.length) return false;
  for (let i = 0; i < a.paragraphs.length; i++) {
    const pa = a.paragraphs[i]!;
    const pb = b.paragraphs[i]!;
    if ((pa.align ?? 'left') !== (pb.align ?? 'left') || (pa.dir ?? 'ltr') !== (pb.dir ?? 'ltr')) {
      return false;
    }
    if (pa.runs.length !== pb.runs.length) return false;
    for (let j = 0; j < pa.runs.length; j++) {
      const ra = pa.runs[j]!;
      const rb = pb.runs[j]!;
      if (ra.text !== rb.text || !sameDelta(ra.style, rb.style)) return false;
    }
  }
  return true;
}

/** Bind one contentEditable element. Returns the Svelte-action-shaped handle. */
export function attachRichTextEditor(
  el: HTMLElement,
  host: RichTextEditorHost,
  initial: RichTextEditorProps,
): RichTextEditorBinding {
  const root = el as unknown as EditorRoot;
  const doc = el.ownerDocument;
  // Inside a shadow tree (a custom-element viewer) the document's own
  // `activeElement` and selection are retargeted to the HOST: focus and the
  // selection have to be read from the shadow root instead.
  const rootNode = el.getRootNode() as Document | ShadowRoot;
  const activeElement = (): Element | null => rootNode.activeElement;
  const liveRange = (): RangeLike | null => {
    const sel = doc.getSelection();
    if (!sel) return null;
    if (rootNode !== doc) {
      const composed = composedRange(sel, rootNode as ShadowRoot);
      if (composed) return composed;
      const shadowSel = (
        rootNode as ShadowRoot & { getSelection?(): Selection | null }
      ).getSelection?.();
      if (shadowSel && shadowSel.rangeCount > 0) return shadowSel.getRangeAt(0);
    }
    return sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  };
  let props = initial;
  let rendered: RichTextEditorDocument | null = null;
  let composing = false;

  const currentSelection = (): RichTextEditorRange | null => {
    const range = liveRange();
    if (!range) return null;
    const anchor = range.startContainer as unknown as EditorNode;
    const focus = range.endContainer as unknown as EditorNode;
    if (!contains(root, anchor) || !contains(root, focus)) return null;
    const start = offsetOfPosition(root, { node: anchor, offset: range.startOffset });
    const end = offsetOfPosition(root, { node: focus, offset: range.endOffset });
    return { start: Math.min(start, end), end: Math.max(start, end) };
  };

  const select = (range: RichTextEditorRange) => {
    const sel = doc.getSelection();
    if (!sel) return;
    const start = positionOfOffset(root, range.start);
    const end = positionOfOffset(root, range.end);
    if (!start || !end) return;
    // `setBaseAndExtent` places a selection inside a shadow tree in every
    // engine; a Range added from outside is retargeted to the host in some.
    if (typeof sel.setBaseAndExtent === 'function') {
      sel.setBaseAndExtent(
        start.node as unknown as Node,
        start.offset,
        end.node as unknown as Node,
        end.offset,
      );
      return;
    }
    const domRange = doc.createRange();
    domRange.setStart(start.node as unknown as Node, start.offset);
    domRange.setEnd(end.node as unknown as Node, end.offset);
    sel.removeAllRanges();
    sel.addRange(domRange);
  };

  // Read resolved faces in the element's own document (including iframe
  // fonts). Refresh styles without replacing nodes, selection or composition.
  const refreshLineModel = () => {
    const bodyStyle = doc.defaultView?.getComputedStyle(el) ?? el.style;
    const body = {
      family: bodyStyle.fontFamily || 'Helvetica',
      weight: bodyStyle.fontWeight || '400',
      style: bodyStyle.fontStyle || 'normal',
    };
    const size = parseFloat(bodyStyle.fontSize || '16') || 16;
    // Deduplicate measurements only within this synchronous refresh. They
    // must be measured again after fonts or their descriptors change.
    const measured = new Map<string, WebFontMetrics | null>();
    const measureFor = (face: typeof body) => (family: string) => {
      const key = JSON.stringify([family, face.weight, face.style]);
      if (!measured.has(key)) measured.set(key, webFontMetrics(family, doc, face));
      return measured.get(key)!;
    };
    // Read all computed styles before writing line heights to avoid forcing
    // a style recalculation for each run. Native editing may nest spans.
    const runs = Array.from(el.querySelectorAll<HTMLElement>('span, b, strong, i, em')).map(
      (node) => {
        const style = doc.defaultView?.getComputedStyle(node) ?? node.style;
        const face = {
          family: style.fontFamily || body.family,
          weight: style.fontWeight || body.weight,
          style: style.fontStyle || body.style,
        };
        return { node, lineHeight: lineModelFor(face.family, measureFor(face)).lineHeight };
      },
    );
    const measure = measureFor(body);
    const lineHeight = lineModelFor(body.family, measure).lineHeight;
    const shift = firstLineShiftFor(body.family, size, measure);
    el.style.lineHeight = String(lineHeight);
    for (const run of runs) run.node.style.lineHeight = String(run.lineHeight);
    applyFirstLineShift(root, shift);
  };

  const render = (document: RichTextEditorDocument, keepSelection: boolean) => {
    const selection = keepSelection ? currentSelection() : null;
    renderRichText(root, document, {
      scale: props.scale,
      cssFontFamily: host.cssFontFamily,
    });
    refreshLineModel();
    rendered = document;
    if (selection) select(selection);
  };

  const serialiseAndReport = () => {
    // Enter splits a block by CLONING its style attribute, so the first
    // block's shift would ride onto the new paragraph: keep it on the first
    // block alone, whatever the browser produced.
    refreshLineModel();
    const document = serializeRichText(root, props.scale);
    rendered = document;
    host.onInput(document);
  };

  const onInput = () => {
    if (!composing) serialiseAndReport();
  };
  const onCompositionStart = () => {
    composing = true;
  };
  const onCompositionEnd = () => {
    composing = false;
    serialiseAndReport();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    const command: RichTextEditorCommand | null =
      key === 'b' ? 'bold' : key === 'i' ? 'italic' : key === 'u' ? 'underline' : null;
    if (!command) return;
    e.preventDefault();
    host.onCommand(command);
  };
  const onPaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    // execCommand keeps the browser's own undo stack and caret handling for
    // the insertion; the resulting `input` event serialises as usual.
    doc.execCommand('insertText', false, text);
  };
  const onSelectionChange = () => {
    if (activeElement() !== el) return;
    host.onSelectionChange(currentSelection());
  };

  el.addEventListener('input', onInput);
  el.addEventListener('compositionstart', onCompositionStart);
  el.addEventListener('compositionend', onCompositionEnd);
  el.addEventListener('keydown', onKeyDown);
  el.addEventListener('paste', onPaste);
  doc.addEventListener('selectionchange', onSelectionChange);

  render(initial.document, false);
  const stopObservingFonts = observeWebFonts(doc, refreshLineModel);

  return {
    update(next: RichTextEditorProps) {
      const scaleChanged = next.scale !== props.scale;
      props = next;
      // Our own input echoes back through the host unchanged: no re-render,
      // the caret stays where the browser put it. Anything else (a restyle,
      // a remote edit, a scale change) re-renders and restores the caret.
      if (composing) return;
      if (!rendered || scaleChanged || !documentsEqual(next.document, rendered)) {
        render(next.document, activeElement() === el);
        return;
      }
      // The element's font may have changed under an unchanged document (a
      // body restyle): the line model follows it without touching the DOM text.
      refreshLineModel();
    },
    selection: currentSelection,
    select,
    detach() {
      stopObservingFonts();
      el.removeEventListener('input', onInput);
      el.removeEventListener('compositionstart', onCompositionStart);
      el.removeEventListener('compositionend', onCompositionEnd);
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('paste', onPaste);
      doc.removeEventListener('selectionchange', onSelectionChange);
    },
  };
}
