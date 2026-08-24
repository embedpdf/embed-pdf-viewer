import type { MeasurementInfo } from '../measurement';
import { MeasurementInfoSchema } from '../base.schema';

/**
 * The measurement fields the five geometry families can carry (line, the
 * vertex pair polygon/polyline, and the shape pair circle/square). A geometry
 * annotation with `measurement` set IS a measurement annotation: the plugin
 * derives its read-out from the same geometry it already draws, and the engine
 * persists the calibration under `/EMBD_Metadata/Measurement` plus the spec
 * `/IT` intent.
 *
 * `measurement` is the only authored field — the `/IT` intent is DERIVED from
 * the subtype and the mode ({@link measurementIntentFor}) so the two can never
 * disagree, and is exposed read-only on the DTO for viewers that care.
 */
export interface MeasurementAnnotationFields {
  /** `/EMBD_Metadata/Measurement` calibration; `null` when not a measurement. */
  measurement: MeasurementInfo | null;
}

export interface MeasurementDraftFields {
  /** Set to author a measurement annotation. Omitted = an ordinary shape. */
  measurement?: MeasurementInfo | null;
}

export interface MeasurementPatchFields {
  /** Tri-state: omitted preserves, a value re-calibrates, `null` demotes the
   *  annotation back to an ordinary shape (clears the key and the `/IT`). */
  measurement?: MeasurementInfo | null;
}

export const MeasurementDTOShape = {
  measurement: MeasurementInfoSchema.nullable(),
} as const;

export const MeasurementDraftShape = {
  measurement: MeasurementInfoSchema.nullable().optional(),
} as const;

export const MeasurementPatchShape = {
  measurement: MeasurementInfoSchema.nullable().optional(),
} as const;

/** Guard used by the writers: does this draft/patch state a measurement? */
export function statesMeasurement(v: {
  measurement?: MeasurementInfo | null;
}): v is { measurement: MeasurementInfo | null } {
  return v.measurement !== undefined;
}
