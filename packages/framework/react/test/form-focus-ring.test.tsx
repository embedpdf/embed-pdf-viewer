// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { FormFocusRing } from '../src/form-focus-ring';

afterEach(cleanup);

describe('<FormFocusRing>', () => {
  it('renders an inert focus indicator above the widget appearance', () => {
    const view = render(<FormFocusRing visible={false} />);

    expect(view.container.firstElementChild).toBeNull();

    view.rerender(<FormFocusRing visible />);
    const ring = view.container.querySelector('[data-embedpdf-form-focus-ring]');

    expect(ring).not.toBeNull();
    expect(ring!.getAttribute('aria-hidden')).toBe('true');
    const style = (ring as HTMLElement).style;
    expect(style.position).toBe('absolute');
    expect(style.inset).toBe('0');
    expect(style.zIndex).toBe('1');
    expect(style.outline).toBe('rgba(66, 133, 244, 0.8) solid 2px');
    expect(style.outlineOffset).toBe('-2px');
    expect(style.pointerEvents).toBe('none');
  });
});
