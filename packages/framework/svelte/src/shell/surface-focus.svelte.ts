/**
 * Putting the cursor in an element when its panel asks for it. `@embedpdf/web`'s surface focus
 * follower owns the rule (a new request moves the cursor in, and so does mounting while one is
 * up); this binds it to Svelte as an attachment.
 */
import { untrack } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import { ShellToken } from '@embedpdf/plugin-shell';
import { createSurfaceFocusFollower, type SurfaceFocusOptions } from '@embedpdf/web';
import { useOptionalCapability, useOptionalSelector } from '../runtime/readers.svelte';
import { valueOf, type MaybeGetter } from '../runtime/values.svelte';

export type { SurfaceFocusOptions };

/**
 * An attachment that puts the cursor in its element when the surface `id` asks for it: on every
 * `open(id, { focus: true })`, a command whose panel says `focus` among them, and when the
 * element mounts while the request is up (the panel opened, or its code loaded, because of it).
 * A plain open never moves it. `select` selects an input's text, so typing replaces it. It reads
 * the surface of this component's document; pass the id as a function to follow a prop.
 *
 * ```svelte
 * <input {@attach surfaceFocus('search', { select: true })} bind:value={query} />
 * ```
 */
export function surfaceFocus(
  id: MaybeGetter<string>,
  options: SurfaceFocusOptions = {},
): Attachment<HTMLElement> {
  const shell = useOptionalCapability(ShellToken);
  const request = useOptionalSelector(
    ShellToken,
    (current) => current.getSurface(valueOf(id))?.focusRequest ?? 0,
    0,
  );
  return (element) => {
    const follower = createSurfaceFocusFollower();
    $effect(() => {
      const current = shell.current;
      const value = request.current;
      untrack(() => follower.follow(element, current, value, options));
    });
  };
}
