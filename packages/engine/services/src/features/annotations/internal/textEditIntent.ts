import type { CaretIntent, StrikeoutIntent } from '@embedpdf/engine-core/runtime';

/** Adobe-compatible `/IT` names, normalized at the engine-core boundary. */
const IT_REPLACE = 'Replace';
const IT_STRIKEOUT_TEXT_EDIT = 'StrikeOutTextEdit';

export function caretIntentToName(intent: CaretIntent): string {
  switch (intent) {
    case 'replace':
      return IT_REPLACE;
  }
}

export function caretIntentFromName(name: string | null): CaretIntent | null {
  return name === IT_REPLACE ? 'replace' : null;
}

export function strikeoutIntentToName(intent: StrikeoutIntent): string {
  switch (intent) {
    case 'strikeout-text-edit':
      return IT_STRIKEOUT_TEXT_EDIT;
  }
}

export function strikeoutIntentFromName(name: string | null): StrikeoutIntent | null {
  return name === IT_STRIKEOUT_TEXT_EDIT ? 'strikeout-text-edit' : null;
}
