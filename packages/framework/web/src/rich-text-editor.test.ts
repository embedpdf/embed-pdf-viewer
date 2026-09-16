import { describe, expect, it, vi } from 'vitest';

import {
  attachRichTextEditor,
  offsetOfPosition,
  positionOfOffset,
  renderRichText,
  serializeRichText,
  styleDeltaOf,
  type EditorDocumentFactory,
  type EditorElement,
  type EditorNode,
  type EditorRoot,
  type EditorStyle,
  type RichTextEditorDocument,
  type RichTextEditorHost,
} from './rich-text-editor';

// ---- A fake DOM: enough shape for the binding, no jsdom ------------------------

type FakeNode = EditorNode & { parentNode: FakeNode | null; childNodes: FakeNode[] };

function emptyStyle(): EditorStyle {
  return {
    fontWeight: '',
    fontStyle: '',
    textDecoration: '',
    color: '',
    fontSize: '',
    fontFamily: '',
    verticalAlign: '',
    letterSpacing: '',
    textAlign: '',
    direction: '',
  };
}

function element(tag: string, style: Partial<EditorStyle> = {}): EditorElement & FakeNode {
  const node: EditorElement & FakeNode = {
    nodeType: 1,
    nodeName: tag.toUpperCase(),
    nodeValue: null,
    parentNode: null,
    childNodes: [],
    style: { ...emptyStyle(), ...style },
    appendChild(child: EditorNode) {
      const c = child as FakeNode;
      c.parentNode = node;
      node.childNodes.push(c);
      return c;
    },
  };
  return node;
}

function text(value: string): FakeNode {
  return { nodeType: 3, nodeName: '#text', nodeValue: value, parentNode: null, childNodes: [] };
}

function h(tag: string, style: Partial<EditorStyle>, ...children: (FakeNode | string)[]) {
  const el = element(tag, style);
  for (const child of children) el.appendChild(typeof child === 'string' ? text(child) : child);
  return el;
}

const factory: EditorDocumentFactory = {
  createElement: (tag) => element(tag),
  createTextNode: (value) => text(value),
};

function root(...children: FakeNode[]): EditorRoot & FakeNode {
  const el = element('div') as EditorElement & FakeNode & EditorRoot;
  el.ownerDocument = factory;
  el.replaceChildren = (...nodes: EditorNode[]) => {
    el.childNodes.length = 0;
    for (const node of nodes) el.appendChild(node);
  };
  for (const child of children) el.appendChild(child);
  return el;
}

const cssFontFamily = (family: string) =>
  family === 'Helvetica' ? 'Helvetica, Arial, sans-serif' : `"${family}"`;

function projection(node: EditorNode): string {
  const doc = serializeRichText(node, 1);
  return doc.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\r');
}

// ---- Render + serialise -------------------------------------------------------

