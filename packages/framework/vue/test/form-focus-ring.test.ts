import { afterEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import FormFocusRing from '../src/form/FormFocusRing.vue';

enableAutoUnmount(afterEach);

describe('<FormFocusRing>', () => {
  it('paints an inert ring above the field’s picture, only while visible', async () => {
    const wrapper = mount(FormFocusRing, { props: { visible: false, color: '#3858e9' } });
    expect(wrapper.find('[data-embedpdf-form-focus-ring]').exists()).toBe(false);

    await wrapper.setProps({ visible: true, color: 'rgba(66, 133, 244, 0.8)' });
    const ring = wrapper.find('[data-embedpdf-form-focus-ring]');

    expect(ring.exists()).toBe(true);
    expect(ring.attributes('aria-hidden')).toBe('true');
    const style = (ring.element as HTMLElement).style;
    expect(style.position).toBe('absolute');
    expect(style.inset).toBe('0');
    expect(style.zIndex).toBe('1');
    expect(style.outline).toBe('rgba(66, 133, 244, 0.8) solid 2px');
    expect(style.outlineOffset).toBe('-2px');
    expect(style.pointerEvents).toBe('none');
  });
});
