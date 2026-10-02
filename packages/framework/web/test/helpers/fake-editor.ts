/**
 * A fake DOM for the rich-text editor binding: enough shape for
 * `attachRichTextEditor` (nodes, styles, a selection, a canvas for font
 * metrics, event targets), no jsdom.
 */
import { vi } from 'vitest';

import type {
  EditorDocumentFactory,
  EditorElement,
  EditorNode,
  EditorRoot,
  EditorStyle,
} from '../../src/rich-text-editor';

export type FakeNode = EditorNode & { parentNode: FakeNode | null; childNodes: FakeNode[] };

export function emptyStyle(): EditorStyle {
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

export function element(tag: string, style: Partial<EditorStyle> = {}): EditorElement & FakeNode {
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

export function text(value: string): FakeNode {
  return { nodeType: 3, nodeName: '#text', nodeValue: value, parentNode: null, childNodes: [] };
}

export function elementTree(
  tag: string,
  style: Partial<EditorStyle>,
  ...children: (FakeNode | string)[]
) {
  const el = element(tag, style);
  for (const child of children) el.appendChild(typeof child === 'string' ? text(child) : child);
  return el;
}

export const factory: EditorDocumentFactory = {
  createElement: (tag) => element(tag),
  createTextNode: (value) => text(value),
};

export function root(...children: FakeNode[]): EditorRoot & FakeNode {
  const el = element('div') as EditorElement & FakeNode & EditorRoot;
  el.ownerDocument = factory;
  el.replaceChildren = (...nodes: EditorNode[]) => {
    el.childNodes.length = 0;
    for (const node of nodes) el.appendChild(node);
  };
  for (const child of children) el.appendChild(child);
  return el;
}

type Listener = (event: unknown) => void;

export function fakeEventTarget() {
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

export function fakeEditor(metrics?: (font: string) => { ascent: number; descent: number }) {
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
