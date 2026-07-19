import { useEffect } from 'react';
import { useCapability } from '@embedpdf-x/react/runtime';
import { AnnotationToken } from '@embedpdf-x/react/annotation';
import { usePendingRedactions, useRedaction } from '@embedpdf-x/react/redaction';
import { useSurface } from '@embedpdf-x/react/shell';
import { useT } from '@embedpdf-x/react/i18n';
import { Icon } from './icons';

/**
 * The pending-redactions review panel (right sidebar). The list is a LIVE view
 * over the annotation plane — deleting a mark here is deleting the annotation.
 * "Apply all" routes through the confirm modal: the apply is irreversible.
 */
export function RedactionPanel() {
  const t = useT();
  const redaction = useRedaction();
  const pending = usePendingRedactions();
  const anno = useCapability(AnnotationToken);
  const confirm = useSurface('redact-confirm');

  // The annotation plane loads lazily per page; pull every page in so the
  // panel shows marks on pages never scrolled to.
  useEffect(() => {
    void redaction.preparePending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {pending.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <Icon name="redactionSidebar" size={32} className="text-fg-muted" />
            <p className="text-fg-muted text-sm">{t('demo.redactionEmpty')}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {pending.map((item) => (
              <li key={item.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => anno.select(item.ref)}
                  onKeyDown={(e) => e.key === 'Enter' && anno.select(item.ref)}
                  className="hover:bg-hover group flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left"
                >
                  <Icon
                    name={item.kind === 'area' ? 'redactArea' : 'redact'}
                    size={16}
                    className="text-fg-muted shrink-0"
                  />
                  <span className="text-fg min-w-0 flex-1 truncate text-sm">
                    {item.overlayText ??
                      t(item.kind === 'area' ? 'demo.redactionArea' : 'demo.redactionText')}
                  </span>
                  <span className="text-fg-muted shrink-0 text-xs">
                    {t('demo.pageBadge', {
                      params: { page: item.pageIndex >= 0 ? String(item.pageIndex + 1) : '?' },
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void anno.delete(item.ref);
                    }}
                    className="text-fg-muted hover:text-fg grid h-6 w-6 shrink-0 place-items-center rounded opacity-0 group-hover:opacity-100"
                    title={t('demo.redactionRemove')}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-border-subtle flex shrink-0 gap-2 border-t p-3">
        <button
          type="button"
          disabled={pending.length === 0}
          onClick={() => {
            for (const item of pending) void anno.delete(item.ref);
          }}
          className="border-border text-fg hover:bg-hover flex-1 rounded-md border px-3 py-1.5 text-sm disabled:opacity-40"
        >
          {t('commands.redact.clearAll')}
        </button>
        <button
          type="button"
          disabled={pending.length === 0 || !redaction.canApply() || redaction.applying}
          onClick={() => confirm.open()}
          className="flex-1 rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-40"
        >
          {t('commands.redact.applyAll')}
        </button>
      </div>
    </div>
  );
}
