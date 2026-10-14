/**
 * What the annotation fixtures saw, for the annotation layer tests: the props each renderer got,
 * the handles drawn, the state and anchors a probe read, and whether each text box editor was
 * typing. `resetAnnotationRecords()` before each test.
 */
import type { Annotation, AnnotationRef } from '@embedpdf/plugin-annotation';
import type { AnnotationFrame, AnnotationRendererProps, HandleProps } from '../../src/annotation';
import { signal } from './signal.svelte';

export interface SeenLook extends Omit<AnnotationRendererProps, 'native'> {
  frame: AnnotationFrame;
}

export const annotationRecords = {
  looks: [] as SeenLook[],
  handles: [] as HandleProps[],
  states: [] as { selected: readonly Annotation[]; editing: Annotation | null }[],
  anchors: [] as unknown[],
  editing: new Map<string, boolean>(),
  /** The annotation the probe's anchor follows. */
  target: signal<AnnotationRef | null>(null),
};

export function resetAnnotationRecords(): void {
  annotationRecords.looks.length = 0;
  annotationRecords.handles.length = 0;
  annotationRecords.states.length = 0;
  annotationRecords.anchors.length = 0;
  annotationRecords.editing.clear();
  annotationRecords.target.value = null;
}
