// Consumer archetype: CJS require() — Jest-on-CJS setups, older Electron.
const { ok } = require('node:assert');

const geometry = require('@embedpdf-x/geometry');
const kernel = require('@embedpdf-x/kernel');
const uiCore = require('@embedpdf-x/ui-core');
const annotationCore = require('@embedpdf-x/annotation-core');

const engineCore = require('@embedpdf/engine-core');
const engineCoreRuntime = require('@embedpdf/engine-core/runtime');
const engineServices = require('@embedpdf/engine-services');
const engine = require('@embedpdf/engine');

const pluginStage = require('@embedpdf-x/plugin-stage');
const pluginAnnotation = require('@embedpdf-x/plugin-annotation');

const reactAdapter = require('@embedpdf-x/react');
const reactRuntime = require('@embedpdf-x/react/runtime');

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
})) {
  ok(Object.keys(ns).length > 0, `${label} exports something`);
}

console.log('node-cjs OK');
