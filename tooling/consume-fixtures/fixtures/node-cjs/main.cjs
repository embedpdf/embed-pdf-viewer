// Consumer archetype: CJS require() — Jest-on-CJS setups, older Electron.
// It runs with `require()` of an ES module turned off, as those have it: a package whose
// CommonJS build requires an ES-module-only dependency fails here.
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
const pluginSignature = require('@embedpdf/plugin-signature');
const signature = require('@embedpdf/core-signature');
const signatureServer = require('@embedpdf/core-signature/server');

const reactAdapter = require('@embedpdf/react');
const reactRuntime = require('@embedpdf/react/runtime');
const cloudSdk = require('@cloudpdf/sdk');
const cloudEngine = require('@cloudpdf/engine');

// A React component is a function, or the object `forwardRef` / `memo` returns.
const isComponent = (value) =>
  typeof value === 'function' ||
  (typeof value === 'object' && value !== null && '$$typeof' in value);

ok(typeof engineCoreRuntime.AbortablePromise === 'function', 'AbortablePromise via require');
ok(isComponent(reactRuntime.Viewer), 'Viewer via require');
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
  pluginSignature,
  signature,
  signatureServer,
  reactAdapter,
  cloudSdk,
  cloudEngine,
})) {
  ok(Object.keys(ns).length > 0, `${label} exports something`);
}

// The signature package's cryptography libraries are ES modules only, so its CommonJS build
// holds them: signing and verifying has to work with nothing else loaded.
(async () => {
  const signer = await signature.createTestSigner();
  const cms = await signature.buildDetachedCms({
    digest: new Uint8Array(32).fill(7),
    hash: 'sha256',
    profile: 'cades-b',
    signer,
  });
  ok((await signature.verifyCmsSignature(cms)) === 'valid', 'signs and verifies via require');
  console.log('node-cjs OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
