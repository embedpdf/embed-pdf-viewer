// Consumer archetype: strict TypeScript under NodeNext resolution — the most
// demanding type-resolution mode a real consumer runs.
import { AbortablePromise } from '@embedpdf/engine-core/runtime';
import { Viewer } from '@embedpdf/react/runtime';
import type { Engine } from '@embedpdf/react/runtime';
import { createLocalEngine } from '@embedpdf/engine';
import { stagePlugin } from '@embedpdf/react/stage';
import { annotationPlugin } from '@embedpdf/react/annotation';
import type { Rect } from '@embedpdf/core-geometry';

const rect: Rect = { x: 0, y: 0, width: 1, height: 1 };
const engine: Engine = createLocalEngine();
const abortable: typeof AbortablePromise = AbortablePromise;

// Reference values so noUnusedLocals stays viable later.
export const surface = { Viewer, stagePlugin, annotationPlugin, rect, engine, abortable };
