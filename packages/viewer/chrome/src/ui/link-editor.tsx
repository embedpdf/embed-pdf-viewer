/**
 * The link editor POPOVER — v2's "add a link" popup, reborn. It rides the
 * SAME selection anchor as the action strip (`<AnnotationMenu>` solves
 * WHERE), opening from the strip's link icon (`annotation:link` toggles the
 * `link-editor` shell surface) and rendering IN PLACE of the strip while
 * open — one anchored card at a time.
 *
 * Reads the selection's current target from selection props (the `linkOf`
 * lens — parents derive from their committed child annotations) and writes
 * through the ONE `updateSelection({ link })` path; the plugin's reconciler
 * materializes/retargets the attached children. Links are a VERB on the
 * selection, not a style — which is why this is a popover, not a sidebar
 * section.
 */
import { useState, type ReactNode } from 'react';
import { useAnnotation, useSelectionProps } from '@embedpdf/react/annotation';
import type { PdfLinkTarget } from '@embedpdf/react/link';
import { useKernel } from '@embedpdf/react/runtime';
import { useT } from '@embedpdf/react/i18n';
import { Icon } from './icons';

function ModeToggle({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-accent bg-accent text-on-accent'
          : 'border-border bg-surface text-fg hover:bg-hover'
      }`}
    >
      {children}
    </button>
  );
}

export function LinkEditorCard({ onClose }: { onClose: () => void }) {
  const t = useT();
  const kernel = useKernel();
  const anno = useAnnotation();
  const props = useSelectionProps();
  const value = (props.values.link ?? null) as PdfLinkTarget | null;
  const [mode, setMode] = useState<'uri' | 'page'>(value?.kind === 'goto' ? 'page' : 'uri');
  const [uri, setUri] = useState(value?.kind === 'uri' ? value.uri : '');
  const [pageNo, setPageNo] = useState('1');

  const apply = () => {
    if (mode === 'uri') {
      const trimmed = uri.trim();
      if (!trimmed) return;
      anno.updateSelection({ link: { kind: 'uri', uri: trimmed } });
      onClose();
      return;
    }
    // Page number (1-based) → the page's OBJECT NUMBER (stable across moves).
    const activeId = kernel.documents.activeId();
    const meta = activeId ? kernel.getState().core.documents[activeId] : null;
    const layout = meta?.pages[Math.max(0, Number(pageNo) - 1)];
    if (!layout) return;
    anno.updateSelection({
      link: { kind: 'goto', destination: { kind: 'fit', pageObjectNumber: layout.pageObjectNumber } },
    });
    onClose();
  };

  const inputCls =
    'border-border bg-surface text-fg focus:border-accent w-full rounded border px-2.5 py-1.5 text-sm outline-none';
  return (
    <div className="border-border bg-surface w-64 rounded-lg border p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-fg text-sm font-semibold">{t('commands.annotate.link')}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-fg-muted hover:bg-hover grid h-6 w-6 place-items-center rounded"
        >
          <Icon name="x" size={14} />
        </button>
      </div>
      <div className="mb-2 flex gap-1.5">
        <ModeToggle title="Link to a URL" active={mode === 'uri'} onClick={() => setMode('uri')}>
          URL
        </ModeToggle>
        <ModeToggle title="Link to a page" active={mode === 'page'} onClick={() => setMode('page')}>
          Page
        </ModeToggle>
      </div>
      {mode === 'uri' ? (
        <input
          type="url"
          className={inputCls}
          placeholder="https://…"
          autoFocus
          value={uri}
          onChange={(e) => setUri(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
        />
      ) : (
        <input
          type="number"
          min={1}
          className={inputCls}
          placeholder="Page number"
          autoFocus
          value={pageNo}
          onChange={(e) => setPageNo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
        />
      )}
      <button
        type="button"
        className="bg-accent text-on-accent mt-2.5 w-full rounded px-2 py-1.5 text-sm font-medium"
        onClick={apply}
      >
        {value == null ? 'Add link' : 'Update link'}
      </button>
    </div>
  );
}
