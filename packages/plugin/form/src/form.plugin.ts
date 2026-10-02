import { definePlugin } from '@embedpdf/core';
import { ActionsToken } from '@embedpdf/plugin-actions/contract';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';

import { FORM_DEFAULTS, type FormConfig } from './contract';
import { createFormController } from './controller';
import { FormToken } from './host-contract';
import { initialFormState } from './model';

/**
 * The form plugin: the field plane. Document-scoped; requires the
 * interaction hub. Filling works without the annotation plugin, because
 * widget geometry is read from the engine's widget records. When the
 * annotation plugin is present, a behavior keeps widgets inert while the
 * active tool carries 'form-fill' (the built-in pointer and pan tools do, so
 * filling is the resting state): the active tool is the mode switch. Design
 * mode is the 'form-edit' and palette tools: without 'form-fill', widgets
 * are ordinary editable annotations. `config` is the settings the app
 * registers, over {@link FORM_DEFAULTS}.
 */
export const formPlugin = (config?: FormConfig) =>
  definePlugin({
    id: 'form',
    token: FormToken,
    scope: 'document',
    requires: [InteractionToken],
    optional: [AnnotationToken, ActionsToken],
    state: initialFormState,
    settings: { defaults: FORM_DEFAULTS, registered: config },
    create: createFormController,
  });
