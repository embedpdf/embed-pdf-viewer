/**
 * Clipboard wiring for text selection — the environmental half of copy.
 *
 * The selection plugin is deliberately DOM-free: its public capability ends
 * at `readText()` (data). Everything that touches `navigator.clipboard` or
 * the native `copy` event lives HERE, structurally typed so this module
 * stays a pure DOM utility with no EmbedPDF dependencies (the selection
 * capability satisfies {@link ClipboardSelectionSource} as-is).
 */

/** The slice of the selection capability clipboard wiring needs. */
export interface ClipboardSelectionSource {
  hasSelection(): boolean;
  canCopy(): boolean;
  readText(): Promise<string>;
  onChange(cb: () => void): () => void;
  onCommit(cb: () => void): () => void;
}

export interface SelectionClipboardOptions {
  /**
   * Prefetch the selected text when the selection settles (default true).
   * This is what makes the NATIVE copy path work: a `copy` event handler
   * must call `clipboardData.setData` synchronously — awaiting a page-text
   * read inside it is too late — and it also keeps the async path instant.
   * The fetch is one versioned, cached, permission-gated read per page;
   * pass false to make copying strictly on-demand.
   */
  prefetch?: boolean;
  /** Event target to listen on. Defaults to `document`. */
  target?: Document;
}

const PREFETCH_DEBOUNCE_MS = 150;

/**
 * Wire clipboard copy for a selection. Two delivery paths, both fed by the
 * prefetched text:
 *
 *   - the native `copy` event (menu Edit→Copy, or ctrl/cmd+C while the page
 *     has a DOM selection or focused editable — e.g. the viewer shell's
 *     focus sink): answered SYNCHRONOUSLY from the cache;
 *   - ctrl/cmd+C with no DOM selection (canvas-rendered viewers usually
 *     have none, and browsers don't dispatch `copy` then): a keydown
 *     fallback writes via the async Clipboard API inside the keystroke's
 *     user-activation window.
 *
 * Returns the unwire function. Mount once per document view (not per page).
 */
export function wireSelectionClipboard(
  selection: ClipboardSelectionSource,
  options: SelectionClipboardOptions = {},
): () => void {
  const target = options.target ?? document;
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
  const offCommit = selection.onCommit(() => {
    if (timer) clearTimeout(timer);
    timer = null;
    refresh();
  });
  const offChange = selection.onChange(() => {
    generation++;
    cached = null;
    if (timer) clearTimeout(timer);
    timer = setTimeout(refresh, PREFETCH_DEBOUNCE_MS);
  });

  const onCopy = (e: ClipboardEvent): void => {
    if (cached == null || cached === '' || !selection.hasSelection()) return;
    e.clipboardData?.setData('text/plain', cached);
    e.preventDefault();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'c' || e.shiftKey || e.altKey) {
      return;
    }
    if (!selection.hasSelection() || !selection.canCopy()) return;
    // A live DOM selection means the browser will dispatch `copy` itself and
    // our synchronous handler answers — don't double-write.
    const dom = target.getSelection?.();
    if (dom && !dom.isCollapsed) return;
    void copySelection(selection); // instant when prefetched; still inside user activation
  };

  target.addEventListener('copy', onCopy);
  target.addEventListener('keydown', onKeyDown);
  return () => {
    offCommit();
    offChange();
    if (timer) clearTimeout(timer);
    target.removeEventListener('copy', onCopy);
    target.removeEventListener('keydown', onKeyDown);
  };
}

/**
 * Toolbar/menu path: read the selected text and write it to the clipboard
 * via the async Clipboard API. Call from a user-gesture handler (browsers
 * require a secure context + user activation for clipboard writes). Resolves
 * with what was copied ('' when nothing was — nothing is written then, so an
 * empty selection never clobbers the user's clipboard).
 */
export async function copySelection(selection: ClipboardSelectionSource): Promise<string> {
  const text = await selection.readText();
  if (text !== '') await navigator.clipboard.writeText(text);
  return text;
}
