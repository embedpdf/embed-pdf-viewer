import * as React from 'react';
import { useEffect, useRef, useState } from 'react';

export interface NativeListBoxOption {
  label: string;
  value: string;
}

export interface NativeListBoxProps {
  ariaLabel: string;
  disabled: boolean;
  multi: boolean;
  options: NativeListBoxOption[];
  selected: string[];
  onSelect(values: string[]): void | Promise<void>;
  onFocus?: React.FocusEventHandler<HTMLSelectElement>;
  onBlur?: React.FocusEventHandler<HTMLSelectElement>;
  style?: React.CSSProperties;
}

/**
 * A PDF list box needs one owner for pixels, hit-testing, and scrolling. A
 * baked /AP picture with an invisible native select cannot provide that: the
 * browser and PDF each keep an independent top-visible row. This visible
 * native control keeps a local optimistic selection while the engine write is
 * pending and synchronizes when engine truth changes, without remounting the
 * DOM node or resetting its scroll position.
 */
export function NativeListBox({
  ariaLabel,
  disabled,
  multi,
  options,
  selected,
  onSelect,
  onFocus,
  onBlur,
  style,
}: NativeListBoxProps) {
  const [draft, setDraft] = useState<string[]>(() => [...selected]);
  const controlRef = useRef<HTMLSelectElement>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const selectedSignature = JSON.stringify(selected);

  useEffect(() => {
    const control = controlRef.current;
    if (!control) return;
    // The Stage's ambient wheel handler lives on an ancestor and
    // preventDefault()s to pan/zoom the page. Stop at the list box so the
    // browser can apply the same wheel event to this control's own scroll box.
    const isolateWheel = (event: WheelEvent) => event.stopPropagation();
    control.addEventListener('wheel', isolateWheel);
    return () => control.removeEventListener('wheel', isolateWheel);
  }, []);

  useEffect(() => {
    setDraft([...selectedRef.current]);
  }, [selectedSignature]);

  const rollback = () => setDraft([...selectedRef.current]);
  const choose = (values: string[]) => {
    setDraft(values);
    try {
      const result = onSelect(values);
      if (result) void result.catch(rollback);
    } catch {
      rollback();
    }
  };

  return (
    <select
      ref={controlRef}
      aria-label={ariaLabel}
      multiple={multi}
      size={Math.max(2, options.length)}
      disabled={disabled}
      value={multi ? draft : (draft[0] ?? '')}
      onFocus={onFocus}
      onBlur={onBlur}
      onChange={(event) =>
        choose(Array.from(event.currentTarget.selectedOptions).map((option) => option.value))
      }
      style={style}
    >
      {options.map((option, index) => (
        <option key={index} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
