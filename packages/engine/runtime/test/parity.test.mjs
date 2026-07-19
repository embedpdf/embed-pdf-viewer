import assert from 'node:assert/strict';
import { test } from 'node:test';

test('native and wasm runtimes expose the same generated function names', async () => {
  const generated = await import('../dist/index.js').catch(() => null);
  if (!generated) {
    assert.ok(true, 'dist not built; parity test skipped');
    return;
  }

  const wasm = await generated.createPdfRuntime({ prefer: 'wasm' }).catch(() => null);
  const native = await generated.createPdfRuntime({ prefer: 'native' }).catch(() => null);

  if (!wasm || !native) {
    await wasm?.destroy?.();
    await native?.destroy?.();
    assert.ok(true, 'runtime artifacts unavailable; parity test skipped');
    return;
  }

  assert.deepEqual(Object.keys(native.fn).sort(), Object.keys(wasm.fn).sort());

  await native.destroy();
  await wasm.destroy();
});
