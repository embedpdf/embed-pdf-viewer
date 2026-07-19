// Consumer archetype: strict TypeScript under NodeNext resolution — the most
// demanding type-resolution mode a real consumer runs.
import { AbortablePromise, deferredEngine } from '@embedpdf/engine-core/runtime';
import { Viewer } from '@embedpdf-x/react/runtime';
import type { Engine } from '@embedpdf-x/react/runtime';
import { stagePlugin } from '@embedpdf-x/react/stage';
import { annotationPlugin } from '@embedpdf-x/react/annotation';
import type { Rect } from '@embedpdf-x/geometry';

const rect: Rect = { x: 0, y: 0, width: 1, height: 1 };
const engine: Engine = deferredEngine(() => Promise.reject(new Error('fixture')));
const abortable: typeof AbortablePromise = AbortablePromise;

// Reference values so noUnusedLocals stays viable later.
export const surface = { Viewer, stagePlugin, annotationPlugin, rect, engine, abortable };
