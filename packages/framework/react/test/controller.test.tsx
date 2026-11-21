// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, waitFor } from '@testing-library/react';
import { useViewerController, type ViewerState } from '../src/controller';
import { bytesInput, counterPlugin, viewerWith } from './counter-plugin';

/**
 * `useViewerController()` against a real kernel: the snapshot follows the document as it opens,
 * and a render reads the same snapshot until something in it changes.
 */
afterEach(cleanup);

describe('useViewerController', () => {
  it('re-renders with the snapshot of the active document', async () => {
    const seen: ViewerState[] = [];
    function Probe() {
      const viewer = useViewerController();
      seen.push(viewer.state);
      return null;
    }
    const { kernel } = await viewerWith([counterPlugin], <Probe />);
    expect(seen.at(-1)!.status).toBe('empty');
    await act(() => kernel.documents.open(bytesInput('doc')));
    await waitFor(() =>
      expect(seen.at(-1)).toMatchObject({ status: 'ready', documentId: 'doc', pageCount: 1 }),
    );
  });
});
