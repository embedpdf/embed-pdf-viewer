import { custom, group, item } from '@embedpdf/vue/toolbar';
import type { BarSchema } from '@embedpdf/vue/toolbar';

// The page number is an item of your own: it gets smaller first, and in the "More" menu it's the
// 'page:go-to' command.
export const bar: BarSchema = {
  id: 'main',
  sections: {
    start: [group('zoom', ['zoom:out', 'zoom:in', item('zoom:fit-width', { importance: 2 })])],
    center: [
      group('pages', [
        'page:previous',
        custom('page-number', 'page:go-to', { variants: ['full', 'compact'] }),
        'page:next',
      ]),
    ],
    end: [group('document', [item('document:download', { variants: ['icon+label', 'icon'] })])],
  },
};

export const ICONS: Record<string, string> = {
  'previous-page': '‹',
  'next-page': '›',
  'zoom-out': '−',
  'zoom-in': '+',
  'fit-width': '↔',
  download: '↓',
};
