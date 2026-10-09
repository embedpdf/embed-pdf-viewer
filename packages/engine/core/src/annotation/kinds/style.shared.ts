import type { ReadShape, UpdateShape } from '../declaration';
import type { colorStyleFields, filledStyleFields, geometryStyleFields } from './shared-fields';

export type ColorStyleFields = ReadShape<typeof colorStyleFields>;
export type ColorStyleDraftFields = UpdateShape<typeof colorStyleFields>;
export type ColorStylePatchFields = ColorStyleDraftFields;

export type GeometryStyleFields = ReadShape<typeof geometryStyleFields>;
export type GeometryStyleDraftFields = UpdateShape<typeof geometryStyleFields>;
export type GeometryStylePatchFields = GeometryStyleDraftFields;

export type FilledStyleFields = ReadShape<typeof filledStyleFields>;
export type FilledStyleDraftFields = UpdateShape<typeof filledStyleFields>;
export type FilledStylePatchFields = FilledStyleDraftFields;
