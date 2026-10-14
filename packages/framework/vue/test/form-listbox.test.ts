import { h, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import NativeListBox from '../src/form/NativeListBox.vue';

/**
 * The form layer's list box: one visible native <select> that is never made
 * again, so its scroll position stays the user's while a write is on its way,
 * and a choice the engine refuses is put back.
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

const props = (overrides: Record<string, unknown> = {}) => ({
  label: 'Months',
  disabled: false,
  multi: false,
  options: OPTIONS,
  selected: ['December'],
  onSelect: () => {},
  ...overrides,
});

/** Pick `value` the way the browser does, and tell the control. */
function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

enableAutoUnmount(afterEach);

describe('<NativeListBox>', () => {
  it('keeps the same visible, scrolled control while an engine write is on its way', async () => {
    let finishWrite!: () => void;
    const pendingWrite = new Promise<void>((resolve) => (finishWrite = resolve));
    const onSelect = vi.fn(() => pendingWrite);
    const wrapper = mount(NativeListBox, { props: props({ onSelect }) });
    const select = wrapper.element as HTMLSelectElement;
    select.scrollTop = 141;

    choose(select, 'November');
    await wrapper.vm.$nextTick();

    expect(onSelect).toHaveBeenCalledWith(['November']);
    expect(select.value).toBe('November');
    // Every row shows (happy-dom has no `size` property, only the attribute).
    expect(select.getAttribute('size')).toBe(String(OPTIONS.length));
    expect(select.style.opacity).toBe('');

    // The write disables the field while the engine still says December: the
    // choice and the scroll window stay.
    await wrapper.setProps({ disabled: true, selected: ['December'] });
    expect(wrapper.element).toBe(select);
    expect(select.value).toBe('November');
    expect(select.scrollTop).toBe(141);

    // The write lands: the control takes November without being made again.
    await wrapper.setProps({ disabled: false, selected: ['November'] });
    expect(wrapper.element).toBe(select);
    expect(select.value).toBe('November');
    expect(select.scrollTop).toBe(141);
    finishWrite();
  });

  it('puts the engine’s selection back when it refuses a choice', async () => {
    const onSelect = vi.fn(() => Promise.reject(new Error('write failed')));
    const wrapper = mount(NativeListBox, { props: props({ onSelect }) });
    const select = wrapper.element as HTMLSelectElement;

    choose(select, 'October');

    expect(onSelect).toHaveBeenCalledWith(['October']);
    await vi.waitFor(() => expect(select.value).toBe('December'));
  });

  it('puts it back when the write throws before Vue renders again', async () => {
    const wrapper = mount(NativeListBox, {
      props: props({
        onSelect: () => {
          throw new Error('refused');
        },
      }),
    });
    const select = wrapper.element as HTMLSelectElement;

    choose(select, 'October');
    await wrapper.vm.$nextTick();

    expect(select.value).toBe('December');
  });

  it('writes every selected value of a list that takes several', () => {
    const onSelect = vi.fn();
    const wrapper = mount(NativeListBox, {
      props: props({ multi: true, selected: ['September'], onSelect }),
    });
    const select = wrapper.element as HTMLSelectElement;
    select.options[8]!.selected = true;
    select.options[10]!.selected = true;

    select.dispatchEvent(new Event('change'));

    expect(onSelect).toHaveBeenCalledWith(['September', 'November']);
    expect(Array.from(select.selectedOptions).map((option) => option.value)).toEqual([
      'September',
      'November',
    ]);
  });

  it('keeps the wheel inside the list instead of letting it reach the Stage', async () => {
    const ancestorWheel = vi.fn();
    const wrapper = mount(() => h('div', { onWheel: ancestorWheel }, h(NativeListBox, props())));
    // The list attaches its listener once its element is there.
    await nextTick();

    wrapper
      .find('select')
      .element.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true }));

    expect(ancestorWheel).not.toHaveBeenCalled();
  });
});
