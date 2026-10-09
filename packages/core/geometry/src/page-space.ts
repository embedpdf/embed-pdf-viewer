import type { PointIn, QuadIn, RectIn } from './index';

/**
 * Page space: the unrotated page's own frame, origin at the top-left of the
 * visible page, y down, in points (the
 * page's UserUnit is applied by the view, not here). The engine gives and
 * takes every position in this space.
 */
export type PagePoint = PointIn<'page'>;
export type PageRect = RectIn<'page'>;
export type PageQuad = QuadIn<'page'>;
