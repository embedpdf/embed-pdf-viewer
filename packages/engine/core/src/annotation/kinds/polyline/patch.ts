import type { AnnotationPatchBase } from '../../patch-base';
import type { LineEndings } from '../../primitives';
import type { VertexPatchFields } from '../vertex.shared';

export interface PolylinePatch extends AnnotationPatchBase, VertexPatchFields {
  subtype: 'polyline';
  lineEndings?: LineEndings;
}
