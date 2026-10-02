import { h, nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import { InteractionToken as InteractionHostToken } from '@embedpdf/plugin-interaction/contract/host';
import {
  InteractionToken,
  interactionPlugin,
  useInteraction,
  useInteractionEvent,
  useInteractionState,
  useToolCursor,
} from '../src/interaction';
import type { ToolCursorSpec } from '../src/interaction';
import { bytesInput, probe, settle, viewerWith } from './counter-plugin';

/**
 * The interaction composables: the tools' state as refs, events that follow
 * the document, and a tool cursor that follows its spec and is restored when
 * the component unmounts.
 */

const plugins = [interactionPlugin()];

enableAutoUnmount(afterEach);

describe('useInteractionState and useInteraction', () => {
  it('reads no tool without a document, then the active tool as it changes', async () => {
    const tools: unknown[] = [];
    let activate: ((toolId: string) => void) | null = null;
    const Probe = probe(() => {
      const interaction = useInteraction();
      activate = (toolId) => interaction.activateTool(toolId);
      const { activeToolId } = useInteractionState();
      return () => {
        tools.push(activeToolId.value);
        return null;
      };
    });
    const { kernel } = await viewerWith(plugins, () => h(Probe));
    expect(tools.at(-1)).toBeNull();

    await kernel.documents.open(bytesInput('a'));
    await settle();
    expect(tools.at(-1)).toBe('pointer');
    activate!('pan');
    await settle();
    expect(tools.at(-1)).toBe('pan');
  });
});

describe('useInteractionEvent', () => {
  it('subscribes to the document once it opens', async () => {
    const changed = vi.fn();
    const Probe = probe(() => {
      useInteractionEvent((interaction) => interaction.onToolChanged, changed);
    });
    const { kernel } = await viewerWith(plugins, () => h(Probe));
    await kernel.documents.open(bytesInput('a'));
    kernel.capability(InteractionToken).activateTool('pan');
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ toolId: 'pan' }));
  });
});

describe('useToolCursor', () => {
  it('replaces a tool’s cursor while mounted, follows its spec, and restores it on unmount', async () => {
    const shown = ref(true);
    const look = ref('copy');
    const Cursor = probe(() => {
      useToolCursor((): ToolCursorSpec => ({ toolId: 'pan', cursors: { text: look.value } }));
    });
    const { kernel } = await viewerWith(plugins, () => (shown.value ? h(Cursor) : null));
    await kernel.documents.open(bytesInput('a'));
    await settle();
    const hub = kernel.capability(InteractionHostToken);
    hub.activateTool('pan');
    // Over text, as a hover claim says: the tool's look replaces 'text'.
    hub.claimCursor('over-text', 'text');
    expect(hub.getCursor()).toBe('copy');

    look.value = 'move';
    await nextTick();
    expect(hub.getCursor()).toBe('move');

    shown.value = false;
    await nextTick();
    expect(hub.getCursor()).toBe('text');
  });
});
