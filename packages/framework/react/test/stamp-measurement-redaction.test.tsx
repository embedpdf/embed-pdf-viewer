// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup } from '@testing-library/react';
import { annotationPlugin } from '../src/annotation';
import { interactionPlugin } from '../src/interaction';
import {
  MEASUREMENT_DEFAULTS,
  MeasurementToken,
  measurementPlugin,
  measurementState,
  useMeasurement,
  useMeasurementReadout,
  useMeasurementSettings,
  useMeasurementState,
  usePageScale,
} from '../src/measurement';
import {
  REDACTION_DEFAULTS,
  redactionPlugin,
  redactionState,
  usePendingRedactions,
  useRedaction,
  useRedactionSettings,
  useRedactionState,
} from '../src/redaction';
import { toPageRef } from '../src/runtime';
import {
  STAMP_DEFAULTS,
  StampToken,
  stampPlugin,
  stampState,
  useStamp,
  useStampSettings,
  useStampState,
} from '../src/stamp';
import { viewerWith } from './counter-plugin';

/**
 * The stamp, measurement and redaction hooks before any document opens: the
 * state hooks read their declared `empty`, the settings hooks the plugin's
 * settings, the per-page and per-mark hooks answer empty, and the stamp
 * capability, which belongs to the workspace, is there.
 */

const latest = (renders: unknown[]) => renders[renders.length - 1];

function Probe({ read, renders }: { read: () => unknown; renders: unknown[] }) {
  renders.push(read());
  return null;
}

const plugins = () => [
  interactionPlugin(),
  annotationPlugin(),
  stampPlugin(),
  measurementPlugin({ presets: [] }),
  redactionPlugin({ overlay: { fill: '#112233' } }),
];

afterEach(cleanup);

describe('without a document', () => {
  it('the state hooks read empty', async () => {
    const renders: unknown[] = [];
    await viewerWith(
      plugins(),
      <Probe
        read={() => [useStampState(), useMeasurementState(), useRedactionState()]}
        renders={renders}
      />,
    );
    expect(latest(renders)).toEqual([
      stampState.empty,
      measurementState.empty,
      redactionState.empty,
    ]);
  });

  it('a page scale, a readout and the pending marks answer empty', async () => {
    const renders: unknown[] = [];
    const ref = { kind: 'objectNumber' as const, page: toPageRef(1), objectNumber: 9 };
    await viewerWith(
      plugins(),
      <Probe
        read={() => [
          usePageScale(0),
          usePageScale(null),
          useMeasurementReadout(ref),
          usePendingRedactions(),
        ]}
        renders={renders}
      />,
    );
    expect(latest(renders)).toEqual([
      { measure: null, source: 'default', ready: false, persistent: false },
      null,
      { unavailable: 'not-dimension' },
      [],
    ]);
  });

  it('the settings hooks read the settings, and follow a change', async () => {
    const renders: unknown[] = [];
    const { kernel } = await viewerWith(
      plugins(),
      <Probe
        read={() => [
          useStampSettings((settings) => settings.previewWidth),
          useMeasurementSettings(),
          useRedactionSettings((settings) => settings.overlay.fill),
        ]}
        renders={renders}
      />,
    );
    expect(latest(renders)).toEqual([
      STAMP_DEFAULTS.previewWidth,
      { ...MEASUREMENT_DEFAULTS, presets: [] },
      '#112233',
    ]);
    expect(REDACTION_DEFAULTS.overlay.fill).toBe('#000000');

    act(() => kernel.settingsOf(StampToken).updateSettings({ previewWidth: 64 }));
    act(() => kernel.settingsOf(MeasurementToken).updateSettings({ defaultScale: 'imperial' }));
    expect(latest(renders)).toEqual([64, { defaultScale: 'imperial', presets: [] }, '#112233']);
  });

  it('the stamp capability is there; a document verb says no document is open', async () => {
    const seen: { stamp: unknown; measurement: unknown; redaction: unknown }[] = [];
    function Capabilities() {
      seen.push({ stamp: useStamp(), measurement: useMeasurement(), redaction: useRedaction() });
      return null;
    }
    const { kernel } = await viewerWith(plugins(), <Capabilities />);
    const { stamp, redaction } = seen[seen.length - 1] as {
      stamp: ReturnType<typeof useStamp>;
      redaction: ReturnType<typeof useRedaction>;
    };
    expect(stamp).toBe(kernel.capability(StampToken));
    expect(stamp.getArmedAsset()).toBeNull();
    expect(stamp.canPlace()).toBe(false);
    await expect(stamp.armAsset('any')).rejects.toMatchObject({ code: 'not-ready' });
    await expect(redaction.markPage(0)).rejects.toMatchObject({ code: 'not-ready' });
  });
});
