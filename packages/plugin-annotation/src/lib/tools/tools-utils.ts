import { AnnotationTool } from './types';
import { defaultTools } from './default-tools';

// Infer the exact union type of all tool objects.
type DefaultTool = (typeof defaultTools)[number];

// Create a map from a tool's ID to its specific type.
export type ToolMap = {
  [T in DefaultTool as T['id']]: T;
};

/**
 * A factory that creates a type-safe predicate function for a specific tool ID.
 * This is more reliable for TypeScript's type inference than a single generic function.
 */
export function createToolPredicate<K extends keyof ToolMap>(id: K) {
  // This function returns ANOTHER function, which is the actual type predicate.
  return (tool: AnnotationTool<any> | undefined): tool is ToolMap[K] => {
    return tool?.id === id;
  };
}

// Export the generated predicates for common tools.
export const isHighlightTool = createToolPredicate('highlight');
export const isSquigglyTool = createToolPredicate('squiggly');
export const isUnderlineTool = createToolPredicate('underline');
export const isStrikeoutTool = createToolPredicate('strikeout');
export const isInkTool = createToolPredicate('ink');
export const isInkHighlighterTool = createToolPredicate('inkHighlighter');
export const isSquareTool = createToolPredicate('square');
export const isCircleTool = createToolPredicate('circle');
export const isLineTool = createToolPredicate('line');
export const isPolylineTool = createToolPredicate('polyline');
export const isPolygonTool = createToolPredicate('polygon');
export const isFreeTextTool = createToolPredicate('freeText');
export const isStampTool = createToolPredicate('stamp');
