/**
 * The Download button on a real engine: it saves the document with every change, under the
 * document's name, with `.pdf` added when the name has none.
 */
import { createKernel, type Engine } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { CHANGE_FIXTURE_PDF } from '@embedpdf/engine-core/conformance';
import { commandsPlugin } from '@embedpdf/plugin-commands';
import { CommandsToken } from '@embedpdf/plugin-commands/contract/host';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const saved = vi.hoisted(() => [] as { bytes: Uint8Array; name: string }[]);
vi.mock('@embedpdf/web', async (importOriginal) => {
  const web = await importOriginal<typeof import('@embedpdf/web')>();
  return {
    ...web,
    standardCommandsBrowser: {
      ...web.standardCommandsBrowser,
      saveFile: (bytes: Uint8Array, name: string) => saved.push({ bytes, name }),
    },
  };
});

import { defaultCommands } from '../../../chrome/src/config/commands';

let engine: Engine;
beforeAll(async () => {
  engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
});
afterAll(async () => {
  await engine.destroy();
});

/** Download a document opened under `name`, and wait until it's saved. */
async function downloadAs(name: string) {
  const kernel = createKernel({ engine, plugins: [commandsPlugin({ commands: defaultCommands })] });
  await kernel.documents.open(
    { kind: 'bytes', id: `download-${Math.random()}`, bytes: CHANGE_FIXTURE_PDF.slice() },
    { name },
  );
  saved.length = 0;
  await kernel.capability(CommandsToken).execute('document:download');
  await vi.waitFor(() => expect(saved).toHaveLength(1));
  await kernel.destroy();
  return saved[0]!;
}

describe('document:download', () => {
  it("saves the document under its name, with '.pdf' added when the name has none", async () => {
    const file = await downloadAs('Quarterly report');
    expect(file.name).toBe('Quarterly report.pdf');
    expect(new TextDecoder().decode(file.bytes.slice(0, 5))).toBe('%PDF-');
    expect((await downloadAs('scan.PDF')).name).toBe('scan.PDF');
  });
});
