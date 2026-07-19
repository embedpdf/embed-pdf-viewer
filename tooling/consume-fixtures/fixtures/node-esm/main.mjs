// Consumer archetype: native Node ESM (SSR frameworks import these modules on
// the server — import must resolve AND must not touch the DOM at module scope).
import { ok } from 'node:assert';

import * as geometry from '@embedpdf-x/geometry';
import * as kernel from '@embedpdf-x/kernel';
import * as uiCore from '@embedpdf-x/ui-core';
import * as stageCore from '@embedpdf-x/stage-core';
import * as annotationCore from '@embedpdf-x/annotation-core';

import * as engineCore from '@embedpdf/engine-core';
import { AbortablePromise, deferredEngine } from '@embedpdf/engine-core/runtime';
import * as engineServices from '@embedpdf/engine-services';
import * as engine from '@embedpdf/engine';

import * as pluginStage from '@embedpdf-x/plugin-stage';
import * as pluginAnnotation from '@embedpdf-x/plugin-annotation';
import * as pluginSearch from '@embedpdf-x/plugin-search';

import * as web from '@embedpdf-x/web';
import * as reactAdapter from '@embedpdf-x/react';
import { Viewer } from '@embedpdf-x/react/runtime';
import * as reactAnnotation from '@embedpdf-x/react/annotation';

ok(typeof AbortablePromise === 'function', 'engine-core/runtime AbortablePromise');
ok(typeof deferredEngine === 'function', 'engine-core/runtime deferredEngine');
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
})) {
  ok(Object.keys(ns).length > 0, `${label} exports something`);
}

console.log('node-esm OK');
