import type { CapabilityToken } from '@embedpdf/core';

import { FormToken as FormHostToken } from './types';
import type { FormCapability } from './types';

export { formPlugin } from './form.plugin';
/**
 * App-facing form token: resolves the public {@link FormCapability}. It is
 * the SAME runtime token the plugin provides, narrowed to the public lens —
 * the plugin-to-plugin surface (action executors) is reachable only via
 * `@embedpdf/plugin-form/internal`.
 */
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
  FormScriptingOptions,
  FormState,
  FormUiEffect,
  FormUiEffectProvider,
  PlacedField,
  PlaceFieldInput,
  WidgetActivationResult,
} from './types';
export { createFormScriptingController, FormScriptingController } from './scripting';
export { createSerialMutationQueue } from './mutationQueue';
export { fieldKeyOf } from './core/model';
export { FORM_TOOLS, FORM_TOOL_BY_ID } from './tools';
export type { AuthorableFormFamily, FormToolDef } from './tools';
export type { FormFieldDTO, FormFieldPatch, WidgetAppearance } from '@embedpdf/engine-core/runtime';
