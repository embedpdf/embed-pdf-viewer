/**
 * The page number and the page count: the `{ custom: 'page-number' }` item, in the `pager` bar
 * floating over the pages by default. While pages sit side by side (a spread), it names the first
 * and the last of them. The number is a button; pressing it turns it into a field, where Enter
 * goes to the page typed and Escape, or leaving the field, keeps the page. Without a document it
 * draws nothing.
 */
import { useT } from '@embedpdf/react/i18n';
import { useOptionalCapability, useOptionalSelector } from '@embedpdf/react/runtime';
import { StageToken, useStageState, type StageCapability } from '@embedpdf/react/stage';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import { useTooltip } from './tooltip';

/**
 * Stands in for the number while the sentence around it is translated, so it can split there:
 * a private-use character no language writes, spelled as an escape so no tool drops it.
 */
export const NUMBER_SLOT = '\uE000';

/** The first and last page, from 1, of what the Stage shows as one: a page, or a spread. */
interface ShownPages {
  readonly first: number;
  readonly last: number;
}

function shownPagesOf(stage: StageCapability): ShownPages | null {
  const numbers = stage.listCurrentItemPages().map((page) => page.index + 1);
  return numbers.length ? { first: Math.min(...numbers), last: Math.max(...numbers) } : null;
}

const sameShownPages = (left: ShownPages | null, right: ShownPages | null): boolean =>
  left?.first === right?.first && left?.last === right?.last;

export function PageNumber() {
  const t = useT();
  const stage = useOptionalCapability(StageToken);
  // The Stage cursor is a 0-based display index; people count from 1.
  const cursor = useStageState((state) => state.currentPageIndex + 1);
  const total = useStageState((state) => state.pageCount);
  const shown = useOptionalSelector(StageToken, shownPagesOf, null, sameShownPages);
  const spread = shown !== null && shown.last > shown.first;
  /** The number the button shows and the field starts from: a spread's first page. */
  const current = spread ? shown.first : cursor;
  /** What the field holds while it is open, or `null` while the number shows. */
  const [draft, setDraft] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  /** Whether the field closed from the keyboard, so focus goes back to the number. */
  const refocus = useRef(false);
  const editing = draft !== null;
  // The number is the button's name; the tooltip says what pressing it does.
  const tooltip = useTooltip({ label: t('pageNumber.goToPage') });
  const tooltipRef = tooltip.trigger.ref;
  const buttonRef = useCallback(
    (element: HTMLButtonElement | null) => {
      button.current = element;
      tooltipRef(element);
    },
    [tooltipRef],
  );

  // In the commit that swaps the field and the number, so focus is never left nowhere.
  useLayoutEffect(() => {
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
  const sentence = spread
    ? t('pageNumber.pages', { params: { first: NUMBER_SLOT, last: shown.last, total } })
    : t('pageNumber.page', { params: { current: NUMBER_SLOT, total } });
  const [before, after = ''] = sentence.split(NUMBER_SLOT);

  return (
    <span className="text-fg-secondary block whitespace-nowrap px-3.5 text-sm leading-7">
      {before}
      {editing ? (
        <input
          ref={field}
          type="text"
          inputMode="numeric"
          aria-label={t('pageNumber.goToPage')}
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
        <>
          <button
            {...tooltip.trigger}
            ref={buttonRef}
            type="button"
            onClick={() => setDraft(String(current))}
            className="hover:bg-hover hover:text-fg -mx-0.5 cursor-pointer rounded px-0.5 tabular-nums"
          >
            {current}
          </button>
          {tooltip.element}
        </>
      )}
      {after}
    </span>
  );
}
