/** What the form control fixtures saw, for the form layer's control tests: the frame each control got, by its box's label. */
import type { FieldControlFrame } from '../../src/form';

export const formControlRecords = {
  frames: new Map<string, FieldControlFrame>(),
};

export function resetFormControlRecords(): void {
  formControlRecords.frames.clear();
}
