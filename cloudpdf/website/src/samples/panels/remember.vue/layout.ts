import type { ShellSnapshot } from '@embedpdf/vue/shell';

// The browser may refuse storage, in a private window: then nothing is remembered.
export const loadLayout = (): ShellSnapshot | null => {
  try {
    return JSON.parse(localStorage.getItem('panels') ?? 'null') as ShellSnapshot | null;
  } catch {
    return null;
  }
};

export const saveLayout = (snapshot: ShellSnapshot) => {
  try {
    localStorage.setItem('panels', JSON.stringify(snapshot));
  } catch {
    // Not remembered this time.
  }
};
