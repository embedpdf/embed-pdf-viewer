import { BasePlugin, PluginRegistry } from '@embedpdf/core';
import { PdfEngine } from '@embedpdf/models';
import { RichTextCapability, RichTextPluginConfig } from './types';
import { Schema, DOMParser as PMDOMParser, DOMSerializer } from 'prosemirror-model';
import { EditorState, Transaction, Plugin } from 'prosemirror-state';
import { toggleMark } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';

export class RichTextPlugin extends BasePlugin<RichTextPluginConfig, RichTextCapability> {
  static readonly id = 'rich-text' as const;

  private schema: Schema;
  private basePlugins: Plugin[] = [history(), keymap(baseKeymap)]; // Shared defaults
  private config: RichTextPluginConfig;

  constructor(
    public readonly id: string,
    registry: PluginRegistry,
    private engine: PdfEngine, // Unused for now; future PDF integration?
    config: RichTextPluginConfig,
  ) {
    super(id, registry);
    this.config = config;
    // Build schema with base + extensions
    this.schema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: {
          content: 'inline*',
          group: 'block',
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0],
        },
        text: { group: 'inline' },
        ...config.extraNodes,
      },
      marks: {
        underline: {
          parseDOM: [
            {
              tag: 'span[style]',
              getAttrs: (dom: HTMLElement) => {
                const raw = (dom as HTMLElement).getAttribute('style') || '';
                return /text-decoration\s*:\s*(underline|word)/i.test(raw) ? {} : false;
              },
            },
          ],
          toDOM: () => ['span', { style: 'text-decoration:word' }, 0],
        },

        bold: {
          parseDOM: [
            {
              style: 'font-weight',
              getAttrs: (v) => {
                console.log(v);
                return /^(bold|700|800|900)$/.test(v) && {};
              },
            },
            { tag: 'b' }, // fallback
            { tag: 'strong' },
          ],
          toDOM: () => ['span', { style: 'font-weight:bold' }, 0],
        },

        italic: {
          parseDOM: [
            { style: 'font-style', getAttrs: (v) => v === 'italic' && {} },
            { tag: 'i' },
            { tag: 'em' },
          ],
          toDOM: () => ['span', { style: 'font-style:italic' }, 0],
        },

        strike: {
          parseDOM: [
            { style: 'text-decoration', getAttrs: (v) => /(line-through|strike)/.test(v) && {} },
            { tag: 's' },
            { tag: 'del' },
          ],
          toDOM: () => ['span', { style: 'text-decoration:line-through' }, 0],
        },

        textColor: {
          attrs: { color: {} },
          parseDOM: [{ style: 'color', getAttrs: (color) => (color ? { color } : false) }],
          toDOM: (m) => ['span', { style: `color:${m.attrs.color}` }, 0],
        },

        backgroundColor: {
          attrs: { color: {} },
          parseDOM: [
            { style: 'background-color', getAttrs: (color) => (color ? { color } : false) },
          ],
          toDOM: (m) => ['span', { style: `background-color:${m.attrs.color}` }, 0],
        },

        fontSize: {
          attrs: { size: {} },
          parseDOM: [{ style: 'font-size', getAttrs: (size) => (size ? { size } : false) }],
          toDOM: (m) => ['span', { style: `font-size:${m.attrs.size}` }, 0],
        },

        fontFamily: {
          attrs: { family: {} },
          parseDOM: [{ style: 'font-family', getAttrs: (family) => (family ? { family } : false) }],
          toDOM: (m) => ['span', { style: `font-family:${m.attrs.family}` }, 0],
        },
        ...config.extraMarks,
      },
    });
  }

  protected buildCapability(): RichTextCapability {
    return {
      getSchema: () => this.schema,

      createEditorState: (initialJson, extraPlugins = []) =>
        EditorState.create({
          schema: this.schema,
          doc: this.schema.nodeFromJSON(
            initialJson || { type: 'doc', content: [{ type: 'paragraph' }] },
          ),
          plugins: [...this.basePlugins, ...extraPlugins],
        }),

      applyTransaction: (state, tr) => state.apply(tr),

      getJsonFromState: (state) => state.doc.toJSON(),

      parseFromXHTML: (xhtml) => {
        const parser = PMDOMParser.fromSchema(this.schema);
        const dom = new DOMParser().parseFromString(xhtml, 'application/xml');
        console.log(dom);
        // Handle <body> root; skip if error
        const body = dom.querySelector('body') || dom;
        console.log(body);
        return parser.parse(body, { preserveWhitespace: true }).toJSON();
      },

      serializeToXHTML: (json) => {
        const doc = this.schema.nodeFromJSON(json);
        const serializer = DOMSerializer.fromSchema(this.schema);
        const fragment = serializer.serializeFragment(doc.content, {
          document: this.config.document,
        });
        const wrapper = this.config.document.createElement('body');
        wrapper.appendChild(fragment);
        // Add xmlns for PDF compatibility
        wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
        wrapper.setAttribute('xmlns:xfa', 'http://www.xfa.org/schema/xfa-data/1.0/');
        wrapper.setAttribute('xfa:spec', '2.0.2');
        return new XMLSerializer().serializeToString(wrapper);
      },

      getActiveMarks: (state) => {
        const { from, $from, to, empty } = state.selection;
        if (empty) return {};
        const marks: Record<string, boolean | string> = {};
        state.doc.nodesBetween(from, to, (node) => {
          node.marks.forEach((mark) => {
            const name = mark.type.name;
            if (['bold', 'italic', 'underline', 'strike'].includes(name)) {
              marks[name] = true;
            } else if (name === 'textColor' || name === 'backgroundColor') {
              marks[name] = mark.attrs.color;
            } else if (name === 'fontSize') {
              marks[name] = mark.attrs.size;
            } else if (name === 'fontFamily') {
              marks[name] = mark.attrs.family;
            }
          });
          return true; // Continue traversal
        });
        return marks;
      },

      getSelectionInfo: (state) => ({
        from: state.selection.from,
        to: state.selection.to,
        empty: state.selection.empty,
      }),

      toggleBold: (state) => {
        const markType = this.schema.marks.bold;
        let tr = state.tr;
        toggleMark(markType)(state, (cmdTr) => (tr = cmdTr));
        return tr.docChanged ? tr : null;
      },

      toggleItalic: (state) => {
        const markType = this.schema.marks.italic;
        let tr = state.tr;
        toggleMark(markType)(state, (cmdTr) => (tr = cmdTr));
        return tr.docChanged ? tr : null;
      },

      toggleUnderline: (state) => {
        const markType = this.schema.marks.underline;
        let tr = state.tr;
        toggleMark(markType)(state, (cmdTr) => (tr = cmdTr));
        return tr.docChanged ? tr : null;
      },

      toggleStrike: (state) => {
        const markType = this.schema.marks.strike;
        let tr = state.tr;
        toggleMark(markType)(state, (cmdTr) => (tr = cmdTr));
        return tr.docChanged ? tr : null;
      },

      setTextColor: (state, color) => {
        const markType = this.schema.marks.textColor;
        let tr = state.tr;
        toggleMark(markType, { color })(state, (cmdTr) => (tr = cmdTr)); // Toggle with attrs (adds if not, replaces if exists)
        return tr.docChanged ? tr : null;
      },

      setBackgroundColor: (state, color) => {
        const markType = this.schema.marks.backgroundColor;
        let tr = state.tr;
        toggleMark(markType, { color })(state, (cmdTr) => (tr = cmdTr));
        return tr.docChanged ? tr : null;
      },

      setFontSize: (state, size) => {
        const markType = this.schema.marks.fontSize;
        let tr = state.tr;
        toggleMark(markType, { size })(state, (cmdTr) => (tr = cmdTr));
        return tr.docChanged ? tr : null;
      },

      setFontFamily: (state, family) => {
        const markType = this.schema.marks.fontFamily;
        let tr = state.tr;
        toggleMark(markType, { family })(state, (cmdTr) => (tr = cmdTr));
        return tr.docChanged ? tr : null;
      },

      undo: (state) => {
        let tr = state.tr;
        undo(state, (cmdTr) => (tr = cmdTr));
        return tr.docChanged ? tr : null;
      },

      redo: (state) => {
        let tr = state.tr;
        redo(state, (cmdTr) => (tr = cmdTr));
        return tr.docChanged ? tr : null;
      },
    };
  }

  async initialize(config: RichTextPluginConfig): Promise<void> {
    // Optional: Load custom extensions or validate schema
  }

  async destroy(): Promise<void> {
    // Cleanup if needed
  }
}
