/**
 * The Go to Page dialog, which `page:go-to` opens when it has no page to go to: the page's
 * number, typed. Enter or Go goes there (past either end is that end); Escape or Cancel keeps
 * the page.
 */
import { useT } from '@embedpdf/react/i18n';
import { useOptionalCapability } from '@embedpdf/react/runtime';
import { useSurface } from '@embedpdf/react/shell';
import { StageToken, useStageState } from '@embedpdf/react/stage';
import { useId, useState } from 'react';

import { GO_TO_PAGE_DIALOG } from '../config/commands';
import { Dialog } from './dialog';
import { NUMBER_SLOT } from './page-number';

export function GoToPageDialog() {
  const surface = useSurface(GO_TO_PAGE_DIALOG);
  return surface.isOpen ? <GoToPageForm onClose={surface.close} /> : null;
}

function GoToPageForm({ onClose }: { onClose: () => void }) {
  const t = useT();
  const titleId = useId();
  const stage = useOptionalCapability(StageToken);
  // The Stage cursor is a 0-based display index; people count from 1.
  const current = useStageState((state) => state.currentPageIndex + 1);
  const total = useStageState((state) => state.pageCount);
  const [draft, setDraft] = useState(() => String(current));

  const go = () => {
    const page = Number.parseInt(draft, 10);
    if (Number.isFinite(page) && total > 0) {
      stage?.goToPage(Math.min(Math.max(page, 1), total) - 1);
    }
    onClose();
  };
  const [before, after = ''] = t('demo.page', {
    params: { current: NUMBER_SLOT, total },
  }).split(NUMBER_SLOT);

  return (
    <Dialog
      labelledBy={titleId}
      onClose={onClose}
      className="border-border bg-surface w-80 rounded-lg border p-4 shadow-xl"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          go();
        }}
      >
        <h2 id={titleId} className="text-fg text-base font-semibold">
          {t('commands.page.goTo')}
        </h2>
        <label className="text-fg-secondary mt-3 flex items-center gap-2 text-sm">
          {before}
          <input
            type="text"
            inputMode="numeric"
            aria-label={t('demo.goToPage')}
            value={draft}
            onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ''))}
            onFocus={(event) => event.currentTarget.select()}
            // Room for the longest number, and one more digit's worth for the caret.
            style={{ width: `${String(total).length + 2}ch` }}
            className="border-border bg-surface text-fg focus:border-accent focus:ring-accent rounded-md border px-1.5 py-1 text-center tabular-nums outline-none focus:ring-1"
          />
          {after}
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="border-border text-fg hover:bg-hover rounded-md border px-3 py-1.5 text-sm"
          >
            {t('demo.cancel')}
          </button>
          <button
            type="submit"
            className="bg-accent text-on-accent hover:bg-accent-hover rounded-md px-3 py-1.5 text-sm"
          >
            {t('goToPage.go')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
