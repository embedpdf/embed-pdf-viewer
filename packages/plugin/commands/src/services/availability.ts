/**
 * Whether a command is there at all, apart from what it says about the
 * moment (`enabled`, `visible`): turned off in this viewer (its id, or one of
 * its categories), or not allowed by its document's scope (`requires`), and
 * the sentence that says why, translated when the i18n plugin is there.
 */
import type { DocumentHandle, Permission, PluginContext, Settings } from '@embedpdf/core';
import { I18nToken } from '@embedpdf/plugin-i18n/contract';

import type { CommandContext, CommandDef, CommandRefusal, CommandsSettings } from '../contract';

/**
 * Whether a category is off: it, or a category it's under, is in the list. Parts are whole
 * dotted segments, so `annotations` covers `annotations.highlight` and not `annotationsExtra`.
 */
export const isCategoryOff = (category: string, disabled: readonly string[]): boolean =>
  disabled.some((off) => category === off || category.startsWith(`${off}.`));

/** The label: the key's string when a language has it, else `label`, else the key or the id. */
export const labelOf = (definition: CommandDef, context: CommandContext): string => {
  const i18n = definition.labelKey ? context.tryGet(I18nToken) : null;
  if (i18n && definition.labelKey) {
    return definition.label === undefined
      ? i18n.t(definition.labelKey)
      : i18n.t(definition.labelKey, { fallback: definition.label });
  }
  return definition.label ?? definition.labelKey ?? definition.id;
};

/**
 * Whether a document's session holds a permission: what `ctx.allows` answers for a
 * document-scoped plugin, asked here of the command's document, since the commands are one
 * set for the whole workspace.
 */
const sessionHolds = (security: DocumentHandle['security'], permission: Permission): boolean =>
  permission === 'annotations:create'
    ? security.allowsAnnotation('create')
    : security.allows(permission);

/** Where a language keeps the sentence for a permission: `commands.notAllowed.doc-text-copy`. */
const notAllowedKey = (permission: Permission): string =>
  `commands.notAllowed.${permission.replace(/[.:]/g, '-')}`;

/** The sentence for a command the scope doesn't allow: the permission's own, else a general one. */
export const notAllowedMessage = (
  permission: Permission,
  label: string,
  context: CommandContext,
): string => {
  const fallback = `${label} isn't allowed`;
  const i18n = context.tryGet(I18nToken);
  if (!i18n) return fallback;
  const params = { label };
  return i18n.t(notAllowedKey(permission), {
    params,
    fallback: i18n.t('commands.notAllowed.default', { params, fallback }),
  });
};

/** The sentence for a command that's turned off. */
const turnedOffMessage = (label: string, context: CommandContext): string => {
  const i18n = context.tryGet(I18nToken);
  return i18n
    ? i18n.t('commands.turnedOff', { params: { label }, fallback: "{label} isn't available" })
    : `${label} isn't available`;
};

export function createAvailability(
  ctx: PluginContext<void, CommandsSettings>,
  settings: Settings<CommandsSettings>,
) {
  /** Whether a command is turned off: by its id, or through one of its categories. */
  const isTurnedOff = (definition: CommandDef): boolean => {
    const { disabledCategories, disabledCommands } = settings.get();
    return (
      disabledCommands.includes(definition.id) ||
      (definition.categories ?? []).some((category) => isCategoryOff(category, disabledCategories))
    );
  };

  /**
   * The first permission a command needs that its document's session doesn't hold, or `null`.
   * With no document open there is no session to ask, and nothing is missing.
   */
  const missingPermissionOf = (
    definition: CommandDef,
    context: CommandContext,
  ): Permission | null => {
    if (!definition.requires?.length || context.documentId === null) return null;
    const handle = ctx.documentHandle(context.documentId);
    if (!handle) return null;
    return (
      definition.requires.find((permission) => !sessionHolds(handle.security, permission)) ?? null
    );
  };

  /** Why a command won't run whatever the moment, or `null` when it may run. */
  const refusalOf = (definition: CommandDef, context: CommandContext): CommandRefusal | null => {
    if (isTurnedOff(definition)) {
      return {
        reason: 'turned-off',
        message: turnedOffMessage(labelOf(definition, context), context),
      };
    }
    const missing = missingPermissionOf(definition, context);
    return missing === null
      ? null
      : {
          reason: 'not-allowed',
          message: notAllowedMessage(missing, labelOf(definition, context), context),
        };
  };

  return { isTurnedOff, missingPermissionOf, refusalOf };
}
