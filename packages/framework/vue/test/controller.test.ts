import { h } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import { useViewerController, type ViewerControllerRef } from '../src/controller';
import { bytesInput, counterPlugin, probe, settle, viewerWith } from './counter-plugin';

/**
 * `useViewerController()` against a real kernel: its `state` ref follows the document as it
 * opens, the commands are the controller's, and it stops listening with the component.
 */
enableAutoUnmount(afterEach);

describe('useViewerController', () => {
  it('follows the active document in a ref', async () => {
    let found: ViewerControllerRef | null = null;
    const Probe = probe(() => {
      found = useViewerController();
    });
    const { kernel, wrapper } = await viewerWith([counterPlugin], () => h(Probe));
    const viewer = found as unknown as ViewerControllerRef;
    expect(viewer.state.value.status).toBe('empty');

    await kernel.documents.open(bytesInput('doc'));
    await settle();
    expect(viewer.state.value).toMatchObject({ status: 'ready', documentId: 'doc', pageCount: 1 });
    // Without a stage, page commands do nothing instead of throwing.
    expect(() => viewer.nextPage()).not.toThrow();

    const last = viewer.state.value;
    wrapper.unmount();
    await kernel.documents.close('doc');
    expect(viewer.state.value).toBe(last);
  });
});
