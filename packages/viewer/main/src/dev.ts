/**
 * Dev harness — the vanilla one-liner PLUS one rung of each door, so
 * `pnpm dev` in this package always exercises the whole boundary:
 * init → element → preact chrome → engine worker, the config pass-through,
 * and the DRIVE door (el.viewer from plain page script).
 */
import EmbedPDF, { AnnotationToken } from './index';

const el = EmbedPDF.init({
  target: '#viewer',
  src: '/ebook.pdf',
  // THEME door: --ep-* token overrides, both modes + dark-specific.
  theme: {
    tokens: {
      accent: '#7c3aed',
      'accent-hover': '#6d28d9',
      'accent-active': '#5b21b6',
      'accent-light': '#f5f3ff',
      selected: '#f5f3ff',
    },
    dark: { accent: '#a78bfa', 'accent-light': '#2e1065', selected: '#2e1065' },
  },
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

// ── DRIVE: plain page script, no framework, no chrome involvement ────────────
el.addEventListener('epdf:ready', () => {
  const viewer = el.viewer!;
  console.log('[drive] epdf:ready — documents:', viewer.documents.list());

  // commands: the UI vocabulary, from OUTSIDE the viewer
  document.querySelector<HTMLButtonElement>('#zoom-in')!.onclick = () => viewer.execute('zoom:in');
  document.querySelector<HTMLButtonElement>('#zoom-out')!.onclick = () =>
    viewer.execute('zoom:out');

  // watch: the one reactivity primitive — active document…
  const docLabel = document.querySelector('#doc-label')!;
  viewer.watch(
    () => viewer.documents.activeId(),
    (id) => (docLabel.textContent = id ? `active: ${id}` : 'no document'),
  );

  // …and a PUBLIC capability lens (annotation selection), fully typed
  const selLabel = document.querySelector('#selection-label')!;
  viewer.watch(
    () => viewer.tryGet(AnnotationToken)?.getSelected().length ?? 0,
    (n) => (selLabel.textContent = n ? `${n} annotation(s) selected` : ''),
  );
});
el.addEventListener('epdf:documentchange', (e) =>
  console.log('[drive] epdf:documentchange', (e as CustomEvent).detail),
);
