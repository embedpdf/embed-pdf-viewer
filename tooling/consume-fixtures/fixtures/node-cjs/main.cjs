// Consumer archetype: CJS require() — Jest-on-CJS setups, older Electron.
const { ok } = require('node:assert');

const geometry = require('@embedpdf/core-geometry');
const kernel = require('@embedpdf/core');
const uiCore = require('@embedpdf/core-ui');
const annotationCore = require('@embedpdf/core-annotation');

const engineCore = require('@embedpdf/engine-core');
const engineCoreRuntime = require('@embedpdf/engine-core/runtime');
const engineServices = require('@embedpdf/engine-services');
const engine = require('@embedpdf/engine');

const pluginStage = require('@embedpdf/plugin-stage');
const pluginAnnotation = require('@embedpdf/plugin-annotation');

const reactAdapter = require('@embedpdf/react');
const reactRuntime = require('@embedpdf/react/runtime');
const cloudSdk = require('@cloudpdf/sdk');
const cloudEngine = require('@cloudpdf/engine');

ok(typeof engineCoreRuntime.AbortablePromise === 'function', 'AbortablePromise via require');
ok(typeof reactRuntime.Viewer === 'function', 'Viewer via require');
for (const [label, ns] of Object.entries({
  geometry,
  kernel,
  uiCore,
  annotationCore,
  engineCore,
  engineServices,
  engine,
  pluginStage,
  pluginAnnotation,
  reactAdapter,
  cloudSdk,
  cloudEngine,
})) {
  ok(Object.keys(ns).length > 0, `${label} exports something`);
}

console.log('node-cjs OK');
