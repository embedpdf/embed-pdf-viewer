/**
 * The default parts' colors: CSS variables only, because the defaults are meant to be replaced.
 * `--epdf-toolbar-surface` (the "More" menu and folded groups), `--epdf-toolbar-border` and
 * `--epdf-toolbar-active` (a pressed or open button).
 */
import { paintDefault } from '@embedpdf/web';

export const SURFACE = paintDefault('toolbar-surface');
export const BORDER = paintDefault('toolbar-border');
export const ACTIVE = paintDefault('toolbar-active');
