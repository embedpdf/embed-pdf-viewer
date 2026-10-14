import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import NativeListBox from '../../src/form/NativeListBox.svelte';
import type { NativeListBoxProps } from '../../src/form/props';

/**
 * The list box the form layer draws over a list field: one visible native control that keeps its
 * element (and so the user's scroll position) while a write is on its way, shows a choice at
 * once, puts the engine's selection back when the write fails, and scrolls itself on the wheel.
 */

const OPTIONS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
].map((value) => ({ label: value, value }));

const props = (changes: Partial<NativeListBoxProps> = {}): NativeListBoxProps => ({
  ariaLabel: 'Months',
  disabled: false,
  multi: false,
  options: OPTIONS,
  selected: ['December'],
  onSelect: () => {},
  ...changes,
});

describe('<NativeListBox>', () => {
  it('keeps the same visible, scrolled DOM control while an engine write is pending', async () => {
    let finishWrite!: () => void;
    const pendingWrite = new Promise<void>((resolve) => (finishWrite = resolve));
    const onSelect = vi.fn(() => pendingWrite);
    const view = render(NativeListBox, { props: props({ onSelect }) });
    const select = view.getByRole('listbox') as HTMLSelectElement;
    select.scrollTop = 141;

    await fireEvent.change(select, { target: { value: 'November' } });

    expect(onSelect).toHaveBeenCalledWith(['November']);
    expect(select.value).toBe('November');
    // Every row shows (happy-dom has no `size` property of its own; the attribute is there).
    expect(select.getAttribute('size')).toBe(String(OPTIONS.length));
    expect(select.style.opacity).toBe('');

    // The write starts: the field is disabled while the engine still says December. The
    // optimistic selection and the scroll position must not snap back.
    await view.rerender(props({ onSelect, disabled: true }));
    expect(view.getByRole('listbox')).toBe(select);
    expect(select.value).toBe('November');
    expect(select.scrollTop).toBe(141);

    // The write lands: November is the engine's too, with no new element and no scroll.
    await view.rerender(props({ onSelect, selected: ['November'] }));
    expect(view.getByRole('listbox')).toBe(select);
    expect(select.value).toBe('November');
    expect(select.scrollTop).toBe(141);
    finishWrite();
  });

  it('rolls an optimistic selection back when the engine rejects it', async () => {
    const onSelect = vi.fn(() => Promise.reject(new Error('write failed')));
    const view = render(NativeListBox, { props: props({ onSelect }) });
    const select = view.getByRole('listbox') as HTMLSelectElement;

    await fireEvent.change(select, { target: { value: 'October' } });

    expect(onSelect).toHaveBeenCalledWith(['October']);
    await waitFor(() => expect(select.value).toBe('December'));
  });

  it('commits all selected values for a multi-select list box', async () => {
    const onSelect = vi.fn();
    const view = render(NativeListBox, {
      props: props({ onSelect, multi: true, selected: ['September'] }),
    });
    const select = view.getByRole('listbox') as HTMLSelectElement;
    select.options[8]!.selected = true;
    select.options[10]!.selected = true;

    await fireEvent.change(select);

    expect(onSelect).toHaveBeenCalledWith(['September', 'November']);
    expect(Array.from(select.selectedOptions).map((option) => option.value)).toEqual([
      'September',
      'November',
    ]);
  });

  it('keeps wheel scrolling inside the list instead of bubbling to the Stage', async () => {
    const ancestorWheel = vi.fn();
    const view = render(NativeListBox, { props: props() });
    // The Stage listens natively on an ancestor of every page.
    view.container.addEventListener('wheel', ancestorWheel);

    await fireEvent.wheel(view.getByRole('listbox'), { deltaY: -120 });

    expect(ancestorWheel).not.toHaveBeenCalled();
  });
});
