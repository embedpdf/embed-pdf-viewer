/**
 * The config's `size` and `touch`, read into the layout's env: a size or a
 * touch it names takes the place of what the viewer measures, and anything
 * else measures, with a warning.
 */
import { describe, expect, it } from 'vitest';

import { envChoiceOf } from '../../../chrome/src/layout-root';

describe('envChoiceOf', () => {
  it('measures with nothing set, or auto', () => {
    expect(envChoiceOf(undefined, undefined)).toEqual({ size: null, touch: null, problems: [] });
    expect(envChoiceOf('auto', 'auto')).toEqual({ size: null, touch: null, problems: [] });
  });

  it('takes a size and a touch it names', () => {
    expect(envChoiceOf('compact', true)).toEqual({ size: 'compact', touch: true, problems: [] });
    expect(envChoiceOf('expanded', false)).toEqual({
      size: 'expanded',
      touch: false,
      problems: [],
    });
  });

  it('measures for anything else, and says why', () => {
    expect(envChoiceOf('phone', 'yes')).toEqual({
      size: null,
      touch: null,
      problems: [
        'size: "phone" is not auto, compact, medium or expanded; the viewer measures its width',
        'touch: "yes" is not auto, true or false; the viewer asks the browser',
      ],
    });
  });
});
