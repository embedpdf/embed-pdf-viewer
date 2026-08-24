/**
 * Shortcut parsing + matching — pure. No `navigator`: platform is an input
 * (`isMac`), decided by the embedder, same rule as plugin-i18n's locale.
 *
 * Grammar: modifiers and one key joined by '+', e.g. 'Mod+K', 'Ctrl+=',
 * 'Shift+Alt+D', 'Meta+NumpadAdd'. 'Mod' is ⌘ on mac and Ctrl elsewhere.
 * Keys longer than one character (F1, Escape, NumpadAdd, ArrowLeft) match
 * `event.key` OR `event.code` case-insensitively, so numpad shortcuts work.
 */

export interface ParsedShortcut {
  readonly key: string; // lowercase
  readonly mod: boolean; // platform-resolved at match time
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
}

/** The subset of KeyboardEvent the matcher reads — keeps this module DOM-free. */
export interface KeyStroke {
  readonly key: string;
  readonly code?: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

const MODIFIERS = new Set([
  'mod',
  'ctrl',
  'control',
  'meta',
  'cmd',
  'command',
  'alt',
  'option',
  'shift',
]);

export function parseShortcut(shortcut: string): ParsedShortcut {
  const tokens = shortcut.split('+').map((t) => t.trim());
  // 'Ctrl+=' splits to ['Ctrl', '', ''] — an empty tail means the key IS '+'.
  const keyToken = tokens[tokens.length - 1] === '' ? '+' : tokens[tokens.length - 1];
  const parsed = {
    key: keyToken.toLowerCase(),
    mod: false,
    ctrl: false,
    meta: false,
    alt: false,
    shift: false,
  };
  for (const token of tokens.slice(0, -1)) {
    const t = token.toLowerCase();
    if (t === '') continue; // artifact of a literal '+' key
    if (!MODIFIERS.has(t))
      throw new Error(`[ui-core] unknown modifier "${token}" in "${shortcut}"`);
    if (t === 'mod') parsed.mod = true;
    else if (t === 'ctrl' || t === 'control') parsed.ctrl = true;
    else if (t === 'meta' || t === 'cmd' || t === 'command') parsed.meta = true;
    else if (t === 'alt' || t === 'option') parsed.alt = true;
    else parsed.shift = true;
  }
  if (parsed.key === '') throw new Error(`[ui-core] empty key in shortcut "${shortcut}"`);
  return parsed;
}

export function matchShortcut(
  parsed: ParsedShortcut,
  stroke: KeyStroke,
  opts: { isMac: boolean },
): boolean {
  const wantCtrl = parsed.ctrl || (parsed.mod && !opts.isMac);
  const wantMeta = parsed.meta || (parsed.mod && opts.isMac);
  if (stroke.ctrlKey !== wantCtrl) return false;
  if (stroke.metaKey !== wantMeta) return false;
  if (stroke.altKey !== parsed.alt) return false;
  // Shift changes what `key` IS for printable characters ('=' vs '+'), so only
  // enforce declared shift; an undeclared shift is rejected for non-printables.
  if (parsed.shift && !stroke.shiftKey) return false;
  if (!parsed.shift && stroke.shiftKey && parsed.key.length > 1) return false;

  const key = stroke.key.toLowerCase();
  if (key === parsed.key) return true;
  // Long names ('numpadadd', 'f1', …) may be codes rather than keys.
  return (
    parsed.key.length > 1 && stroke.code !== undefined && stroke.code.toLowerCase() === parsed.key
  );
}

/** Display form for menu rows: '⌘K' on mac, 'Ctrl+K' elsewhere. */
export function formatShortcut(shortcut: string, opts: { isMac: boolean }): string {
  const parsed = parseShortcut(shortcut);
  const key = parsed.key.length === 1 ? parsed.key.toUpperCase() : capitalize(parsed.key);
  if (opts.isMac) {
    const mods = [
      parsed.ctrl ? '⌃' : '',
      parsed.alt ? '⌥' : '',
      parsed.shift ? '⇧' : '',
      parsed.meta || parsed.mod ? '⌘' : '',
    ].join('');
    return `${mods}${key}`;
  }
  const mods = [
    parsed.ctrl || parsed.mod ? 'Ctrl' : '',
    parsed.meta ? 'Meta' : '',
    parsed.alt ? 'Alt' : '',
    parsed.shift ? 'Shift' : '',
  ].filter(Boolean);
  return [...mods, key].join('+');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
