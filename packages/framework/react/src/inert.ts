/**
 * The `inert` attribute as a prop spread, for the React the app runs. `inert` takes pointer and
 * focus from a whole subtree. React 19 knows it as a boolean prop and drops an empty string;
 * React 18 doesn't know it, and sets it only from a string. Preact, which says it's React 18,
 * sets it as the element's property, where an empty string reads as false: `'true'` is inert as
 * an attribute and as a property.
 */
import { version } from 'react';

export const INERT = (
  Number.parseInt(version, 10) >= 19 ? { inert: true } : { inert: 'true' }
) as Record<string, unknown>;
