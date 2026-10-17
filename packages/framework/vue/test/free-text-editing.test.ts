import { h } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import type { AnnotationRef } from '@embedpdf/plugin-annotation';
import { AnnotationLayer } from '../src/annotation';
import { eventually, mountLayer } from './annotation-fixture';

/**
 * Typing into a free text box through the DOM, over a real kernel and engine:
 * the Vue editor glue decides how often the engine is written. It must show
 * every keystroke at once and write once, after a pause in typing or when the
 * edit ends.
 */
async function openEditor() {
  const mounted = await mountLayer(() => h(AnnotationLayer));
  const { annotation } = mounted;
  const freeText = annotation.list().find((entry) => entry.subtype === 'free-text')!;
  const writes: AnnotationRef[] = [];
  annotation.onUpdated((event) => writes.push(event.annotation.ref));
  annotation.text.begin(freeText.ref);
  const editor = await eventually(() => {
    const element = document.querySelector<HTMLElement>('[contenteditable="true"]');
    expect(element).not.toBeNull();
    return element!;
  });

  /** Replace the editor's first line with `text`, the way the browser reports typing. */
  const type = (text: string) => {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode();
    if (first) first.nodeValue = text;
    else editor.textContent = text;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  };
  return { ...mounted, ref: freeText.ref, writes, type, editor };
}

enableAutoUnmount(afterEach);
afterEach(() => {
  document.body.innerHTML = '';
});

describe('free text typing through the Vue editor', () => {
  it('shows each keystroke at once and writes once after a pause', { timeout: 45_000 }, async () => {
    const { annotation, ref, writes, type, close } = await openEditor();
    try {
      type('Typed');
      type('Typed text');
      expect(annotation.get(ref)!.contents).toContain('Typed text');
      expect(writes).toHaveLength(0);

      await eventually(() => expect(writes).toHaveLength(1), 5_000);
      expect(annotation.get(ref)!.contents).toContain('Typed text');
      expect(annotation.isPending(ref)).toBe(false);
    } finally {
      await close();
    }
  });

  it('ending the edit writes what was typed at once', { timeout: 45_000 }, async () => {
    const { annotation, ref, writes, type, close } = await openEditor();
    try {
      type('Finished');
      await annotation.text.end();

      expect(writes).toHaveLength(1);
      expect(annotation.get(ref)!.contents).toContain('Finished');
    } finally {
      await close();
    }
  });

  it('a press inside the box stays there: the page below never sees it', { timeout: 45_000 }, async () => {
    const { editor, close } = await openEditor();
    try {
      const presses: Event[] = [];
      document.body.addEventListener('pointerdown', (event) => presses.push(event));
      editor.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      expect(presses).toHaveLength(0);
      // The element is the one the layer made, not one Vue re-created while typing.
      expect(document.querySelector('[contenteditable="true"]')).toBe(editor);
    } finally {
      await close();
    }
  });
});
