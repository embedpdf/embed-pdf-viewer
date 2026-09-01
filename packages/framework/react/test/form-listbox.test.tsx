// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { NativeListBox } from '../src/form-listbox';

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

afterEach(cleanup);

describe('<NativeListBox>', () => {
  it('keeps the same visible, scrolled DOM control while an engine write is pending', () => {
    let finishWrite!: () => void;
    const pendingWrite = new Promise<void>((resolve) => (finishWrite = resolve));
    const onSelect = vi.fn(() => pendingWrite);
    const view = render(
      <NativeListBox
        ariaLabel="Months"
        disabled={false}
        multi={false}
        options={OPTIONS}
        selected={['December']}
        onSelect={onSelect}
      />,
    );
    const select = screen.getByRole('listbox') as HTMLSelectElement;
    select.scrollTop = 141;

    fireEvent.change(select, { target: { value: 'November' } });

    expect(onSelect).toHaveBeenCalledWith(['November']);
    expect(select.value).toBe('November');
    expect(select.size).toBe(OPTIONS.length);
    expect(select.style.opacity).toBe('');

    // writeStart disables the field while engine truth still says December.
    // The optimistic selection and scroll window must not snap back.
    view.rerender(
      <NativeListBox
        ariaLabel="Months"
        disabled
        multi={false}
        options={OPTIONS}
        selected={['December']}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByRole('listbox')).toBe(select);
    expect(select.value).toBe('November');
    expect(select.scrollTop).toBe(141);

    // writeDone adopts November without remounting or moving the scroll box.
    view.rerender(
      <NativeListBox
        ariaLabel="Months"
        disabled={false}
        multi={false}
        options={OPTIONS}
        selected={['November']}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByRole('listbox')).toBe(select);
    expect(select.value).toBe('November');
    expect(select.scrollTop).toBe(141);
    finishWrite();
  });

  it('rolls an optimistic selection back when the engine rejects it', async () => {
    const onSelect = vi.fn(() => Promise.reject(new Error('write failed')));
    render(
      <NativeListBox
        ariaLabel="Months"
        disabled={false}
        multi={false}
        options={OPTIONS}
        selected={['December']}
        onSelect={onSelect}
      />,
    );
    const select = screen.getByRole('listbox') as HTMLSelectElement;

    fireEvent.change(select, { target: { value: 'October' } });

    expect(onSelect).toHaveBeenCalledWith(['October']);
    await waitFor(() => expect(select.value).toBe('December'));
  });

  it('commits all selected values for a multi-select list box', () => {
    const onSelect = vi.fn();
    render(
      <NativeListBox
        ariaLabel="Months"
        disabled={false}
        multi
        options={OPTIONS}
        selected={['September']}
        onSelect={onSelect}
      />,
    );
    const select = screen.getByRole('listbox') as HTMLSelectElement;
    select.options[8]!.selected = true;
    select.options[10]!.selected = true;

    fireEvent.change(select);

    expect(onSelect).toHaveBeenCalledWith(['September', 'November']);
    expect(Array.from(select.selectedOptions).map((option) => option.value)).toEqual([
      'September',
      'November',
    ]);
  });

  it('keeps wheel scrolling inside the list instead of bubbling to the Stage', () => {
    const ancestorWheel = vi.fn();
    render(
      <div onWheel={ancestorWheel}>
        <NativeListBox
          ariaLabel="Months"
          disabled={false}
          multi={false}
          options={OPTIONS}
          selected={['December']}
          onSelect={() => {}}
        />
      </div>,
    );

    fireEvent.wheel(screen.getByRole('listbox'), { deltaY: -120 });

    expect(ancestorWheel).not.toHaveBeenCalled();
  });
});
