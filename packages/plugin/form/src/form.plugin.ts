import { definePlugin } from '@embedpdf/core';
import { ActionsToken } from '@embedpdf/plugin-actions/contract';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';
import { FontsToken } from '@embedpdf/plugin-fonts/contract';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { RenderToken } from '@embedpdf/plugin-render/contract';

import { FORM_DEFAULTS, type FormConfig } from './contract';
import { createFormController } from './controller';
import { FormToken } from './host-contract';
import { initialFormState } from './model';

/**
 * The form plugin: the field plane. Document-scoped; requires the
 * interaction hub. Filling works without the annotation plugin, because
 * widget geometry is read from the engine's widget records. The active tool
 * is the mode switch: while it carries 'form-fill' (the built-in pointer and
 * pan tools do, so filling is the resting state), the form layer draws and
 * fills every widget. Design mode is the 'form-edit' and palette tools: with
 * the annotation plugin present, the form lends it the widgets, which its
 * tools then select, move, restyle and delete. The render plugin draws the
 * widgets' pictures in both modes. With the fonts plugin, a text field in a
 * font of its own is edited in that font's program. `config` is the settings the app
 * registers, over {@link FORM_DEFAULTS}.
 */
export const formPlugin = (config?: FormConfig) =>
  definePlugin({
    id: 'form',
    token: FormToken,
    scope: 'document',
    requires: [InteractionToken],
    optional: [AnnotationToken, ActionsToken, RenderToken, FontsToken],
    state: initialFormState,
    settings: { defaults: FORM_DEFAULTS, registered: config },
    create: createFormController,
  });
