/**
 * An outline item's properties, which `outline:properties` opens for the selected item: its
 * title, the colour and style it is drawn in, whether it is open when the document opens, and
 * where it goes. Save writes what changed as one change; Escape or Cancel keeps the item as it
 * was. A target the viewer doesn't write (a script, another file, an app) shows, and stays.
 */
import { useT } from '@embedpdf/react/i18n';
import {
  OutlineToken,
  type OutlineCapability,
  type OutlineItem,
  type OutlineItemPatch,
} from '@embedpdf/react/outline';
import { useKernel, useOptionalCapability } from '@embedpdf/react/runtime';
import { useSurface } from '@embedpdf/react/shell';
import { useId, useState } from 'react';

import { Dialog } from './dialog';
import { OUTLINE_PROPERTIES_DIALOG } from '../config/outline';

/** The colours offered for a title, after "none": the viewer's own text colour. */
const SWATCHES = ['#000000', '#c92a2a', '#e8590c', '#2b8a3e', '#1864ab', '#6741d9', '#868e96'];

/** The standard page verbs a target can name. */
const PAGE_VERBS = ['NextPage', 'PrevPage', 'FirstPage', 'LastPage'] as const;
type PageVerb = (typeof PAGE_VERBS)[number];
const PAGE_VERB_KEYS: Record<PageVerb, string> = {
  NextPage: 'commands.page.next',
  PrevPage: 'commands.page.previous',
  FirstPage: 'commands.page.first',
  LastPage: 'commands.page.last',
};

type TargetChoice = 'none' | 'view' | 'page' | 'uri' | 'named' | 'kept';
type Fit = 'fit' | 'fitH' | 'kept';

export function OutlinePropertiesDialog() {
  const surface = useSurface(OUTLINE_PROPERTIES_DIALOG);
  const outline = useOptionalCapability(OutlineToken);
  const number = (surface.props as { item?: number }).item;
  const item =
    outline && number !== undefined
      ? outline.get({ kind: 'objectNumber', objectNumber: number })
      : null;
  if (!surface.isOpen || !outline || !item) return null;
  return (
    <PropertiesForm
      key={number}
      outline={outline}
      item={item}
      hasChildren={outline.getChildren(item.ref).length > 0}
      onClose={surface.close}
    />
  );
}