describe('renderRichText', () => {
  it('renders paragraphs as blocks, styled runs as spans, hard breaks as <br>', () => {
    const el = root();
    renderRichText(
      el,
      {
        paragraphs: [
          {
            align: 'center',
            runs: [
              { text: 'Hello ' },
              { text: 'bold', style: { weight: 700, color: '#FF0000', size: 14 } },
            ],
          },
          { runs: [{ text: 'a\rb' }] },
          { runs: [{ text: '' }] },
        ],
      },
      { scale: 2, cssFontFamily },
    );
    expect(el.childNodes.map((n) => n.nodeName)).toEqual(['DIV', 'DIV', 'DIV']);
    const [first, second, third] = el.childNodes;
    expect(first!.style!.textAlign).toBe('center');
    expect(first!.childNodes.map((n) => n.nodeName)).toEqual(['#text', 'SPAN']);
    const span = first!.childNodes[1]!;
    expect(span.style!.fontWeight).toBe('700');
    expect(span.style!.color).toBe('#FF0000');
    expect(span.style!.fontSize).toBe('28px');
    expect(second!.childNodes.map((n) => n.nodeName)).toEqual(['#text', 'BR', '#text']);
    // An empty paragraph gets the caret placeholder.
    expect(third!.childNodes.map((n) => n.nodeName)).toEqual(['BR']);
  });

  it('maps script, family, decoration and letter spacing to CSS', () => {
    const el = root();
    renderRichText(
      el,
      {
        paragraphs: [
          {
            runs: [
              { text: 'x', style: { script: 'super', size: 12 } },
              {
                text: 'y',
                style: { family: 'MyFont', decoration: ['underline', 'word'], letterSpacing: 1 },
              },
              { text: 'z', style: { decoration: [], italic: false } },
            ],
          },
        ],
      },
      { scale: 1, cssFontFamily },
    );
    const [sup, fam, plain] = el.childNodes[0]!.childNodes;
    expect(sup!.style!.verticalAlign).toBe('super');
    expect(sup!.style!.fontSize).toBe('0.66em'); // the engine's ratio, size inherited
    expect(fam!.style!.fontFamily).toBe('"MyFont"');
    expect(fam!.style!.textDecoration).toBe('underline'); // word-underline folds in
    expect(fam!.style!.letterSpacing).toBe('1px');
    expect(plain!.style!.textDecoration).toBe('none');
    expect(plain!.style!.fontStyle).toBe('normal');
  });
});

describe('serializeRichText', () => {
  it('round-trips a rendered document', () => {
    const doc: RichTextEditorDocument = {
      paragraphs: [
        {
          align: 'right',
          runs: [
            { text: 'Hello ' },
            { text: 'bold', style: { weight: 700, italic: true, color: '#00FF00', size: 10 } },
            { text: ' sub', style: { script: 'sub' } },
          ],
        },
        { dir: 'rtl', runs: [{ text: 'line\rbreak', style: { family: 'Helvetica' } }] },
        { runs: [{ text: '' }] },
      ],
    };
    const el = root();
    renderRichText(el, doc, { scale: 1.5, cssFontFamily });
    expect(serializeRichText(el, 1.5)).toEqual(doc);
  });

  it('reads inline styles only (never invents an inherited value)', () => {
    const el = root(h('div', {}, h('span', { fontWeight: 'bold' }, 'a'), 'b'));
    expect(serializeRichText(el, 1)).toEqual({
      paragraphs: [{ runs: [{ text: 'a', style: { weight: 700 } }, { text: 'b' }] }],
    });
  });

  it('understands what a browser produces while editing', () => {
    // Chrome: Enter makes a new <div> (with a placeholder <br> when empty),
    // Shift+Enter inserts <br>, a styled new line wraps the placeholder in a
    // span, semantic tags may appear from execCommand or a paste.
    const el = root(
      h('div', {}, 'first', element('br')),
      h('div', {}, h('span', { fontStyle: 'italic' }, element('br'))),
      h('div', {}, 'a', element('br'), 'b', element('br'), element('br')),
      h('div', {}, h('b', {}, 'strong'), h('u', {}, 'under'), h('sub', {}, '2')),
      h('div', {}, 'nested', h('div', {}, 'block')),
    );
    expect(serializeRichText(el, 1)).toEqual({
      paragraphs: [
        { runs: [{ text: 'first' }] },
        { runs: [{ text: '' }] },
        { runs: [{ text: 'a\rb\r' }] },
        {
          runs: [
            { text: 'strong', style: { weight: 700 } },
            { text: 'under', style: { decoration: ['underline'] } },
            { text: '2', style: { script: 'sub' } },
          ],
        },
        { runs: [{ text: 'nested' }] },
        { runs: [{ text: 'block' }] },
      ],
    });
  });

  it('merges adjacent runs with the same delta and converts colours', () => {
    const el = root(
      h(
        'div',
        {},
        h('span', { color: 'rgb(255, 0, 0)' }, 'a'),
        h('span', { color: '#ff0000' }, 'b'),
        h('span', { color: 'rgb(0, 0, 255)' }, 'c'),
      ),
    );
    expect(serializeRichText(el, 1).paragraphs[0]!.runs).toEqual([
      { text: 'ab', style: { color: '#FF0000' } },
      { text: 'c', style: { color: '#0000FF' } },
    ]);
  });

  it('bare text with no block is one paragraph; an empty element is one empty paragraph', () => {
    expect(serializeRichText(root(text('plain')), 1)).toEqual({
      paragraphs: [{ runs: [{ text: 'plain' }] }],
    });
    expect(serializeRichText(root(), 1)).toEqual({ paragraphs: [{ runs: [{ text: '' }] }] });
    expect(serializeRichText(root(element('br')), 1)).toEqual({
      paragraphs: [{ runs: [{ text: '' }] }],
    });
  });
});

