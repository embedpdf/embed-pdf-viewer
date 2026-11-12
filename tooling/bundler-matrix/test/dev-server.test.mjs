import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { installedFromPacks, workspaceDependencies } from '../dev-server.mjs';

describe('a matrix app installed from packs', () => {
  const manifest = {
    name: 'app',
    dependencies: { '@embedpdf/bundler-probe': 'workspace:*', rxjs: '^7.8.0' },
    devDependencies: { '@embedpdf/engine-runtime-wasm32': 'workspace:*', vite: '^6.0.0' },
    optionalDependencies: { '@embedpdf/engine-runtime-darwin-arm64': 'workspace:*' },
  };

  it('needs its workspace dependencies packed, and leaves the optional ones to npm', () => {
    assert.deepEqual(workspaceDependencies(manifest), [
      '@embedpdf/bundler-probe',
      '@embedpdf/engine-runtime-wasm32',
    ]);
  });

  it('names each workspace dependency by its pack, and gives every pack to the whole tree', () => {
    const packs = new Map([
      ['@embedpdf/bundler-probe', '/packs/probe.tgz'],
      ['@embedpdf/engine-runtime-wasm32', '/packs/wasm32.tgz'],
      // Reached through the probe, not named by the app.
      ['@embedpdf/engine', '/packs/engine.tgz'],
    ]);
    const installed = installedFromPacks(manifest, packs);

    assert.deepEqual(installed.dependencies, {
      '@embedpdf/bundler-probe': 'file:/packs/probe.tgz',
      rxjs: '^7.8.0',
    });
    assert.deepEqual(installed.devDependencies, {
      '@embedpdf/engine-runtime-wasm32': 'file:/packs/wasm32.tgz',
      vite: '^6.0.0',
    });
    assert.deepEqual(installed.overrides, {
      '@embedpdf/bundler-probe': 'file:/packs/probe.tgz',
      '@embedpdf/engine-runtime-wasm32': 'file:/packs/wasm32.tgz',
      '@embedpdf/engine': 'file:/packs/engine.tgz',
    });
    // The workspace's own file is not what was changed.
    assert.equal(manifest.dependencies['@embedpdf/bundler-probe'], 'workspace:*');
  });
});
