/**
 * Putting the cursor in a panel when it asks. The shell raises a surface's `focusRequest` on
 * every `open(id, { focus: true })` and clears it when the surface closes; the element that
 * follows it takes focus whenever the request changes to a new value above 0, and when it starts
 * following while the request is up (the panel opened, or its code loaded, because of it). The
 * adapters' surface-focus hooks bind a follower to their reactivity; the rule lives here.
 */

/** How an element takes focus when its surface asks. */
export interface SurfaceFocusOptions {
  /** Select the text of an input or a text area as it takes focus, so typing replaces it. */
  readonly select?: boolean;
}

/** One element following one surface's focus requests. */
export interface SurfaceFocusFollower {
  /**
   * Take the surface's request as it is now. `shell` is the capability it was read from (null
   * without a document): another document's shell starts over, as a new mount does. Without an
   * element yet, a request waits for it.
   */
  follow(
    element: HTMLElement | null,
    shell: object | null,
    request: number,
    options?: SurfaceFocusOptions,
  ): void;
}

/** Whether an element has text that `select()` selects. */
const hasSelectableText = (element: HTMLElement): element is HTMLInputElement =>
  element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';

export function createSurfaceFocusFollower(): SurfaceFocusFollower {
  let current: object | null = null;
  // The request the element last acted on: 0 at the start and for each new document.
  let taken = 0;
  return {
    follow(element, shell, request, options = {}) {
      if (shell !== current) {
        current = shell;
        taken = 0;
      }
      if (request === 0) {
        taken = 0;
        return;
      }
      // The count only climbs, or clears when the surface closes, so any other value above 0
      // is a new request: also one read after a close and a reopen that came in together.
      if (request === taken || !element) return;
      taken = request;
      element.focus();
      if (options.select && hasSelectableText(element)) element.select();
    },
  };
}
