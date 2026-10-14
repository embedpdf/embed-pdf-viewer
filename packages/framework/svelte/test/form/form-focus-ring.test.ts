import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import FormFocusRing from '../../src/form/FormFocusRing.svelte';

/** The focus ring paints above the field's picture and control, and never takes the pointer. */
describe('<FormFocusRing>', () => {
  it('renders an inert focus indicator above the widget appearance', async () => {
    const view = render(FormFocusRing, { props: { visible: false, color: '#3858e9' } });

    expect(view.container.querySelector('[data-embedpdf-form-focus-ring]')).toBeNull();

    await view.rerender({ visible: true, color: 'rgba(66, 133, 244, 0.8)' });
    const ring = view.container.querySelector<HTMLElement>('[data-embedpdf-form-focus-ring]');

    expect(ring).not.toBeNull();
    expect(ring!.getAttribute('aria-hidden')).toBe('true');
    const style = ring!.style;
    expect(style.position).toBe('absolute');
    // happy-dom has no `inset` property of its own; the declaration is there.
    expect(style.getPropertyValue('inset')).toBe('0');
    expect(style.zIndex).toBe('1');
    expect(style.outline).toBe('rgba(66, 133, 244, 0.8) solid 2px');
    expect(style.outlineOffset).toBe('-2px');
    expect(style.pointerEvents).toBe('none');
  });
});
