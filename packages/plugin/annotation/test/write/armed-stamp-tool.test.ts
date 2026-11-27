/**
 * The armed stamp and its tool go together, on the real interaction plugin: arming switches to
 * the `stamp` tool, placing keeps the stamp armed, and disarming goes back to the tool that was
 * active at the arm (the default tool when that one is gone). Leaving the stamp tool for another
 * drops the stamp, and the tool picked stays.
 */
import { createTestContext } from '@embedpdf/core/testing';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import type { InteractionHostCapability } from '@embedpdf/plugin-interaction/contract/host';
import { describe, expect, it } from 'vitest';

import { annotationHarness, PAGE } from '../harness';

/** The real interaction plugin, built on a context of its own as the kernel builds it. */
const interactionHub = (): InteractionHostCapability => {
  const definition = interactionPlugin();
  const ctx = createTestContext({
    id: 'interaction',
    state: (definition.state as () => unknown)(),
    settings: definition.settings,
  });
  return ctx.connect(definition.create(ctx as never)) as InteractionHostCapability;
};

/** The first bytes of a PNG `width` × `height`: as much as a sniff reads. */
const pngOf = (width: number, height: number): Uint8Array => {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
};

/** The annotation plugin, connected to the real hub (its tools registered on it). */
const connected = async () => {
  const interaction = interactionHub();
  const harness = annotationHarness({ interaction });
  await harness.load([]);
  harness.connectAll();
  const arm = () => harness.capability.stamps.arm({ source: pngOf(200, 100) });
  const tool = () => interaction.getActiveToolId();
  const armed = () => harness.capability.stamps.isArmed();
  return { harness, interaction, arm, tool, armed };
};

describe('the armed stamp and its tool', () => {
  it('arms on the stamp tool, stays armed while it places, and a disarm goes back to the pointer', async () => {
    const { harness, arm, tool, armed } = await connected();
    expect(tool()).toBe('pointer');

    await arm();
    expect(tool()).toBe('stamp');
    // The engine is still placing it: the stamp shows, and the arm stays.
    harness.create.mockReturnValueOnce(new Promise(() => {}));
    expect(harness.capability.placeArmedStamp(PAGE, { x: 300, y: 400 })).toBe(true);
    expect(armed()).toBe(true);
    expect(tool()).toBe('stamp');

    harness.capability.stamps.disarm();
    expect(armed()).toBe(false);
    expect(tool()).toBe('pointer');
  });

  it('goes back to the tool it was armed from, and a second arm keeps the first one’s', async () => {
    const { harness, interaction, arm, tool } = await connected();
    interaction.activateTool('ink');

    await arm();
    await arm();
    expect(tool()).toBe('stamp');

    harness.capability.stamps.disarm();
    expect(tool()).toBe('ink');
  });

  it('drops the stamp when another tool is picked, and that tool stays', async () => {
    const { harness, interaction, arm, tool, armed } = await connected();
    interaction.activateTool('ink');
    await arm();

    interaction.activateTool('note');
    expect(armed()).toBe(false);
    expect(tool()).toBe('note');
    // Nothing armed: a disarm now changes no tool.
    harness.capability.stamps.disarm();
    expect(tool()).toBe('note');
  });

  it('goes to the default tool when the tool it was armed from is gone', async () => {
    const { harness, interaction, arm, tool } = await connected();
    const unregister = interaction.registerTool({
      id: 'mine',
      cursor: 'default',
      enables: new Set(['annotation-edit']),
    });
    interaction.activateTool('mine');
    await arm();
    unregister();

    harness.capability.stamps.disarm();
    expect(tool()).toBe(interaction.getDefaultToolId());
  });

  it('keeps the stamp tool when it was already the tool at the arm', async () => {
    const { harness, interaction, arm, tool, armed } = await connected();
    interaction.activateTool('stamp');

    await arm();
    harness.capability.stamps.disarm();
    expect(armed()).toBe(false);
    expect(tool()).toBe('stamp');
  });
});
