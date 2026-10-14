/**
 * Text boxes you type in. `@embedpdf/web`'s text box editor makes an element the editor of a free
 * text box (rich text, focus and `contentEditable` following the plugin's `editing`, presses kept
 * inside the box), and its follower attaches when the element and the capability are there and
 * takes the box and the scale whenever they change; this binds the follower to Svelte as an
 * attachment. The layer's own text boxes use it, and so does `useRichTextEditor()`, for a renderer
 * that draws its text box itself.
 */
import { getContext, hasContext, setContext, untrack } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import { annotationKey } from '@embedpdf/core';
import type { Annotation, AnnotationRef, TextItem } from '@embedpdf/plugin-annotation';
// Typing reaches the plugin through its host lens (drafts, the text selection).
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import {
  createTextBoxEditorFollower,
  cssText,
  textBoxEditorScaleOf,
  textBoxStyleOf,
} from '@embedpdf/web';
import { usePage } from '../runtime/page';
import { useOptionalCapability, useOptionalSelector } from '../runtime/readers.svelte';
import { valueOf, type MaybeGetter } from '../runtime/values.svelte';
import type { RichTextEditor } from './props';

/**
 * An attachment that makes its element the editor of the text box `item()` gives, at `scale()`
 * pixels per point. Call it while a component is created. The element must stay empty in the
 * markup: the editor owns what's inside it.
 */
export function textBoxEditor(
  item: () => TextItem | null,
  scale: () => number,
): Attachment<HTMLElement> {
  const capability = useOptionalCapability(AnnotationHostToken);
  return (element) => {
    const follower = createTextBoxEditorFollower<AnnotationRef>();
    // Another document attaches again; every change of the box or the scale reaches the editor,
    // which redraws only when the text differs, so the caret never jumps while typing; focus
    // follows `editing`.
    $effect(() => {
      const annotation = capability.current;
      const current = item();
      const pixelsPerPoint = scale();
      untrack(() => follower.follow(element, annotation, current, pixelsPerPoint));
    });
    return () => follower.detach();
  };
}

const LOOK_SCALE = Symbol('embedpdf.annotation-look-scale');

/** For the layer, around a look it scales: how much it scales what the look draws. */
export function setLookScale(scale: () => number): void {
  setContext(LOOK_SCALE, scale);
}

/** How much the layer scales the look around this component: 1 outside a look, or in one drawn at its size on screen. */
function lookScaleOf(): () => number {
  return hasContext(LOOK_SCALE) ? getContext<() => number>(LOOK_SCALE) : () => 1;
}

/**
 * Make your own element the editor of a text box you draw yourself (a renderer for free text):
 * it draws the runs, turns typing back into runs, keeps the caret when the style changes, and
 * handles pasting, input methods and the format shortcuts. The formatting calls
 * (`text.toggleFormat`, `selection.update`) work on it as they do on the layer's own.
 *
 * ```svelte
 * const editor = useRichTextEditor(() => annotation);
 * <div {@attach editor.attach} class={['box', editor.editing && 'editing']} style={editor.style}></div>
 * ```
 *
 * `attach` goes on your element (render nothing inside it: the editor owns what's in it); `style`
 * and `editing` follow the box.
 */
export function useRichTextEditor(annotation: MaybeGetter<Annotation>): RichTextEditor {
  const page = usePage();
  const lookScale = lookScaleOf();
  const item = useOptionalSelector(
    AnnotationHostToken,
    (host) => {
      const key = annotationKey(valueOf(annotation).ref);
      const { transform } = page;
      return (
        host
          .listTextItems(page.ref, { zoom: transform.zoom, rotation: transform.rotation })
          .find((text) => text.ref !== null && annotationKey(text.ref) === key) ?? null
      );
    },
    null,
  );
  // Pixels per point where the element is: inside a scaled look, at the annotation's 100% size;
  // the look's scale does the rest.
  const scale = $derived(textBoxEditorScaleOf(item.current, page.transform, lookScale()));
  // While typing, the element takes the pointer (the caret, a drag over words).
  const style = $derived.by(() => {
    const text = item.current;
    if (!text) return '';
    return cssText({
      ...textBoxStyleOf(text.css, scale),
      ...(text.editing ? { pointerEvents: 'auto' } : {}),
    });
  });
  const attach = textBoxEditor(
    () => item.current,
    () => scale,
  );
  return {
    attach,
    get style() {
      return style;
    },
    get editing() {
      return item.current?.editing ?? false;
    },
  };
}
