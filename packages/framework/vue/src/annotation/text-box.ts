/**
 * Text boxes you type in. `@embedpdf/web`'s text box editor makes an element
 * the editor of a free text box (rich text, focus and `contentEditable`
 * following the plugin's `editing`, presses kept inside), and its follower
 * attaches when the element and the capability are there and takes the box
 * and the scale whenever they change; this binds the follower to Vue. The
 * layer's own text boxes use it, and so does `useRichTextEditor()`, for a
 * renderer that draws its text box itself.
 */
import { computed, inject, onScopeDispose, provide, shallowRef, toValue, watch } from 'vue';
import type { ComponentPublicInstance, CSSProperties, InjectionKey, MaybeRefOrGetter, Ref } from 'vue';
import { annotationKey } from '@embedpdf/core';
import type { Annotation, AnnotationRef, TextItem } from '@embedpdf/plugin-annotation';
// Typing reaches the plugin through its host lens (drafts, the text selection).
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import { createTextBoxEditorFollower, textBoxEditorScaleOf, textBoxStyleOf } from '@embedpdf/web';
import { useOptionalCapability, useOptionalSelector } from '../runtime/capabilities';
import { usePage } from '../runtime/page';
import type { RichTextEditor } from './types';

/**
 * Make an element the editor of a text box, following `item` and `scale`
 * (pixels per point). Returns the element's ref: put it on the element, and
 * render nothing inside it, since the editor owns its children.
 */
export function useTextBoxEditor(
  item: MaybeRefOrGetter<TextItem | null>,
  scale: MaybeRefOrGetter<number>,
): Ref<HTMLElement | null> {
  const element = shallowRef<HTMLElement | null>(null);
  const annotation = useOptionalCapability(AnnotationHostToken);
  const follower = createTextBoxEditorFollower<AnnotationRef>();
  // `post`: the element is in the document by then, so focusing it works. The
  // editor redraws only when the text differs, so the caret never jumps while
  // typing; focus follows `editing`.
  watch(
    [annotation, element, () => toValue(item), () => toValue(scale)],
    ([capability, target, current, pixelsPerPoint]) =>
      follower.follow(target, capability, current, pixelsPerPoint),
    { immediate: true, flush: 'post' },
  );
  onScopeDispose(() => follower.detach());
  return element;
}

/** How much the layer scales the look around it: 1 outside a look, or in one drawn at its size on screen. */
const LookScaleKey: InjectionKey<Readonly<Ref<number>>> = Symbol('embedpdf annotation look scale');
const UNSCALED = computed(() => 1);

/** Installed by the layer around a look it scales, not by app code. */
export function provideLookScale(scale: Readonly<Ref<number>>): void {
  provide(LookScaleKey, scale);
}

const NO_STYLE: CSSProperties = Object.freeze({});

/**
 * Make your own element the editor of a text box you draw yourself (a
 * renderer for free text): it draws the runs, turns typing back into runs,
 * keeps the caret when the style changes, and handles pasting, input methods
 * and the format shortcuts. The formatting calls (`text.toggleFormat`,
 * `selection.update`) work on it as they do on the built-in one.
 *
 * ```vue
 * const { ref: editorRef, editing, style } = useRichTextEditor(() => props.annotation);
 * <div :ref="editorRef" :class="{ editing }" :style="style" />
 * ```
 *
 * `ref` goes on your element (render nothing inside it: the editor owns what's
 * in it); `style` and `editing` are refs.
 */
export function useRichTextEditor(annotation: MaybeRefOrGetter<Annotation>): RichTextEditor {
  const page = usePage();
  const item = useOptionalSelector(
    AnnotationHostToken,
    (host) => {
      const key = annotationKey(toValue(annotation).ref);
      const { transform } = page.value;
      return (
        host
          .listTextItems(page.value.ref, { zoom: transform.zoom, rotation: transform.rotation })
          .find((text) => text.ref !== null && annotationKey(text.ref) === key) ?? null
      );
    },
    null,
  );
  // Pixels per point where the element is: inside a scaled look, at the
  // annotation's 100% size; the look's scale does the rest.
  const lookScale = inject(LookScaleKey, UNSCALED);
  const scale = computed(() =>
    textBoxEditorScaleOf(item.value, page.value.transform, lookScale.value),
  );
  const element = useTextBoxEditor(item, scale);
  // While typing, the element takes the pointer (the caret, a drag over words).
  const style = computed((): CSSProperties => {
    const text = item.value;
    if (!text) return NO_STYLE;
    return {
      ...textBoxStyleOf(text.css, scale.value),
      ...(text.editing ? { pointerEvents: 'auto' } : {}),
    };
  });
  return {
    ref: (target: Element | ComponentPublicInstance | null) => {
      element.value = target instanceof HTMLElement ? target : null;
    },
    style,
    editing: computed(() => item.value?.editing ?? false),
  };
}
