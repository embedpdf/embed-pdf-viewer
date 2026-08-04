// Consumer archetype: native Node ESM (SSR frameworks import these modules on
// the server — import must resolve AND must not touch the DOM at module scope).
import { ok } from 'node:assert';

import * as geometry from '@embedpdf/core-geometry';
import * as kernel from '@embedpdf/core';
import * as uiCore from '@embedpdf/core-ui';
import * as stageCore from '@embedpdf/core-stage';
import * as annotationCore from '@embedpdf/core-annotation';

import * as engineCore from '@embedpdf/engine-core';
import { AbortablePromise } from '@embedpdf/engine-core/runtime';
import * as engineServices from '@embedpdf/engine-services';
import * as engine from '@embedpdf/engine';

import * as pluginStage from '@embedpdf/plugin-stage';
import * as pluginAnnotation from '@embedpdf/plugin-annotation';
import * as pluginSearch from '@embedpdf/plugin-search';

import * as web from '@embedpdf/web';
import * as reactAdapter from '@embedpdf/react';
import { Viewer } from '@embedpdf/react/runtime';
import * as reactAnnotation from '@embedpdf/react/annotation';
import * as cloudAdmin from '@cloudpdf/admin';
import * as cloudEngine from '@cloudpdf/engine';

ok(typeof AbortablePromise === 'function', 'engine-core/runtime AbortablePromise');
ok(typeof engine.localEngine === 'function', 'engine localEngine');
ok(typeof Viewer === 'function', 'react runtime Viewer');
for (const [label, ns] of Object.entries({
  geometry,
  kernel,
  uiCore,
  stageCore,
  annotationCore,
  engineCore,
  engineServices,
  engine,
  pluginStage,
  pluginAnnotation,
  pluginSearch,
  web,
  reactAdapter,
  reactAnnotation,
  cloudAdmin,
  cloudEngine,
})) {
  ok(Object.keys(ns).length > 0, `${label} exports something`);
}

console.log('node-esm OK');
