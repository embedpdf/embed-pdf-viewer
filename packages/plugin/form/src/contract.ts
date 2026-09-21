/**
 * @embedpdf/plugin-form/contract — the PUBLIC form vocabulary. Fields are
 * addressed by `FormFieldRef` (`fieldRef.byName` / `fieldRef.byObjectNumber`),
 * widgets by their `AnnotationRef`; the render feed and the actions seams
 * are the host lens (`/contract/host`).
 */
import type { CapabilityToken } from '@embedpdf/core';

import { FormToken as FormHostToken } from './types';
import type { FormCapability } from './types';

export const FormToken = FormHostToken as unknown as CapabilityToken<FormCapability>;
export { fieldRef } from './types';
export type {
  Box,
  CreatedField,
  CreateFieldInput,
  FillItem,
  FormCapability,
  FormCommitResult,
  FormCommitStatus,
  FormConfig,
  FormFieldChangedEvent,
  FormFilter,
  FormResyncedEvent,
  FormUiEffect,
  FormValidationRejectedEvent,
  FormValueChangedEvent,
  FormWidgetItem,
  SetValueResult,
  WidgetActivationResult,
  WidgetAddress,
  WidgetHit,
} from './types';
export type {
  FormDataExport,
  FormDataFormat,
  FormFieldDTO,
  FormFieldFamily,
  FormFieldPatch,
  FormFieldRef,
  FormFieldValue,
  FormImportResult,
  FormRepairOptions,
  FormRepairResult,
  FormSetValueResult,
  FormSnapshot,
  WidgetAppearance,
} from '@embedpdf/engine-core/runtime';
