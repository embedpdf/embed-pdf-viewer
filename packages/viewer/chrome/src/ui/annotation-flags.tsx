/**
 * The annotation FLAGS section — a live test surface for `/F` (ISO 32000
 * Table 167). Select any annotation(s) and toggle flags; the writes go through
 * the plugin's `updateSelectionFlags` (optimistic, flags-only engine patch),
 * and the reads come from `useSelectionFlags` (per-flag value, `null` when the
 * selection disagrees → indeterminate checkbox).
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
import { useAnnotation, useSelectionFlags, type AnnotationFlags } from '@embedpdf/react/annotation';
import { useEffect, useRef } from 'react';

const FLAG_ROWS: { key: keyof AnnotationFlags; label: string; hint: string }[] = [
  { key: 'print', label: 'Print', hint: 'Include when the page is printed' },
  { key: 'hidden', label: 'Hidden', hint: 'Gone everywhere: screen, clicks, print' },
  { key: 'noView', label: 'No view', hint: 'Hidden on screen, may still print' },
  {
    key: 'toggleNoView',
    label: 'Toggle no view',
    hint: 'Reveal a no-view annotation while selected',
  },
  { key: 'readOnly', label: 'Read only', hint: 'Visible but not clickable' },
  { key: 'locked', label: 'Locked', hint: 'No move / resize / delete / restyle' },
  { key: 'lockedContents', label: 'Locked contents', hint: 'Text cannot change; geometry can' },
  { key: 'noZoom', label: 'No zoom', hint: 'Screen-constant size (anchored top-left)' },
  { key: 'noRotate', label: 'No rotate', hint: 'Stays upright when the page rotates' },
  { key: 'invisible', label: 'Invisible', hint: 'Legacy: hide unknown subtypes' },
];

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
  const annotation = useAnnotation();
  const flags = useSelectionFlags();
  if (!flags) return null;
  return (
    <section className="border-border mt-2 border-t pt-4">
      <p className="text-fg-muted mb-2 text-[11px] font-semibold uppercase tracking-wide">
        Flags (/F)
      </p>
      <div className="flex flex-col">
        {FLAG_ROWS.map((row) => (
          <FlagRow
            key={row.key}
            label={row.label}
            hint={row.hint}
            value={flags[row.key]}
            onToggle={(next) => annotation.updateSelectionFlags({ [row.key]: next })}
          />
        ))}
      </div>
    </section>
  );
}
