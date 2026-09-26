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
} from '../src/rich-text-editor';

// ---- A fake DOM: enough shape for the binding, no jsdom ------------------------

type FakeNode = EditorNode & { parentNode: FakeNode | null; childNodes: FakeNode[] };

function emptyStyle(): EditorStyle {
  return {
    marginTop: '',
    lineHeight: '',
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
      const fakeChild = child as FakeNode;
      fakeChild.parentNode = node;
      node.childNodes.push(fakeChild);
      return fakeChild;
    },
  };
  return node;
}

function text(value: string): FakeNode {
  return { nodeType: 3, nodeName: '#text', nodeValue: value, parentNode: null, childNodes: [] };
}

function elementTree(tag: string, style: Partial<EditorStyle>, ...children: (FakeNode | string)[]) {
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
  return doc.paragraphs
    .map((paragraph) => paragraph.runs.map((run) => run.text).join(''))
    .join('\r');
}

// ---- Render + serialise -------------------------------------------------------

describe('renderRichText', () => {
  it('renders paragraphs as blocks, styled runs as spans, hard breaks as <br>', () => {
    const element = root();
    renderRichText(
      element,
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
    expect(element.childNodes.map((node) => node.nodeName)).toEqual(['DIV', 'DIV', 'DIV']);
    const [first, second, third] = element.childNodes;
    expect(first!.style!.textAlign).toBe('center');
    expect(first!.childNodes.map((node) => node.nodeName)).toEqual(['#text', 'SPAN']);
    const span = first!.childNodes[1]!;
    expect(span.style!.fontWeight).toBe('700');
    expect(span.style!.color).toBe('#FF0000');
    expect(span.style!.fontSize).toBe('28px');
    expect(second!.childNodes.map((node) => node.nodeName)).toEqual(['#text', 'BR', '#text']);
    // An empty paragraph gets the caret placeholder.
    expect(third!.childNodes.map((node) => node.nodeName)).toEqual(['BR']);
  });

  it('maps script, family, decoration and letter spacing to CSS', () => {
    const element = root();
    renderRichText(
      element,
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
    const [sup, fam, plain] = element.childNodes[0]!.childNodes;
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
    const element = root();
    renderRichText(element, doc, { scale: 1.5, cssFontFamily });
    expect(serializeRichText(element, 1.5)).toEqual(doc);
  });

  it('reads inline styles only (never invents an inherited value)', () => {
    const element = root(
      elementTree('div', {}, elementTree('span', { fontWeight: 'bold' }, 'a'), 'b'),
    );
    expect(serializeRichText(element, 1)).toEqual({
      paragraphs: [{ runs: [{ text: 'a', style: { weight: 700 } }, { text: 'b' }] }],
    });
  });

  it('understands what a browser produces while editing', () => {
    // Chrome: Enter makes a new <div> (with a placeholder <br> when empty),
    // Shift+Enter inserts <br>, a styled new line wraps the placeholder in a
    // span, semantic tags may appear from execCommand or a paste.
    const el = root(
      elementTree('div', {}, 'first', element('br')),
      elementTree('div', {}, elementTree('span', { fontStyle: 'italic' }, element('br'))),
      elementTree('div', {}, 'a', element('br'), 'b', element('br'), element('br')),
      elementTree(
        'div',
        {},
        elementTree('b', {}, 'strong'),
        elementTree('u', {}, 'under'),
        elementTree('sub', {}, '2'),
      ),
      elementTree('div', {}, 'nested', elementTree('div', {}, 'block')),
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
    const element = root(
      elementTree(
        'div',
        {},
        elementTree('span', { color: 'rgb(255, 0, 0)' }, 'a'),
        elementTree('span', { color: '#ff0000' }, 'b'),
        elementTree('span', { color: 'rgb(0, 0, 255)' }, 'c'),
      ),
    );
    expect(serializeRichText(element, 1).paragraphs[0]!.runs).toEqual([
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
  const element = root();
  renderRichText(element, doc, { scale: 1, cssFontFamily });
  const [p1, p2, p3] = element.childNodes;
  const ab = p1!.childNodes[0]!;
  const cd = p1!.childNodes[1]!.childNodes[0]!;
  const eText = p2!.childNodes[0]!;
  const br = p2!.childNodes[1]!;
  const fText = p2!.childNodes[2]!;

  it('counts like the plain projection', () => {
    expect(projection(element)).toBe('abcd\re\rf\r');
    expect(offsetOfPosition(element, { node: ab, offset: 0 })).toBe(0);
    expect(offsetOfPosition(element, { node: ab, offset: 2 })).toBe(2);
    expect(offsetOfPosition(element, { node: cd, offset: 0 })).toBe(2);
    expect(offsetOfPosition(element, { node: cd, offset: 2 })).toBe(4);
    expect(offsetOfPosition(element, { node: eText, offset: 0 })).toBe(5);
    expect(offsetOfPosition(element, { node: fText, offset: 1 })).toBe(8);
  });

  it('resolves element positions (a block with a child index)', () => {
    expect(offsetOfPosition(element, { node: p1!, offset: 1 })).toBe(2); // before the span
    expect(offsetOfPosition(element, { node: p1!, offset: 2 })).toBe(4); // past the last child
    expect(offsetOfPosition(element, { node: p2!, offset: 2 })).toBe(7); // after the <br>
    expect(offsetOfPosition(element, { node: p3!, offset: 0 })).toBe(9); // the empty paragraph
    expect(offsetOfPosition(element, { node: element, offset: 3 })).toBe(9); // the very end
    expect(offsetOfPosition(element, { node: br, offset: 0 })).toBe(6);
  });

  it('maps offsets back to DOM positions', () => {
    expect(positionOfOffset(element, 0)).toEqual({ node: ab, offset: 0 });
    expect(positionOfOffset(element, 2)).toEqual({ node: ab, offset: 2 });
    expect(positionOfOffset(element, 3)).toEqual({ node: cd, offset: 1 });
    expect(positionOfOffset(element, 4)).toEqual({ node: cd, offset: 2 });
    expect(positionOfOffset(element, 5)).toEqual({ node: eText, offset: 0 });
    expect(positionOfOffset(element, 7)).toEqual({ node: fText, offset: 0 });
    expect(positionOfOffset(element, 8)).toEqual({ node: fText, offset: 1 });
    expect(positionOfOffset(element, 9)).toEqual({ node: p3, offset: 0 });
    expect(positionOfOffset(element, 99)).toEqual({ node: fText, offset: 1 }); // clamps to the end
  });

  it('places the caret after a trailing hard break', () => {
    const el2 = root();
    renderRichText(el2, { paragraphs: [{ runs: [{ text: 'a\r' }] }] }, { scale: 1, cssFontFamily });
    const block = el2.childNodes[0]!;
    expect(block.childNodes.map((node) => node.nodeName)).toEqual(['#text', 'BR', 'BR']);
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
    expect(b3.childNodes.map((node) => node.nodeName)).toEqual(['SPAN', 'BR']);
    expect(b3.childNodes[0]!.childNodes.map((node) => node.nodeName)).toEqual([
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
    expect(offsetOfPosition(element, { node: text('elsewhere'), offset: 3 })).toBe(0);
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

function fakeEditor(metrics?: (font: string) => { ascent: number; descent: number }) {
  const el = root() as EditorRoot & FakeNode & ReturnType<typeof fakeEventTarget>;
  Object.assign(el, fakeEventTarget());
  Object.assign(el, {
    querySelectorAll(selector: string) {
      const tags = selector
        .toUpperCase()
        .split(',')
        .map((tag) => tag.trim());
      const nodes: FakeNode[] = [];
      const visit = (node: FakeNode) => {
        for (const child of node.childNodes) {
          if (tags.includes(child.nodeName)) nodes.push(child);
          visit(child);
        }
      };
      visit(el);
      return nodes;
    },
  });
  const context = {
    font: '',
    measureText: vi.fn(() => {
      const measured = metrics!(context.font);
      return {
        fontBoundingBoxAscent: measured.ascent * 100,
        fontBoundingBoxDescent: measured.descent * 100,
      };
    }),
  };
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
    addRange: (added: typeof range) => {
      range = added;
    },
  };
  const document = {
    ...fakeEventTarget(),
    fonts: fakeEventTarget(),
    activeElement: null as unknown,
    getSelection: () => selection,
    createRange: () => {
      const created: NonNullable<typeof range> & {
        setStart(node: EditorNode, offset: number): void;
        setEnd(node: EditorNode, offset: number): void;
      } = {
        startContainer: el,
        startOffset: 0,
        endContainer: el,
        endOffset: 0,
        setStart(node, offset) {
          created.startContainer = node;
          created.startOffset = offset;
        },
        setEnd(node, offset) {
          created.endContainer = node;
          created.endOffset = offset;
        },
      };
      return created;
    },
    execCommand: vi.fn(),
  };
  (el as { ownerDocument: unknown }).ownerDocument = Object.assign(document, factory, {
    createElement: (tag: string) =>
      tag === 'canvas'
        ? Object.assign(element(tag), { getContext: () => (metrics ? context : null) })
        : element(tag),
  });
  (el as { getRootNode?: unknown }).getRootNode = () => document;
  return { el, document, selection, context, currentRange: () => range };
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

  it('refreshes body and run faces after fonts load without replacing text or composition', () => {
    let loaded = false;
    const {
      el: element,
      document,
      context,
    } = fakeEditor((font) => {
      if (!loaded) return { ascent: 0.8, descent: 0.2 };
      return font.includes('700') ? { ascent: 1.1, descent: 0.3 } : { ascent: 0.9, descent: 0.3 };
    });
    element.style!.fontFamily = 'Custom';
    element.style!.fontSize = '20px';
    element.style!.fontStyle = 'italic';
    const h1 = host();
    const rich = { paragraphs: [{ runs: [{ text: 'a' }, { text: 'b', style: { weight: 700 } }] }] };
    const binding = attachRichTextEditor(element as unknown as HTMLElement, h1, {
      document: rich,
      scale: 1,
    });
    const block = element.childNodes[0]!;
    const span = block.childNodes[1]!;
    expect(element.style!.lineHeight).toBe('1.2');
    expect(span.style!.lineHeight).toBe('1.2');
    binding.select({ start: 1, end: 2 });
    element.dispatch('compositionstart');
    loaded = true;
    document.fonts.dispatch('loadingdone');
    expect(element.style!.lineHeight).toBe('1.4');
    expect(span.style!.lineHeight).toBe('1.6');
    expect(element.childNodes[0]).toBe(block);
    expect(block.childNodes[1]).toBe(span);
    expect(binding.selection()).toEqual({ start: 1, end: 2 });
    expect(h1.inputs).toEqual([]);
    expect(context.font).toContain('italic');
    element.dispatch('compositionend');
    expect(h1.inputs).toHaveLength(1);
    binding.detach();
    loaded = false;
    document.fonts.dispatch('loadingdone');
    expect(element.style!.lineHeight).toBe('1.4');
    expect(document.fonts.listeners.get('loadingdone')?.size).toBe(0);
  });

  it('renders on attach and serialises on input', () => {
    const { el: element } = fakeEditor();
    const h1 = host();
    const binding = attachRichTextEditor(element as unknown as HTMLElement, h1, {
      document: initial,
      scale: 1,
    });
    expect(projection(element)).toBe('hello');
    element.childNodes[0]!.childNodes[0]!.nodeValue = 'hello world';
    element.dispatch('input');
    expect(h1.inputs).toEqual([{ paragraphs: [{ runs: [{ text: 'hello world' }] }] }]);
    binding.detach();
  });

  it('states the line model from the element font and keeps the shift on the first block', () => {
    const { el } = fakeEditor();
    // The framework sets the body font; the binding derives the engine's line
    // model from it (no canvas here: a one-em Helvetica, shift = half-leading).
    el.style!.fontFamily = 'Helvetica, Arial, sans-serif';
    el.style!.fontSize = '20px';
    const h1 = host();
    const binding = attachRichTextEditor(el as unknown as HTMLElement, h1, {
      document: { paragraphs: [{ runs: [{ text: 'ab' }] }] },
      scale: 1,
    });
    expect(el.style!.lineHeight).toBe('1.2');
    expect(el.childNodes[0]!.style!.marginTop).toBe('-2px');
    // Enter in Chrome: a second block carrying the first block's inline style.
    const clone = element('div', { marginTop: '-2px' });
    clone.appendChild(text('b'));
    el.appendChild(clone);
    el.childNodes[0]!.childNodes[0]!.nodeValue = 'a';
    el.dispatch('input');
    expect(el.childNodes[0]!.style!.marginTop).toBe('-2px');
    expect(el.childNodes[1]!.style!.marginTop).toBe('');
    expect(h1.inputs[0]).toEqual({
      paragraphs: [{ runs: [{ text: 'a' }] }, { runs: [{ text: 'b' }] }],
    });
    // A body restyle changes the element's font under the same document: the
    // line model follows on update without re-rendering the text.
    const block = el.childNodes[0];
    el.style!.fontSize = '40px';
    binding.update({ document: h1.inputs[0]!, scale: 1 });
    expect(el.childNodes[0]).toBe(block);
    expect(el.childNodes[0]!.style!.marginTop).toBe('-4px');
    binding.detach();
  });

  it('does not re-render when its own input echoes back, but does for a restyle', () => {
    const { el: element } = fakeEditor();
    const h1 = host();
    const binding = attachRichTextEditor(element as unknown as HTMLElement, h1, {
      document: initial,
      scale: 1,
    });
    const block = element.childNodes[0]!;
    element.childNodes[0]!.childNodes[0]!.nodeValue = 'hello!';
    element.dispatch('input');
    binding.update({ document: h1.inputs[0]!, scale: 1 });
    expect(element.childNodes[0]).toBe(block); // untouched: the caret survives
    binding.update({
      document: { paragraphs: [{ runs: [{ text: 'hello!', style: { weight: 700 } }] }] },
      scale: 1,
    });
    expect(element.childNodes[0]).not.toBe(block);
    expect(element.childNodes[0]!.childNodes[0]!.style!.fontWeight).toBe('700');
    binding.update({ document: h1.inputs[0]!, scale: 2 }); // a scale change re-renders too
    expect(element.childNodes[0]!.childNodes[0]!.nodeName).toBe('#text');
    binding.detach();
  });

  it('restores the selection across a model-driven re-render when focused', () => {
    const { el: element, document, currentRange } = fakeEditor();
    const h1 = host();
    const binding = attachRichTextEditor(element as unknown as HTMLElement, h1, {
      document: initial,
      scale: 1,
    });
    document.activeElement = element;
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
    const range = currentRange()!;
    expect(range.startContainer).toBe(element.childNodes[0]!.childNodes[0]); // 'h' end
    expect(range.endContainer).toBe(element.childNodes[0]!.childNodes[1]!.childNodes[0]); // 'el' end
    binding.detach();
  });

  it('forwards commands, defers input during composition, pastes plain text', () => {
    const { el: element, document } = fakeEditor();
    const h1 = host();
    const binding = attachRichTextEditor(element as unknown as HTMLElement, h1, {
      document: initial,
      scale: 1,
    });
    const prevented: string[] = [];
    const keyEvent = (key: string, mods: Partial<KeyboardEvent> = {}) => ({
      key,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      ...mods,
      preventDefault: () => prevented.push(key),
    });
    element.dispatch('keydown', keyEvent('b', { metaKey: true }));
    element.dispatch('keydown', keyEvent('i', { ctrlKey: true }));
    element.dispatch('keydown', keyEvent('u', { ctrlKey: true, altKey: true })); // not a command
    element.dispatch('keydown', keyEvent('b')); // plain typing
    expect(h1.commands).toEqual(['bold', 'italic']);
    expect(prevented).toEqual(['b', 'i']);

    element.dispatch('compositionstart');
    element.childNodes[0]!.childNodes[0]!.nodeValue = 'hello 日本';
    element.dispatch('input');
    expect(h1.inputs).toEqual([]);
    binding.update({ document: { paragraphs: [{ runs: [{ text: 'other' }] }] }, scale: 1 });
    expect(projection(element)).toBe('hello 日本'); // no re-render mid-composition
    element.dispatch('compositionend');
    expect(h1.inputs).toEqual([{ paragraphs: [{ runs: [{ text: 'hello 日本' }] }] }]);

    element.dispatch('paste', {
      preventDefault: () => prevented.push('paste'),
      clipboardData: {
        getData: (format: string) => (format === 'text/plain' ? 'pasted' : '<b>x</b>'),
      },
    });
    expect(document.execCommand).toHaveBeenCalledWith('insertText', false, 'pasted');
    expect(prevented).toContain('paste');
    binding.detach();
  });

  it('reads focus and the selection through a shadow root', () => {
    const { el: element, document, selection } = fakeEditor();
    // The document sees the host as active and its selection retargeted
    // (empty here); the shadow root sees the editor and the real range.
    let shadowRange: ReturnType<typeof selection.getRangeAt> = null;
    const shadow = {
      activeElement: element,
      getSelection: () => ({
        get rangeCount() {
          return shadowRange ? 1 : 0;
        },
        getRangeAt: () => shadowRange,
      }),
    };
    (element as { getRootNode?: unknown }).getRootNode = () => shadow;
    document.activeElement = { tagName: 'HOST' };
    const based: unknown[] = [];
    (selection as { setBaseAndExtent?: unknown }).setBaseAndExtent = (...args: unknown[]) =>
      based.push(args);
    const h1 = host();
    const binding = attachRichTextEditor(element as unknown as HTMLElement, h1, {
      document: initial,
      scale: 1,
    });
    const textNode = element.childNodes[0]!.childNodes[0]!;
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
    const { el: element, document } = fakeEditor();
    const h1 = host();
    const binding = attachRichTextEditor(element as unknown as HTMLElement, h1, {
      document: initial,
      scale: 1,
    });
    document.dispatch('selectionchange');
    expect(h1.selections).toEqual([]);
    document.activeElement = element;
    binding.select({ start: 2, end: 2 });
    document.dispatch('selectionchange');
    expect(h1.selections).toEqual([{ start: 2, end: 2 }]);
    binding.detach();
    document.dispatch('selectionchange');
    element.dispatch('input');
    expect(h1.selections).toHaveLength(1);
    expect(h1.inputs).toEqual([]);
  });
});
