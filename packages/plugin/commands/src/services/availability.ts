/**
 * Whether a command is there at all, apart from what it says about the
 * moment (`enabled`, `visible`): turned off in this viewer (its id, or one of
 * its categories), or not allowed for its document (the scope's `requires`, or
 * the plugins' checks in `allowed`), and the sentence that says why, translated
 * when the i18n plugin is there.
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

/**
 * The label: a language's string under the command's id, else under its `labelKey` (the current
 * language, then the fallback one), else `label`, else the id. So a string for
 * `'document:download'` relabels that one command, whichever key its label is under.
 */
export const labelOf = (definition: CommandDef, context: CommandContext): string => {
  const i18n = context.tryGet(I18nToken);
  if (!i18n) return definition.label ?? definition.labelKey ?? definition.id;
  const fallbackKey = definition.labelKey ? { fallbackKey: definition.labelKey } : {};
  // A command with a key and no label of its own warns once when no language has the key.
  return definition.label === undefined && definition.labelKey
    ? i18n.t(definition.id, fallbackKey)
    : i18n.t(definition.id, { ...fallbackKey, fallback: definition.label ?? definition.id });
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
const permissionKeyOf = (permission: Permission): string =>
  `commands.notAllowed.${permission.replace(/[.:]/g, '-')}`;

/** The general sentence's key: `{label} isn't allowed`. */
const DEFAULT_NOT_ALLOWED_KEY = 'commands.notAllowed.default';

/** The sentence for a command the session may not run, under `key`, else the general one. */
export const notAllowedMessage = (key: string, label: string, context: CommandContext): string => {
  const fallback = `${label} isn't allowed`;
  const i18n = context.tryGet(I18nToken);
  if (!i18n) return fallback;
  const params = { label };
  return i18n.t(key, {
    params,
    fallback: i18n.t(DEFAULT_NOT_ALLOWED_KEY, { params, fallback }),
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

  /** Whether a command's `allowed` check says yes; one that throws allows it. */
  const passesCheck = (definition: CommandDef, context: CommandContext): boolean => {
    if (!definition.allowed) return true;
    try {
      return definition.allowed(context);
    } catch {
      return true;
    }
  };

  /**
   * Why its document's session may not run a command, as the key of the sentence that says
   * so, or `null` when it may: the first permission `requires` names that the session doesn't
   * hold (`commands.notAllowed.doc-print`), else its `allowed` check saying no (its
   * `notAllowedKey`). With no document open there is no session to ask, and nothing is refused.
   */
  const notAllowedKeyOf = (definition: CommandDef, context: CommandContext): string | null => {
    if (!definition.requires?.length && !definition.allowed) return null;
    const handle = context.documentId === null ? null : ctx.documentHandle(context.documentId);
    if (!handle) return null;
    const missing = definition.requires?.find(
      (permission) => !sessionHolds(handle.security, permission),
    );
    if (missing !== undefined) return permissionKeyOf(missing);
    return passesCheck(definition, context)
      ? null
      : (definition.notAllowedKey ?? DEFAULT_NOT_ALLOWED_KEY);
  };

  /** Why a command won't run whatever the moment, or `null` when it may run. */
  const refusalOf = (definition: CommandDef, context: CommandContext): CommandRefusal | null => {
    if (isTurnedOff(definition)) {
      return {
        reason: 'turned-off',
        message: turnedOffMessage(labelOf(definition, context), context),
      };
    }
    const notAllowed = notAllowedKeyOf(definition, context);
    return notAllowed === null
      ? null
      : {
          reason: 'not-allowed',
          message: notAllowedMessage(notAllowed, labelOf(definition, context), context),
        };
  };

  return { isTurnedOff, notAllowedKeyOf, refusalOf };
}
