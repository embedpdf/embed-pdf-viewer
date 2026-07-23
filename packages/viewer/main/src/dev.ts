/**
 * Dev harness — the vanilla one-liner PLUS one rung of the customization
 * ladder, so `pnpm dev` in this package always exercises the whole boundary:
 * init → element → preact chrome → engine worker, and the config pass-through.
 */
import EmbedPDF from './index';

EmbedPDF.init({
  target: '#viewer',
  src: '/ebook.pdf',
  icons: {
    send: ['M10 14L21 3', 'M21 3l-6.5 18a.5.5 0 0 1-1 0L10 14l-7-3.5a.5.5 0 0 1 0-1L21 3z'],
  },
  strings: {
    en: { 'demo-dev.send': 'Send for signature' },
    es: { 'demo-dev.send': 'Enviar para firmar' },
  },
  commands: [
    {
      id: 'dev:send',
      labelKey: 'demo-dev.send',
      icon: 'send',
      shortcut: 'Mod+Shift+S',
      enabled: (ctx) => ctx.documentId !== null,
      run: (ctx) => console.log('[dev:send] run for', ctx.documentId),
    },
  ],
  chrome: (base, h) =>
    h.addItem(base, { bar: 'main', section: 'end', group: 'panels', item: 'dev:send' }),
});
