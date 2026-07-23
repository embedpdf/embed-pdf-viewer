/**
 * The Stage is a LENS: one document can be viewed through several at once. The
 * thumbnail sidebar is a second lens over the SAME document — a single-column,
 * fixed-zoom grid with its own camera, fully independent of the main view.
 *
 * The token lives here (not in App.tsx) because two places need it: App wires the
 * `stagePlugin` lens with it, and the sidebar renders `<Stage token={...}>` off it.
 */
import { createCapabilityToken } from '@embedpdf/react/runtime';
import type { StageCapability } from '@embedpdf/react/stage';

export const ThumbsStageToken = createCapabilityToken<StageCapability>('stage-thumbs');
