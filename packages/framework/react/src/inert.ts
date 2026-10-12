/**
 * The `inert` attribute as a prop spread, for the React the app runs. `inert` takes pointer and
 * focus from a whole subtree. React 19 knows it as a boolean prop and drops an empty string;
 * React 18 doesn't know it, and sets it only from a string.
 */
import { version } from 'react';

export const INERT = (
  Number.parseInt(version, 10) >= 19 ? { inert: true } : { inert: '' }
) as Record<string, unknown>;
