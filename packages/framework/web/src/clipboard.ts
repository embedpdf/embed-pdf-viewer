/**
 * Clipboard wiring for text selection — the environmental half of copy.
 *
 * The selection plugin is deliberately DOM-free: its public capability ends
 * at `readText()` (data). Everything that touches `navigator.clipboard` or
 * the native `copy` event lives here, structurally typed so this module
 * stays a pure DOM utility with no EmbedPDF dependencies (the selection
 * capability satisfies {@link ClipboardSelectionSource} as-is).
 */
import { containsFocus } from './focusable';
import { isFromTextField } from './text-field-event';

/** The slice of the selection capability clipboard wiring needs. */
export interface ClipboardSelectionSource {
  hasSelection(): boolean;
  canCopy(): boolean;
  readText(): Promise<string>;
  onChanged(listener: () => void): () => void;
  onCommitted(listener: () => void): () => void;
}

export interface SelectionClipboardOptions {
  /**
   * Prefetch the selected text when the selection settles (default true).
   * This is what makes the native copy path work: a `copy` event handler
   * must call `clipboardData.setData` synchronously — awaiting a page-text
   * read inside it is too late — and it also keeps the async path instant.
   * The fetch is one versioned, cached, permission-gated read per page;
   * pass false to make copying strictly on-demand.
   */
  prefetch?: boolean;
  /**
   * Whose keys and copies these are (default `document`, the whole page). An element takes
   * them only while focus is inside it, for a page with more than one viewer; a copy from the
   * browser's Edit menu included, which reaches the page's body when nothing is selected there.
   */
  target?: Document | HTMLElement;
  /**
   * Called when Ctrl/Cmd+C or a copy (Edit → Copy) meets a selection the user may not copy.
   * The browser's own copy is prevented either way; this is where to say so.
   */
  onRefused?: () => void;
}

const PREFETCH_DEBOUNCE_MS = 150;

/**
 * Wire clipboard copy for a selection. Two delivery paths, both fed by the
 * prefetched text:
 *
 *   - the native `copy` event (menu Edit→Copy, or ctrl/cmd+C while the page
 *     has a DOM selection): answered synchronously from the cache;
 *   - ctrl/cmd+C with no DOM selection (canvas-rendered viewers usually
 *     have none, and browsers don't dispatch `copy` then): a keydown
 *     fallback writes via the async Clipboard API inside the keystroke's
 *     user-activation window.
 *
 * A selection the user may not copy is never copied by either path, nor by
 * the browser: the key and the copy are prevented, and `onRefused` says so.
 * Keys and copies in a text field are the field's, and left alone. With an
 * element as `target`, only the keys and copies made while focus is inside it
 * are its own.
 *
 * Returns the unwire function. Mount once per document view (not per page).
 */
export function wireSelectionClipboard(
  selection: ClipboardSelectionSource,
  options: SelectionClipboardOptions = {},
): () => void {
  const target = options.target ?? document;
  // The document hears every copy, Edit → Copy's among them, which goes to the body when the
  // page has no DOM selection (the viewer draws its own); `isOurs` keeps the target's own.
  const doc = target.ownerDocument ?? (target as Document);
  const isOurs = (): boolean => target === doc || containsFocus(target as HTMLElement);
  const prefetch = options.prefetch ?? true;
  let cached: string | null = null;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const refresh = (): void => {
    cached = null;
    if (!prefetch || !selection.hasSelection() || !selection.canCopy()) return;
    const gen = ++generation;
    selection.readText().then(
      (text) => {
        if (gen === generation) cached = text;
      },
      () => {}, // denied / failed — the async path will surface it if used
    );
  };

  // Commit (gesture end) refreshes immediately; change (drag, programmatic
  // select) debounces so a drag doesn't fetch per pointer move.
  const offCommit = selection.onCommitted(() => {
    if (timer) clearTimeout(timer);
    timer = null;
    refresh();
  });
  const offChange = selection.onChanged(() => {
    generation++;
    cached = null;
    if (timer) clearTimeout(timer);
    timer = setTimeout(refresh, PREFETCH_DEBOUNCE_MS);
  });

  /** Whether there is a selection the user may not copy: the copy is then refused. */
  const isRefused = (): boolean => selection.hasSelection() && !selection.canCopy();
  const refuse = (event: Event): void => {
    event.preventDefault();
    options.onRefused?.();
  };

  // A copy or a key while focus is elsewhere is someone else's; one in a text field (the
  // search box, a comment) is the field's own.
  const onCopy = (event: ClipboardEvent): void => {
    if (!isOurs() || isFromTextField(event)) return;
    if (isRefused()) return refuse(event);
    if (cached == null || cached === '' || !selection.hasSelection()) return;
    event.clipboardData?.setData('text/plain', cached);
    event.preventDefault();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (
      !(event.metaKey || event.ctrlKey) ||
      event.key.toLowerCase() !== 'c' ||
      event.shiftKey ||
      event.altKey ||
      // A command shortcut for the same key took it already.
      event.defaultPrevented ||
      !isOurs() ||
      isFromTextField(event)
    ) {
      return;
    }
    // Preventing the key also keeps the browser from dispatching `copy` for it.
    if (isRefused()) return refuse(event);
    if (!selection.hasSelection() || !selection.canCopy()) return;
    // A live DOM selection means the browser will dispatch `copy` itself and
    // our synchronous handler answers — don't double-write.
    const dom = domSelectionOf(target);
    if (dom && !dom.isCollapsed) return;
    void copySelection(selection); // instant when prefetched; still inside user activation
  };

  doc.addEventListener('copy', onCopy);
  doc.addEventListener('keydown', onKeyDown);
  return () => {
    offCommit();
    offChange();
    if (timer) clearTimeout(timer);
    doc.removeEventListener('copy', onCopy);
    doc.removeEventListener('keydown', onKeyDown);
  };
}

/**
 * The DOM selection the browser copies from: the target's root's (its shadow root, where the
 * browser keeps one there, or its document), else its owner document's.
 */
function domSelectionOf(target: Document | HTMLElement): Selection | null {
  const root = target.getRootNode() as Partial<Pick<Document, 'getSelection'>>;
  if (typeof root.getSelection === 'function') return root.getSelection();
  return target.ownerDocument?.getSelection() ?? null;
}

/**
 * Toolbar/menu path: read the selected text and write it to the clipboard
 * via the async Clipboard API. Call from a user-gesture handler (browsers
 * require a secure context + user activation for clipboard writes). Resolves
 * with what was copied ('' when nothing was — nothing is written then, so an
 * empty selection never clobbers the user's clipboard).
 */
export async function copySelection(
  selection: Pick<ClipboardSelectionSource, 'readText'>,
): Promise<string> {
  const text = await selection.readText();
  if (text !== '') await navigator.clipboard.writeText(text);
  return text;
}