describe('styleDeltaOf', () => {
  it('scales px back to points and skips the size of a script span', () => {
    expect(styleDeltaOf({ ...emptyStyle(), fontSize: '24px' }, 2)).toEqual({ size: 12 });
    expect(styleDeltaOf({ ...emptyStyle(), fontSize: '0.66em', verticalAlign: 'sub' }, 2)).toEqual({
      script: 'sub',
    });
    expect(
      styleDeltaOf({ ...emptyStyle(), fontWeight: 'normal', fontStyle: 'oblique' }, 1),
    ).toEqual({ weight: 400, italic: true });
    expect(styleDeltaOf({ ...emptyStyle(), textDecoration: 'none' }, 1)).toEqual({
      decoration: [],
    });
    expect(styleDeltaOf({ ...emptyStyle(), fontFamily: '"My Font", serif' }, 1)).toEqual({
      family: 'My Font',
    });
  });
});

// ---- Offsets ------------------------------------------------------------------

describe('offsets', () => {
  const doc: RichTextEditorDocument = {
    paragraphs: [
      { runs: [{ text: 'ab' }, { text: 'cd', style: { weight: 700 } }] },
      { runs: [{ text: 'e\rf' }] },
      { runs: [{ text: '' }] },
    ],
  };
  const el = root();
  renderRichText(el, doc, { scale: 1, cssFontFamily });
  const [p1, p2, p3] = el.childNodes;
  const ab = p1!.childNodes[0]!;
  const cd = p1!.childNodes[1]!.childNodes[0]!;
  const e = p2!.childNodes[0]!;
  const br = p2!.childNodes[1]!;
  const f = p2!.childNodes[2]!;

  it('counts like the plain projection', () => {
    expect(projection(el)).toBe('abcd\re\rf\r');
    expect(offsetOfPosition(el, { node: ab, offset: 0 })).toBe(0);
    expect(offsetOfPosition(el, { node: ab, offset: 2 })).toBe(2);
    expect(offsetOfPosition(el, { node: cd, offset: 0 })).toBe(2);
    expect(offsetOfPosition(el, { node: cd, offset: 2 })).toBe(4);
    expect(offsetOfPosition(el, { node: e, offset: 0 })).toBe(5);
    expect(offsetOfPosition(el, { node: f, offset: 1 })).toBe(8);
  });

  it('resolves element positions (a block with a child index)', () => {
    expect(offsetOfPosition(el, { node: p1!, offset: 1 })).toBe(2); // before the span
    expect(offsetOfPosition(el, { node: p1!, offset: 2 })).toBe(4); // past the last child
    expect(offsetOfPosition(el, { node: p2!, offset: 2 })).toBe(7); // after the <br>
    expect(offsetOfPosition(el, { node: p3!, offset: 0 })).toBe(9); // the empty paragraph
    expect(offsetOfPosition(el, { node: el, offset: 3 })).toBe(9); // the very end
    expect(offsetOfPosition(el, { node: br, offset: 0 })).toBe(6);
  });

  it('maps offsets back to DOM positions', () => {
    expect(positionOfOffset(el, 0)).toEqual({ node: ab, offset: 0 });
    expect(positionOfOffset(el, 2)).toEqual({ node: ab, offset: 2 });
    expect(positionOfOffset(el, 3)).toEqual({ node: cd, offset: 1 });
    expect(positionOfOffset(el, 4)).toEqual({ node: cd, offset: 2 });
    expect(positionOfOffset(el, 5)).toEqual({ node: e, offset: 0 });
    expect(positionOfOffset(el, 7)).toEqual({ node: f, offset: 0 });
    expect(positionOfOffset(el, 8)).toEqual({ node: f, offset: 1 });
    expect(positionOfOffset(el, 9)).toEqual({ node: p3, offset: 0 });
    expect(positionOfOffset(el, 99)).toEqual({ node: f, offset: 1 }); // clamps to the end
  });

  it('places the caret after a trailing hard break', () => {
    const el2 = root();
    renderRichText(el2, { paragraphs: [{ runs: [{ text: 'a\r' }] }] }, { scale: 1, cssFontFamily });
    const block = el2.childNodes[0]!;
    expect(block.childNodes.map((n) => n.nodeName)).toEqual(['#text', 'BR', 'BR']);
    expect(positionOfOffset(el2, 2)).toEqual({ node: block, offset: 2 });
    expect(offsetOfPosition(el2, { node: block, offset: 2 })).toBe(2);
    // A styled run keeps its break inside the span: it stays in the run.
    const el3 = root();
    renderRichText(
      el3,
      { paragraphs: [{ runs: [{ text: 'a\rb\r', style: { weight: 700 } }] }] },
      { scale: 1, cssFontFamily },
    );
    const b3 = el3.childNodes[0]!;
    expect(b3.childNodes.map((n) => n.nodeName)).toEqual(['SPAN', 'BR']);
    expect(b3.childNodes[0]!.childNodes.map((n) => n.nodeName)).toEqual([
      '#text',
      'BR',
      '#text',
      'BR',
    ]);
    expect(serializeRichText(el3, 1)).toEqual({
      paragraphs: [{ runs: [{ text: 'a\rb\r', style: { weight: 700 } }] }],
    });
    expect(positionOfOffset(el3, 4)).toEqual({ node: b3.childNodes[0], offset: 4 });
  });

  it('ignores positions outside the element', () => {
    expect(offsetOfPosition(el, { node: text('elsewhere'), offset: 3 })).toBe(0);
    expect(positionOfOffset(root(), 0)).toBeNull();
  });
});

