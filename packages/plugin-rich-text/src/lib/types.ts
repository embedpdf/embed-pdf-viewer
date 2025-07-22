import { BasePluginConfig } from '@embedpdf/core';
import { Schema } from 'prosemirror-model';
import { EditorState, Transaction, Plugin } from 'prosemirror-state';

export interface RichTextPluginConfig extends BasePluginConfig {
  // Allow extending schema (e.g., custom marks/nodes)
  extraNodes?: Record<string, any>;
  extraMarks?: Record<string, any>;
  document?: any;
}

export interface RichTextCapability {
  // Schema access
  getSchema(): Schema;

  // State management (pure)
  createEditorState(initialJson: any, extraPlugins?: Plugin[]): EditorState;
  applyTransaction(state: EditorState, tr: Transaction): EditorState;
  getJsonFromState(state: EditorState): any;

  // Parsing/Serializing (uses DOM; browser/jsdom)
  parseFromXHTML(xhtml: string): any; // Returns JSON
  serializeToXHTML(json: any): string; // Returns XHTML string

  // Queries (pure)
  getActiveMarks(state: EditorState): Record<string, boolean | string>; // e.g., { bold: true, fontSize: '18px', textColor: '#000000' }
  getSelectionInfo(state: EditorState): { from: number; to: number; empty: boolean };

  // Command factories (pure: return Transaction or null)
  toggleBold(state: EditorState): Transaction | null;
  toggleItalic(state: EditorState): Transaction | null;
  toggleUnderline(state: EditorState): Transaction | null;
  toggleStrike(state: EditorState): Transaction | null;
  setTextColor(state: EditorState, color: string): Transaction | null;
  setBackgroundColor(state: EditorState, color: string): Transaction | null;
  setFontSize(state: EditorState, size: string): Transaction | null; // e.g., '18px'
  setFontFamily(state: EditorState, family: string): Transaction | null;
  undo(state: EditorState): Transaction | null;
  redo(state: EditorState): Transaction | null;
  // Add more as needed, e.g., insertLink(url: string)
}
