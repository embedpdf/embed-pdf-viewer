/** Public form capability protocol without the form engine implementation. */
import type { CapabilityToken } from '@embedpdf/core';

import { FormToken as FormHostToken } from './types';
import type { FormCapability } from './types';

export const FormToken = FormHostToken as unknown as CapabilityToken<FormCapability>;
export type {
  Box,
  FieldKey,
  FillItem,
  FormAction,
  FormCapability,
  FormCommitResult,
  FormCommitStatus,
  FormPluginOptions,
  FormState,
  FormUiEffect,
  PlacedField,
  PlaceFieldInput,
  WidgetActivationResult,
  WidgetHit,
} from './types';
export type {
  FormFieldDTO,
  FormFieldPatch,
  FormFieldRef,
  WidgetAppearance,
} from '@embedpdf/engine-core/runtime';
