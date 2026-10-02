/**
 * Two parts of the form layer on their own, without a viewer: the list box, which keeps the
 * same scrolled `<select>` while a choice is written and shows the choice at once (and the
 * engine's selection again when the write fails), and the focus ring painted above a field.
 */
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormFocusRing } from '../form/src/controls';
import { FormListBox } from '../form/src/list-box';

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

/** A list box whose inputs the test changes, as the form layer would. */
@Component({
  selector: 'test-list',
  imports: [FormListBox],
  template: `
    <div class="ancestor" (wheel)="ancestorWheels = ancestorWheels + 1">
      <select
        epdfFormListBox
        label="Months"
        [disabled]="disabled()"
        [multi]="multi()"
        [options]="options"
        [selected]="selected()"
        [write]="write"
      ></select>
    </div>
  `,
})
class TestList {
  readonly options = OPTIONS;
  readonly disabled = signal(false);
  readonly multi = signal(false);
  readonly selected = signal<readonly string[]>(['December']);
  write: (values: string[]) => void | Promise<unknown> = () => undefined;
  ancestorWheels = 0;
}

async function mountList(
  setUp: (list: TestList) => void,
): Promise<{ fixture: ComponentFixture<TestList>; select: HTMLSelectElement }> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(TestList);
  setUp(fixture.componentInstance);
  await fixture.whenStable();
  const select = (fixture.nativeElement as HTMLElement).querySelector('select')!;
  return { fixture, select };
}

/** Choose `value` the way a click does: the browser selects it, then fires `change`. */
function choose(select: HTMLSelectElement, value: string) {
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

afterEach(() => TestBed.resetTestingModule());

describe('the form layer’s list box', () => {
  it('keeps the same visible, scrolled control while an engine write is pending', async () => {
    let finishWrite!: () => void;
    const pendingWrite = new Promise<void>((resolve) => (finishWrite = resolve));
    const write = vi.fn(() => pendingWrite);
    const { fixture, select } = await mountList((list) => (list.write = write));
    select.scrollTop = 141;

    choose(select, 'November');
    await fixture.whenStable();

    expect(write).toHaveBeenCalledWith(['November']);
    expect(select.value).toBe('November');
    expect(select.getAttribute('size')).toBe(String(OPTIONS.length));
    expect(select.style.opacity).toBe('');

    // The write starts: the field is disabled while the engine still says December. The
    // choice and the scroll position must not snap back.
    fixture.componentInstance.disabled.set(true);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('select')).toBe(select);
    expect(select.value).toBe('November');
    expect(select.scrollTop).toBe(141);

    // The write lands: November is the engine's too, with no new control and the same scroll.
    fixture.componentInstance.disabled.set(false);
    fixture.componentInstance.selected.set(['November']);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('select')).toBe(select);
    expect(select.value).toBe('November');
    expect(select.scrollTop).toBe(141);
    finishWrite();
  });

  it('puts the engine’s selection back when the write fails', async () => {
    const write = vi.fn(() => Promise.reject(new Error('write failed')));
    const { fixture, select } = await mountList((list) => (list.write = write));

    choose(select, 'October');

    expect(write).toHaveBeenCalledWith(['October']);
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(select.value).toBe('December');
    });
  });

  it('writes every selected value of a list that takes several', async () => {
    const write = vi.fn();
    const { fixture, select } = await mountList((list) => {
      list.write = write;
      list.multi.set(true);
      list.selected.set(['September']);
    });
    select.options[8]!.selected = true;
    select.options[10]!.selected = true;

    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(write).toHaveBeenCalledWith(['September', 'November']);
    expect(Array.from(select.selectedOptions, (option) => option.value)).toEqual([
      'September',
      'November',
    ]);
  });

  it('keeps the wheel in the list instead of letting it reach the Stage', async () => {
    const { fixture, select } = await mountList(() => {});

    select.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true }));

    expect(fixture.componentInstance.ancestorWheels).toBe(0);
  });
});

@Component({
  selector: 'test-ring',
  imports: [FormFocusRing],
  template: `
    @if (visible()) {
      <span epdfFormFocusRing [color]="color()"></span>
    }
  `,
})
class TestRing {
  readonly visible = signal(false);
  readonly color = signal('#3858e9');
}

describe('the form layer’s focus ring', () => {
  it('paints an inert ring above the field’s picture while the field has the focus', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(TestRing);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-embedpdf-form-focus-ring]')).toBeNull();

    fixture.componentInstance.visible.set(true);
    fixture.componentInstance.color.set('rgba(66, 133, 244, 0.8)');
    await fixture.whenStable();
    const ring = root.querySelector<HTMLElement>('[data-embedpdf-form-focus-ring]');

    expect(ring).not.toBeNull();
    expect(ring!.getAttribute('aria-hidden')).toBe('true');
    expect(ring!.style.position).toBe('absolute');
    // Set as a style property, as React and Vue set it (happy-dom keeps it only as that property).
    expect(ring!.style.inset).toBe('0');
    expect(ring!.style.zIndex).toBe('1');
    expect(ring!.style.outline).toBe('rgba(66, 133, 244, 0.8) solid 2px');
    expect(ring!.style.outlineOffset).toBe('-2px');
    expect(ring!.style.pointerEvents).toBe('none');
  });
});