function PropertiesForm({
  outline,
  item,
  hasChildren,
  onClose,
}: {
  outline: OutlineCapability;
  item: OutlineItem;
  hasChildren: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const kernel = useKernel();
  const titleId = useId();
  const target = item.target;
  const pageIndexOf = (page: { kind: 'objectNumber'; objectNumber: number }) =>
    kernel.documents.getPage(page)?.index ?? 0;

  const [title, setTitle] = useState(item.title);
  const [color, setColor] = useState<string | null>(item.color);
  const [bold, setBold] = useState(item.bold);
  const [italic, setItalic] = useState(item.italic);
  const [open, setOpen] = useState(item.open);
  const [choice, setChoice] = useState<TargetChoice>(() => {
    if (!target) return 'none';
    if (target.kind === 'goto') return 'page';
    if (target.kind === 'uri') return 'uri';
    if (target.kind === 'named' && (PAGE_VERBS as readonly string[]).includes(target.name)) {
      return 'named';
    }
    return 'kept';
  });
  const [page, setPage] = useState(() =>
    String(target?.kind === 'goto' ? pageIndexOf(target.destination.page) + 1 : 1),
  );
  // A destination that is neither of the two fits (a spot on the page) is offered as it is.
  const initialFit: Fit =
    target?.kind === 'goto' &&
    (target.destination.kind === 'fit' || target.destination.kind === 'fitH')
      ? target.destination.kind
      : 'kept';
  const [fit, setFit] = useState<Fit>(initialFit);
  const [uri, setUri] = useState(target?.kind === 'uri' ? target.uri : '');
  const [verb, setVerb] = useState<PageVerb>(
    target?.kind === 'named' && (PAGE_VERBS as readonly string[]).includes(target.name)
      ? (target.name as PageVerb)
      : 'NextPage',
  );

  /** The target the form says, or `undefined` to leave the item's as it is. */
  const targetOf = (): OutlineItemPatch['target'] | undefined => {
    switch (choice) {
      case 'none':
        return target ? null : undefined;
      case 'view':
        return outline.getCurrentViewTarget() ?? undefined;
      case 'page': {
        const pageInfo = kernel.documents.getPage(Math.max(0, Number(page) - 1));
        if (!pageInfo) return undefined;
        // The page and fit the item already has keep the exact spot it goes to.
        if (
          target?.kind === 'goto' &&
          pageIndexOf(target.destination.page) === pageInfo.index &&
          fit === initialFit
        ) {
          return undefined;
        }
        return {
          kind: 'goto',
          destination:
            fit === 'fitH'
              ? { kind: 'fitH', page: pageInfo.ref, y: 0 }
              : { kind: 'fit', page: pageInfo.ref },
        };
      }
      case 'uri': {
        const trimmed = uri.trim();
        if (!trimmed || (target?.kind === 'uri' && target.uri === trimmed)) return undefined;
        return { kind: 'uri', uri: trimmed };
      }
      case 'named':
        return target?.kind === 'named' && target.name === verb
          ? undefined
          : { kind: 'named', name: verb };
      case 'kept':
        return undefined;
    }
  };

  const save = () => {
    const patch: OutlineItemPatch = {
      ...(title !== item.title ? { title } : {}),
      ...(color !== item.color ? { color } : {}),
      ...(bold !== item.bold ? { bold } : {}),
      ...(italic !== item.italic ? { italic } : {}),
      ...(hasChildren && open !== item.open ? { open } : {}),
    };
    const nextTarget = targetOf();
    if (nextTarget !== undefined) patch.target = nextTarget;
    if (Object.keys(patch).length > 0) void outline.update(item.ref, patch).catch(() => {});
    onClose();
  };

  const field =
    'border-border bg-surface text-fg focus:border-accent w-full rounded border px-2.5 py-1.5 text-sm outline-none';
  const label = 'text-fg-secondary mb-1 block text-xs font-medium';
  const check = 'text-fg-secondary flex items-center gap-2 text-sm';

  return (
    <Dialog
      labelledBy={titleId}
      onClose={onClose}
      className="border-border bg-surface w-96 max-w-[calc(100vw-2rem)] rounded-lg border p-4 shadow-xl"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        className="flex flex-col gap-3"
      >
        <h2 id={titleId} className="text-fg text-base font-semibold">
          {t('outline.properties.title')}
        </h2>

        <label>
          <span className={label}>{t('outline.properties.name')}</span>
          <input
            type="text"
            value={title}
            maxLength={32_767}
            onChange={(event) => setTitle(event.target.value)}
            className={field}
          />
        </label>

        <fieldset>
          <legend className={label}>{t('outline.properties.color')}</legend>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              aria-pressed={color === null}
              onClick={() => setColor(null)}
              className={`border-border text-fg rounded border px-2 py-0.5 text-xs ${
                color === null ? 'ring-accent ring-2' : ''
              }`}
            >
              {t('outline.properties.noColor')}
            </button>
            {SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={swatch}
                aria-pressed={color === swatch}
                onClick={() => setColor(swatch)}
                className={`border-border h-6 w-6 rounded-full border ${
                  color === swatch ? 'ring-accent ring-2 ring-offset-1' : ''
                }`}
                style={{ background: swatch }}
              />
            ))}
            <input
              type="color"
              aria-label={t('outline.properties.customColor')}
              value={color ?? '#000000'}
              onChange={(event) => setColor(event.target.value)}
              className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
            />
          </div>
        </fieldset>

        <div className="flex gap-4">
          <label className={check}>
            <input
              type="checkbox"
              checked={bold}
              onChange={(event) => setBold(event.target.checked)}
            />
            <span className="font-semibold">{t('outline.properties.bold')}</span>
          </label>
          <label className={check}>
            <input
              type="checkbox"
              checked={italic}
              onChange={(event) => setItalic(event.target.checked)}
            />
            <span className="italic">{t('outline.properties.italic')}</span>
          </label>
        </div>

        <label className={`${check} ${hasChildren ? '' : 'opacity-50'}`}>
          <input
            type="checkbox"
            disabled={!hasChildren}
            checked={hasChildren && open}
            onChange={(event) => setOpen(event.target.checked)}
          />
          {t('outline.properties.open')}
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className={label}>{t('outline.properties.target')}</legend>
          <select
            value={choice}
            onChange={(event) => setChoice(event.target.value as TargetChoice)}
            className={field}
          >
            <option value="none">{t('outline.properties.targetNone')}</option>
            <option value="view">{t('outline.properties.targetView')}</option>
            <option value="page">{t('linkEditor.page')}</option>
            <option value="uri">{t('linkEditor.url')}</option>
            <option value="named">{t('outline.properties.targetNamed')}</option>
            {choice === 'kept' && (
              <option value="kept">{t('outline.properties.targetKept')}</option>
            )}
          </select>
          {choice === 'page' && (
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={page}
                aria-label={t('linkEditor.pagePlaceholder')}
                onChange={(event) => setPage(event.target.value)}
                className={`${field} w-24`}
              />
              <select
                value={fit}
                aria-label={t('outline.properties.fit')}
                onChange={(event) => setFit(event.target.value as Fit)}
                className={field}
              >
                {initialFit === 'kept' && (
                  <option value="kept">{t('outline.properties.fitKept')}</option>
                )}
                <option value="fit">{t('commands.zoom.fitPage')}</option>
                <option value="fitH">{t('commands.zoom.fitWidth')}</option>
              </select>
            </div>
          )}
          {choice === 'uri' && (
            <input
              type="url"
              value={uri}
              placeholder={t('linkEditor.urlPlaceholder')}
              onChange={(event) => setUri(event.target.value)}
              className={field}
            />
          )}
          {choice === 'named' && (
            <select
              value={verb}
              aria-label={t('outline.properties.targetNamed')}
              onChange={(event) => setVerb(event.target.value as PageVerb)}
              className={field}
            >
              {PAGE_VERBS.map((name) => (
                <option key={name} value={name}>
                  {t(PAGE_VERB_KEYS[name])}
                </option>
              ))}
            </select>
          )}
          {choice === 'kept' && (
            <p className="text-fg-muted text-xs">{t('outline.properties.keptNote')}</p>
          )}
        </fieldset>

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="border-border text-fg hover:bg-hover rounded border px-3 py-1.5 text-sm"
          >
            {t('outline.properties.cancel')}
          </button>
          <button
            type="submit"
            className="bg-accent text-on-accent rounded px-3 py-1.5 text-sm font-medium"
          >
            {t('outline.properties.save')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