// ---- The binding --------------------------------------------------------------

type Listener = (event: unknown) => void;

function fakeEventTarget() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    listeners,
    addEventListener(type: string, fn: Listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: Listener) {
      listeners.get(type)?.delete(fn);
    },
    dispatch(type: string, event: unknown = {}) {
      for (const fn of listeners.get(type) ?? []) fn(event);
    },
  };
}

function fakeEditor() {
  const el = root() as EditorRoot & FakeNode & ReturnType<typeof fakeEventTarget>;
  Object.assign(el, fakeEventTarget());
  let range: {
    startContainer: EditorNode;
    startOffset: number;
    endContainer: EditorNode;
    endOffset: number;
  } | null = null;
  const selection = {
    get rangeCount() {
      return range ? 1 : 0;
    },
    getRangeAt: () => range,
    removeAllRanges: () => {
      range = null;
    },
    addRange: (r: typeof range) => {
      range = r;
    },
  };
  const document = {
    ...fakeEventTarget(),
    activeElement: null as unknown,
    getSelection: () => selection,
    createRange: () => {
      const r: NonNullable<typeof range> & {
        setStart(n: EditorNode, o: number): void;
        setEnd(n: EditorNode, o: number): void;
      } = {
        startContainer: el,
        startOffset: 0,
        endContainer: el,
        endOffset: 0,
        setStart(n, o) {
          r.startContainer = n;
          r.startOffset = o;
        },
        setEnd(n, o) {
          r.endContainer = n;
          r.endOffset = o;
        },
      };
      return r;
    },
    execCommand: vi.fn(),
  };
  (el as { ownerDocument: unknown }).ownerDocument = Object.assign(document, factory);
  (el as { getRootNode?: unknown }).getRootNode = () => document;
  return { el, document, selection, currentRange: () => range };
}

