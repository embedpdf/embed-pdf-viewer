/**
 * The annotation flags section: a live test surface for `/F` (ISO 32000
 * Table 167). Select any annotation(s) and toggle flags. Flags are
 * properties like any other: the reads come from `useAnnotationProperties()`
 * (a flag the selection disagrees on is `mixed`, an indeterminate checkbox),
 * each named as the schema names it, and the writes go through
 * `selection.update({ locked: true })`. The hint under each is the viewer's.
 *
 * Things to try:
 *   - `locked`: the selection keeps its outline but loses handles/knob; move,
 *     restyle and delete are refused; unchecking it here still works.
 *   - `hidden` / `noView`: the annotation disappears (it stays selected, so
 *     this panel can bring it back).
 *   - `readOnly`: visible but no longer clickable — deselect and try.
 *   - `noZoom` / `noRotate`: zoom or rotate the page; the body keeps its
 *     screen size / stays upright, anchored at its top-left corner.
 *   - `print`: flip it off and print/flatten elsewhere — the annotation is
 *     excluded (viewer rendering is unaffected).
 */
import {
  useAnnotation,
  useAnnotationProperties,
  type AnnotationFlags,
} from '@embedpdf/react/annotation';
import { useT } from '@embedpdf/react/i18n';
import { useEffect, useRef } from 'react';

import { useLabel } from './labels';

/** What each flag does, in a few words under its name: the hint's key. */
const FLAG_HINTS: Readonly<Record<keyof AnnotationFlags, string>> = {
  print: 'annotationFlags.print',
  hidden: 'annotationFlags.hidden',
  noView: 'annotationFlags.noView',
  toggleNoView: 'annotationFlags.toggleNoView',
  readOnly: 'annotationFlags.readOnly',
  locked: 'annotationFlags.locked',
  lockedContents: 'annotationFlags.lockedContents',
  noZoom: 'annotationFlags.noZoom',
  noRotate: 'annotationFlags.noRotate',
  invisible: 'annotationFlags.invisible',
};

function FlagRow({
  label,
  hint,
  value,
  onToggle,
}: {
  label: string;
  hint: string;
  value: boolean | null;
  onToggle: (next: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // `null` = the selected annotations disagree → the native indeterminate state.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = value === null;
  }, [value]);
  return (
    <label className="hover:bg-hover flex cursor-pointer items-start gap-2.5 rounded px-1.5 py-1.5">
      <input
        ref={ref}
        type="checkbox"
        className="accent-accent mt-0.5"
        checked={value === true}
        onChange={() => onToggle(value !== true)}
      />
      <span className="min-w-0">
        <span className="text-fg block text-sm leading-tight">{label}</span>
        <span className="text-fg-muted block text-xs leading-tight">{hint}</span>
      </span>
    </label>
  );
}

/** The `/F` flags of the current selection, live-editable. Renders nothing
 *  when nothing is selected (the style panel shows its tool defaults then). */
export function AnnotationFlagsSection() {
  const t = useT();
  const label = useLabel();
  const annotation = useAnnotation();
  const { properties, values, mixed } = useAnnotationProperties();
  const flags = properties.filter((property) => property.control === 'flag');
  if (!flags.length) return null;
  const valueOf = (key: keyof AnnotationFlags): boolean | null =>
    mixed.includes(key) ? null : values[key] === true;
  return (
    <section className="border-border mt-2 border-t pt-4">
      <p className="text-fg-muted mb-2 text-[11px] font-semibold uppercase tracking-wide">
        {t('annotationFlags.title')}
      </p>
      <div className="flex flex-col">
        {flags.map((flag) => (
          <FlagRow
            key={flag.key}
            label={label(flag)}
            hint={t(FLAG_HINTS[flag.key])}
            value={valueOf(flag.key)}
            onToggle={(next) => void annotation.selection.update({ [flag.key]: next })}
          />
        ))}
      </div>
    </section>
  );
}
