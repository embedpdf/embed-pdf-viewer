/**
 * Whether a command is there at all, apart from what it says about the
 * moment (`enabled`, `visible`): turned off in this viewer (its id, or one of
 * its categories), not allowed for its document (the scope's `requires`, or
 * the plugins' checks in `allowed`), or held by a lock on the setting it
 * changes (`locked`), and the sentence that says why, translated when the
 * i18n plugin is there.
 */
import type {
  DocumentHandle,
  Permission,
  PluginContext,
  SettingLock,
  Settings,
} from '@embedpdf/core';
import { I18nToken, interpolate, type TranslateOptions } from '@embedpdf/plugin-i18n/contract';

import type {
  CommandContext,
  CommandDefinition,
  CommandRefusal,
  CommandsSettings,
} from '../contract';

/**
 * Whether a category is off: it, or a category it's under, is in the list. Parts are whole
 * dotted segments, so `annotations` covers `annotations.highlight` and not `annotationsExtra`.
 */
export const isCategoryOff = (category: string, disabled: readonly string[]): boolean =>
  disabled.some((off) => category === off || category.startsWith(`${off}.`));

/** How a command's sentences are translated: the i18n plugin's `t`, or `null` without the plugin. */
export type Translate = (key: string, options?: TranslateOptions) => string;

/** The translate function for a command's document: a new one only when its strings may differ. */
export const translateOf = (context: CommandContext): Translate | null =>
  context.tryGet(I18nToken)?.getTranslator() ?? null;

/** The values for a label's slots, from `labelParams`; none without it, or when it throws. */
export const labelParamsOf = (
  definition: CommandDefinition,
  context: CommandContext,
): Readonly<Record<string, string | number>> | undefined => {
  if (!definition.labelParams) return undefined;
  try {
    return definition.labelParams(context);
  } catch {
    return undefined;
  }
};

/**
 * The label: a language's string under the command's id, else under its `labelKey` (the current
 * language, then the fallback one), else `label`, else the id, with `labelParams` in its slots.
 * So a string for `'document:download'` relabels that one command, whichever key its label is
 * under.
 */
export const labelOf = (
  definition: CommandDefinition,
  params: Readonly<Record<string, string | number>> | undefined,
  t: Translate | null,
): string => {
  if (!t) return interpolate(definition.label ?? definition.labelKey ?? definition.id, params);
  const options = {
    ...(definition.labelKey ? { fallbackKey: definition.labelKey } : {}),
    ...(params ? { params } : {}),
  };
  // A command with a key and no label of its own warns once when no language has the key.
  return definition.label === undefined && definition.labelKey
    ? t(definition.id, options)
    : t(definition.id, { ...options, fallback: definition.label ?? definition.id });
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
export const notAllowedMessage = (key: string, label: string, t: Translate | null): string => {
  const fallback = `${label} isn't allowed`;
  if (!t) return fallback;
  const params = { label };
  return t(key, { params, fallback: t(DEFAULT_NOT_ALLOWED_KEY, { params, fallback }) });
};

/** The general locked sentence's key: `{label} can't be changed in this document`. */
const DEFAULT_LOCKED_KEY = 'commands.locked.default';

/** The sentence for a command whose setting a lock holds, under `key`, else the general one. */
export const lockedMessage = (key: string, label: string, t: Translate | null): string => {
  const fallback = `${label} can't be changed in this document`;
  if (!t) return fallback;
  const params = { label };
  return t(key, { params, fallback: t(DEFAULT_LOCKED_KEY, { params, fallback }) });
};

/** The sentence for a command that's turned off. */
const turnedOffMessage = (label: string, t: Translate | null): string =>
  t
    ? t('commands.turnedOff', { params: { label }, fallback: "{label} isn't available" })
    : `${label} isn't available`;

export function createAvailability(
  ctx: PluginContext<void, CommandsSettings>,
  settings: Settings<CommandsSettings>,
) {
  /** Whether a command is turned off: by its id, or through one of its categories. */
  const isTurnedOff = (definition: CommandDefinition): boolean => {
    const { disabledCategories, disabledCommands } = settings.get();
    return (
      disabledCommands.includes(definition.id) ||
      (definition.categories ?? []).some((category) => isCategoryOff(category, disabledCategories))
    );
  };

  /** Whether a command's `allowed` check says yes; one that throws allows it. */
  const passesCheck = (definition: CommandDefinition, context: CommandContext): boolean => {
    if (!definition.allowed) return true;
    try {
      return definition.allowed(context);
    } catch {
      return true;
    }
  };

  /**
   * Why a lock holds the setting a command changes, as the key of the sentence that says so (the
   * lock's `reasonKey`, else `commands.locked.default`), or `null` while nothing holds it; a
   * `locked` that throws is no lock.
   */
  const lockedKeyOf = (definition: CommandDefinition, context: CommandContext): string | null => {
    if (!definition.locked) return null;
    let lock: SettingLock | null;
    try {
      lock = definition.locked(context);
    } catch {
      return null;
    }
    return lock === null ? null : (lock.reasonKey ?? DEFAULT_LOCKED_KEY);
  };

  /**
   * Why its document's session may not run a command, as the key of the sentence that says
   * so, or `null` when it may: the first permission `requires` names that the session doesn't
   * hold (`commands.notAllowed.doc-print`), else its `allowed` check saying no (its
   * `notAllowedKey`). With no document open there is no session to ask, and nothing is refused.
   */
  const notAllowedKeyOf = (
    definition: CommandDefinition,
    context: CommandContext,
  ): string | null => {
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
  const refusalOf = (
    definition: CommandDefinition,
    context: CommandContext,
  ): CommandRefusal | null => {
    const t = translateOf(context);
    const label = () => labelOf(definition, labelParamsOf(definition, context), t);
    if (isTurnedOff(definition)) {
      return { reason: 'turned-off', message: turnedOffMessage(label(), t) };
    }
    const notAllowed = notAllowedKeyOf(definition, context);
    if (notAllowed !== null) {
      return { reason: 'not-allowed', message: notAllowedMessage(notAllowed, label(), t) };
    }
    const locked = lockedKeyOf(definition, context);
    return locked === null
      ? null
      : { reason: 'locked', message: lockedMessage(locked, label(), t) };
  };

  return { isTurnedOff, notAllowedKeyOf, lockedKeyOf, refusalOf };
}
