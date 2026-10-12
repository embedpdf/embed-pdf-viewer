/**
 * The Stage is a lens: one document can be viewed through several at once. The
 * thumbnail sidebar is a second lens over the same document — a fixed-zoom grid
 * that wraps to the panel's width, with its own camera, fully independent of the
 * main view. `viewer.get('thumbnails')` is its Stage, and `plugins.thumbnails`
 * its settings.
 *
 * The token lives here (not in viewer.tsx) because several places need it: the
 * viewer wires the `stagePlugin` lens with it, the sidebar renders
 * `<Stage token={...}>` off it, and the `viewer` finds it by name.
 */
import { createCapabilityToken } from '@embedpdf/react/runtime';
import type { StageCapability } from '@embedpdf/react/stage';

export const ThumbsStageToken = createCapabilityToken<StageCapability>('stage-thumbs');
