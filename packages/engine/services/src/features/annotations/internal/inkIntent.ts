import type { InkIntent } from '@embedpdf/engine-core/runtime';

export function inkIntentToName(intent: InkIntent): string {
  switch (intent) {
    case 'ink-highlight':
      return 'InkHighlight';
  }
}

export function inkIntentFromName(name: string | null): InkIntent | null {
  switch (name) {
    case 'InkHighlight':
      return 'ink-highlight';
    default:
      return null;
  }
}
