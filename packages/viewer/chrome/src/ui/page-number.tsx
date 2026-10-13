/**
 * The page number and the page count: the `{ custom: 'page-number' }` item, in the `pager` bar
 * floating over the pages by default. The number is a button; pressing it turns it into a field,
 * where Enter goes to the page typed and Escape, or leaving the field, keeps the page. Without a
 * document it draws nothing.
 */
import { useT } from '@embedpdf/react/i18n';
import { useOptionalCapability } from '@embedpdf/react/runtime';
import { StageToken, useStageState } from '@embedpdf/react/stage';
import { useEffect, useRef, useState } from 'react';

/**
 * Stands in for the number while the sentence around it is translated, so it can split there:
 * a private-use character no language writes, spelled as an escape so no tool drops it.
 */
export const NUMBER_SLOT = '\uE000';

export function PageNumber() {
  const t = useT();
  const stage = useOptionalCapability(StageToken);
  // The Stage cursor is a 0-based display index; people count from 1.
  const current = useStageState((state) => state.currentPageIndex + 1);
  const total = useStageState((state) => state.pageCount);
  /** What the field holds while it is open, or `null` while the number shows. */
  const [draft, setDraft] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  /** Whether the field closed from the keyboard, so focus goes back to the number. */
  const refocus = useRef(false);
  const editing = draft !== null;

  useEffect(() => {
    if (editing) {
      field.current?.focus();
      field.current?.select();
    } else if (refocus.current) {
      refocus.current = false;
      button.current?.focus();
    }
  }, [editing]);

  if (!total) return null;

  /** Closes the field from the keyboard: focus goes back to the number. */
  const close = () => {
    refocus.current = true;
    setDraft(null);
  };
  const go = () => {
    const page = Number.parseInt(draft ?? '', 10);
    if (Number.isFinite(page)) stage?.goToPage(Math.min(Math.max(page, 1), total) - 1);
    close();
  };
  const [before, after = ''] = t('demo.page', {
    params: { current: NUMBER_SLOT, total },
  }).split(NUMBER_SLOT);

  return (
    <span className="text-fg-secondary block whitespace-nowrap px-3.5 text-sm leading-7">
      {before}
      {editing ? (
        <input
          ref={field}
          type="text"
          inputMode="numeric"
          aria-label={t('demo.goToPage')}
          value={draft}
          onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ''))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              go();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              close();
            }
          }}
          // Leaving the field keeps the page; removing the field after Enter or Escape blurs it
          // too, and must not cancel the focus going back to the number.
          onBlur={() => setDraft(null)}
          // Room for the longest number, and one more digit's worth for the caret.
          style={{ width: `${String(total).length + 1}ch` }}
          className="bg-hover ring-accent text-fg rounded text-center tabular-nums outline-none ring-1"
        />
      ) : (
        <button
          ref={button}
          type="button"
          title={t('demo.goToPage')}
          onClick={() => setDraft(String(current))}
          className="hover:bg-hover hover:text-fg -mx-0.5 cursor-pointer rounded px-0.5 tabular-nums"
        >
          {current}
        </button>
      )}
      {after}
    </span>
  );
}