function host(): RichTextEditorHost & {
  inputs: RichTextEditorDocument[];
  selections: unknown[];
  commands: string[];
} {
  const inputs: RichTextEditorDocument[] = [];
  const selections: unknown[] = [];
  const commands: string[] = [];
  return {
    inputs,
    selections,
    commands,
    onInput: (doc) => inputs.push(doc),
    onSelectionChange: (range) => selections.push(range),
    onCommand: (command) => commands.push(command),
    cssFontFamily,
  };
}

describe('attachRichTextEditor', () => {
  const initial: RichTextEditorDocument = { paragraphs: [{ runs: [{ text: 'hello' }] }] };

  it('renders on attach and serialises on input', () => {
    const { el } = fakeEditor();
    const h1 = host();
    const binding = attachRichTextEditor(el as unknown as HTMLElement, h1, {
      document: initial,
      scale: 1,
    });
    expect(projection(el)).toBe('hello');
    el.childNodes[0]!.childNodes[0]!.nodeValue = 'hello world';
    el.dispatch('input');
    expect(h1.inputs).toEqual([{ paragraphs: [{ runs: [{ text: 'hello world' }] }] }]);
    binding.detach();
  });

  it('does not re-render when its own input echoes back, but does for a restyle', () => {
    const { el } = fakeEditor();
    const h1 = host();
    const binding = attachRichTextEditor(el as unknown as HTMLElement, h1, {
      document: initial,
      scale: 1,
    });
    const block = el.childNodes[0]!;
    el.childNodes[0]!.childNodes[0]!.nodeValue = 'hello!';
    el.dispatch('input');
    binding.update({ document: h1.inputs[0]!, scale: 1 });
    expect(el.childNodes[0]).toBe(block); // untouched: the caret survives
    binding.update({
      document: { paragraphs: [{ runs: [{ text: 'hello!', style: { weight: 700 } }] }] },
      scale: 1,
    });
    expect(el.childNodes[0]).not.toBe(block);
    expect(el.childNodes[0]!.childNodes[0]!.style!.fontWeight).toBe('700');
    binding.update({ document: h1.inputs[0]!, scale: 2 }); // a scale change re-renders too
    expect(el.childNodes[0]!.childNodes[0]!.nodeName).toBe('#text');
    binding.detach();
  });

  it('restores the selection across a model-driven re-render when focused', () => {
    const { el, document, currentRange } = fakeEditor();
    const h1 = host();
    const binding = attachRichTextEditor(el as unknown as HTMLElement, h1, {
      document: initial,
      scale: 1,
    });
    document.activeElement = el;
    binding.select({ start: 1, end: 3 });
    expect(binding.selection()).toEqual({ start: 1, end: 3 });
    binding.update({
      document: {
        paragraphs: [
          { runs: [{ text: 'h' }, { text: 'el', style: { italic: true } }, { text: 'lo' }] },
        ],
      },
      scale: 1,
    });
    expect(binding.selection()).toEqual({ start: 1, end: 3 });
    const r = currentRange()!;
    expect(r.startContainer).toBe(el.childNodes[0]!.childNodes[0]); // 'h' end
    expect(r.endContainer).toBe(el.childNodes[0]!.childNodes[1]!.childNodes[0]); // 'el' end
    binding.detach();
  });

  it('forwards commands, defers input during composition, pastes plain text', () => {
    const { el, document } = fakeEditor();
    const h1 = host();
    const binding = attachRichTextEditor(el as unknown as HTMLElement, h1, {
      document: initial,
      scale: 1,
    });
    const prevented: string[] = [];
    const key = (k: string, mods: Partial<KeyboardEvent> = {}) => ({
      key: k,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      ...mods,
      preventDefault: () => prevented.push(k),
    });
    el.dispatch('keydown', key('b', { metaKey: true }));
    el.dispatch('keydown', key('i', { ctrlKey: true }));
    el.dispatch('keydown', key('u', { ctrlKey: true, altKey: true })); // not a command
    el.dispatch('keydown', key('b')); // plain typing
    expect(h1.commands).toEqual(['bold', 'italic']);
    expect(prevented).toEqual(['b', 'i']);

    el.dispatch('compositionstart');
    el.childNodes[0]!.childNodes[0]!.nodeValue = 'hello 日本';
    el.dispatch('input');
    expect(h1.inputs).toEqual([]);
    binding.update({ document: { paragraphs: [{ runs: [{ text: 'other' }] }] }, scale: 1 });
    expect(projection(el)).toBe('hello 日本'); // no re-render mid-composition
    el.dispatch('compositionend');
    expect(h1.inputs).toEqual([{ paragraphs: [{ runs: [{ text: 'hello 日本' }] }] }]);

    el.dispatch('paste', {
      preventDefault: () => prevented.push('paste'),
      clipboardData: { getData: (t: string) => (t === 'text/plain' ? 'pasted' : '<b>x</b>') },
    });
    expect(document.execCommand).toHaveBeenCalledWith('insertText', false, 'pasted');
    expect(prevented).toContain('paste');
    binding.detach();
  });

  it('reads focus and the selection through a shadow root', () => {
    const { el, document, selection } = fakeEditor();
    // The document sees the host as active and its selection retargeted
    // (empty here); the shadow root sees the editor and the real range.
    let shadowRange: ReturnType<typeof selection.getRangeAt> = null;
    const shadow = {
      activeElement: el,
      getSelection: () => ({
        get rangeCount() {
          return shadowRange ? 1 : 0;
        },
        getRangeAt: () => shadowRange,
      }),
    };
    (el as { getRootNode?: unknown }).getRootNode = () => shadow;
    document.activeElement = { tagName: 'HOST' };
    const based: unknown[] = [];
    (selection as { setBaseAndExtent?: unknown }).setBaseAndExtent = (...args: unknown[]) =>
      based.push(args);
    const h1 = host();
    const binding = attachRichTextEditor(el as unknown as HTMLElement, h1, {
      document: initial,
      scale: 1,
    });
    const textNode = el.childNodes[0]!.childNodes[0]!;
    shadowRange = {
      startContainer: textNode,
      startOffset: 1,
      endContainer: textNode,
      endOffset: 4,
    };
    expect(binding.selection()).toEqual({ start: 1, end: 4 });
    document.dispatch('selectionchange');
    expect(h1.selections).toEqual([{ start: 1, end: 4 }]);
    binding.select({ start: 2, end: 3 });
    expect(based).toEqual([[textNode, 2, textNode, 3]]);
    binding.detach();
    delete (selection as { setBaseAndExtent?: unknown }).setBaseAndExtent;
  });

  it('reports selection changes only while focused and unhooks on detach', () => {
    const { el, document } = fakeEditor();
    const h1 = host();
    const binding = attachRichTextEditor(el as unknown as HTMLElement, h1, {
      document: initial,
      scale: 1,
    });
    document.dispatch('selectionchange');
    expect(h1.selections).toEqual([]);
    document.activeElement = el;
    binding.select({ start: 2, end: 2 });
    document.dispatch('selectionchange');
    expect(h1.selections).toEqual([{ start: 2, end: 2 }]);
    binding.detach();
    document.dispatch('selectionchange');
    el.dispatch('input');
    expect(h1.selections).toHaveLength(1);
    expect(h1.inputs).toEqual([]);
  });
});
