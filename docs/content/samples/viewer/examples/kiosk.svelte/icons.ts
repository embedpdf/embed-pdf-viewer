/** The kiosk's icons: the viewer's, for its commands, and the big buttons draw them too. */
export const ICONS: Record<string, string[]> = {
  next: ['M5 12l14 0', 'M13 18l6 -6', 'M13 6l6 6'],
  clear: [
    'M19 20h-10.5l-4.21 -4.3a1 1 0 0 1 0 -1.41l10 -10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41l-9.2 9.3',
    'M18 13.3l-6.3 -6.3',
  ],
  done: ['M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M9 12l2 2l4 -4'],
};
