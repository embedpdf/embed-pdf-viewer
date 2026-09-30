import { visit } from 'unist-util-visit';

/**
 * The headless docs, written for each framework (docs/conventions/docs-architecture.md).
 *
 * A page is written once, with names the React way in backticks: `useSearch()`, `<SearchLayer>`,
 * `@embedpdf/react/search`. Each framework's page shows its own name for the same thing:
 * `inject(EpdfSearch)` and `<epdf-search-layer>` on Angular, `@embedpdf/vue/search` on Vue.
 *
 * Three parts, shared by both sites and the Markdown export:
 *
 * - `remarkFrameworkNames` marks every inline code span of a headless page with its context
 *   (a props, State or Events table, or prose), at compile time;
 * - `frameworkName(text, framework, context)` gives the framework's name, at render time;
 * - `frameworkHref(href, framework)` keeps the reader's framework in every docs link.
 *
 * Plain ESM (not TypeScript) so `next.config.ts` can load it without a transpile step.
 */

/** @typedef {'react' | 'vue' | 'svelte' | 'angular'} Framework */
/** @typedef {'name' | 'prop' | 'state' | 'event'} NameContext */

export const FRAMEWORKS = /** @type {const} */ (['react', 'vue', 'svelte', 'angular']);

export const FRAMEWORK_LABELS = {
  react: 'React',
  vue: 'Vue',
  svelte: 'Svelte',
  angular: 'Angular',
};

/** `<Word of="…" />`: the words that differ per framework. */
export const FRAMEWORK_WORDS = {
  hook: { react: 'hook', vue: 'composable', svelte: 'function', angular: 'service' },
  hooks: { react: 'hooks', vue: 'composables', svelte: 'functions', angular: 'services' },
  rerenders: { react: 're-renders', vue: 'updates', svelte: 'updates', angular: 'updates' },
  props: { react: 'props', vue: 'props', svelte: 'props', angular: 'inputs' },
  renderFunction: {
    react: 'render function',
    vue: 'scoped slot',
    svelte: 'snippet',
    angular: 'template',
  },
};

// ── names ───────────────────────────────────────────────────────────────────

/** The plugins whose hooks follow the `use<Plugin>…()` pattern. */
const PLUGINS = [
  'Actions',
  'Annotation',
  'Commands',
  'Comments',
  'Documents',
  'Form',
  'I18n',
  'Interaction',
  'Link',
  'Measurement',
  'Metadata',
  'PageEdit',
  'Redaction',
  'Render',
  'Search',
  'Selection',
  'Shell',
  'Signature',
  'Stage',
  'Stamp',
  'ViewManager',
];

/** EmbedPDF's components; any other capitalized tag is the reader's own and stays as written. */
const COMPONENTS = new Set([
  'AnnotationDraftMenu',
  'FormLayer',
  'AnnotationLayer',
  'AnnotationMenu',
  'Anchored',
  'DocumentGate',
  'DocumentScope',
  'FormLayer',
  'LinkLayer',
  'PageView',
  'RenderLayer',
  'Scrollbar',
  'SearchLayer',
  'SelectionClipboard',
  'SelectionHandles',
  'SelectionLayer',
  'SelectionMenu',
  'Stage',
  'Toolbar',
  'Viewer',
]);

/**
 * Angular's name for each hook that isn't a plain `use<Plugin>()` (the Angular design:
 * docs/plans/2026-09-30-angular-adapter.md in the platform repo). A value that changes is a
 * signal on the plugin's service; one that takes arguments is a method that returns a signal.
 * App-wide setup is a provider feature, a behavior on your own element is a directive, and
 * translation is a pipe. `[without arguments, with arguments]`; `$args` is replaced.
 */
const ANGULAR_HOOKS = {
  // The Stage is a component: `#stage="epdfStage"`, `viewChild(EpdfStage)`, `inject(EpdfStage)` inside.
  useStage: ['EpdfStage'],
  useStageState: ['EpdfStage'],
  useStageSettings: ['stage.settings()'],
  useScrollMetrics: ['stage.scrollMetrics()'],
  useDocument: ['inject(EpdfDocument)'],
  usePageList: ['document.pages()'],
  useSearchHits: ['search.hits()', 'search.hitsOn($args)'],
  useAnnotationList: ['annotation.watch()', 'annotation.watch($args)'],
  useAnnotationAnchor: ['annotation.anchorOf($args)', 'annotation.anchorOf($args)'],
  useAnnotationDefaults: ['annotation.tools.defaultsOf($args)', 'annotation.tools.defaultsOf($args)'],
  useAnnotationProperties: ['annotation.selection.properties()'],
  useCommentThreads: ['comments.threads()'],
  useCommentThread: ['comments.threadOf($args)', 'comments.threadOf($args)'],
  useToolCursor: ['interaction.overrideCursor()', 'interaction.overrideCursor($args)'],
  useSurface: ['shell.surface($args)', 'shell.surface($args)'],
  useFormValue: ['form.valueOf($args)', 'form.valueOf($args)'],
  usePendingRedactions: ['redaction.pending()', 'redaction.pendingOn($args)'],
  useMeasurementReadout: ['measurement.readout()', 'measurement.readoutOf($args)'],
  useSignerRows: ['signature.signerRows()'],
  usePageScale: ['measurement.scaleOf($args)', 'measurement.scaleOf($args)'],
  useStampLibraries: ['stamp.libraries()'],
  useStampAssets: ['stamp.assetsOf($args)', 'stamp.assetsOf($args)'],
  useStampAssetPreviewUrl: ['stamp.previewUrlOf($args)', 'stamp.previewUrlOf($args)'],
  useT: ['| epdfT'],
  useCommand: ['[epdfCommand]'],
  useRichTextEditor: ['[epdfRichTextEditor]'],
  useCommandShortcuts: ['withCommandShortcuts()'],
  useActionsUiAdapter: ['withActionsUi()', 'withActionsUi($args)'],
  useFilePickerProvider: ['withFilePicker()', 'withFilePicker($args)'],
};

/**
 * Angular templates whose plain name would clash: `epdfCommand` is the directive on your own
 * buttons, so the toolbar's command template is `epdfToolbarCommand`.
 */
const ANGULAR_TEMPLATES = {
  Command: 'ToolbarCommand',
  Custom: 'ToolbarCustom',
  Collapsed: 'ToolbarCollapsed',
  Separator: 'ToolbarSeparator',
  OverflowTrigger: 'ToolbarOverflowTrigger',
  OverflowMenu: 'ToolbarOverflowMenu',
};

/** Angular's name for each component that isn't an `<epdf-…>` element, with or without props. */
const ANGULAR_COMPONENTS = {
  Viewer: () => 'provideEmbedPdf()',
  DocumentScope: (props) => (props.includes('id') ? '[epdfDocumentScope]="id"' : '[epdfDocumentScope]'),
  DocumentGate: () => '*epdfDocumentGate',
};

const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const lowerFirst = (name) => name.charAt(0).toLowerCase() + name.slice(1);

/** `@embedpdf/react/search` → `@embedpdf/<framework>/search`. */
function packageName(text, framework) {
  return text.replace(/^@embedpdf\/react(?=\/|$)/, `@embedpdf/${framework}`);
}

/**
 * A component's prop: `onHitClick` is an event, `renderLink` custom drawing (a scoped slot, a
 * snippet, a template), the rest are values.
 */
function propName(name, framework) {
  const event = name.match(/^on([A-Z]\w*)$/);
  const render = name.match(/^render([A-Z]\w*)$/);
  if (framework === 'vue') {
    if (event) return `@${kebab(event[1])}`;
    return render ? `#${kebab(render[1])}` : kebab(name);
  }
  if (framework === 'svelte') return render ? lowerFirst(render[1]) : name;
  if (framework === 'angular') {
    if (event) return `(${lowerFirst(event[1])})`;
    return render ? `<ng-template epdf${ANGULAR_TEMPLATES[render[1]] ?? render[1]}>` : name;
  }
  return name;
}

/**
 * `<SearchLayer color onHitClick>` → `<epdf-search-layer color (hitClick)>` on Angular. A render
 * prop becomes what goes inside: `<LinkLayer renderLink>` → `<LinkLayer><template #link>` on Vue.
 */
function componentName(text, framework) {
  const match = text.match(/^<([A-Z]\w*)((?:\s+[A-Za-z]\w*)*)\s*(\/?)>$/);
  if (!match || !COMPONENTS.has(match[1])) return null;
  const [, tag, attributes, selfClosing] = match;
  const props = attributes.trim() ? attributes.trim().split(/\s+/) : [];
  if (framework === 'angular' && ANGULAR_COMPONENTS[tag]) return ANGULAR_COMPONENTS[tag](props);
  const renders = props.filter((prop) => /^render[A-Z]/.test(prop)).map((prop) => prop.slice(6));
  const values = props.filter((prop) => !/^render[A-Z]/.test(prop));
  const shownTag = framework === 'angular' ? `epdf-${kebab(tag)}` : tag;
  const open = `<${[shownTag, ...values.map((prop) => propName(prop, framework))].join(' ')}`;
  if (renders.length === 0) return `${open}${selfClosing ? ' /' : ''}>`;
  const inside = renders.map((name) =>
    framework === 'vue'
      ? `<template #${kebab(name)}>`
      : framework === 'svelte'
        ? `{#snippet ${lowerFirst(name)}()}`
        : `<ng-template epdf${ANGULAR_TEMPLATES[name] ?? name}>`,
  );
  return `${open}>${inside.join('')}`;
}

/** A hook (`useSearch()`, `useSearchState()`) or a plugin factory (`searchPlugin()`) on Angular. */
function angularCall(text) {
  // A value read off a hook: `useSearchState().hitCount` → `search.hitCount()` (a signal).
  const member = text.match(/^use([A-Z]\w*?)(State)?\(\)\.(\w+)$/);
  if (member && (PLUGINS.includes(member[1]) || member[1] === 'Document')) {
    return `${lowerFirst(member[1])}.${member[3]}()`;
  }
  const call = text.match(/^(use[A-Z]\w*)(?:\((.*)\))?$/);
  const named = call && ANGULAR_HOOKS[call[1]];
  if (named) {
    const args = (call[2] ?? '').trim();
    const [withoutArgs, withArgs = withoutArgs] = named;
    return (args ? withArgs : withoutArgs).replace('$args', args);
  }
  const hook = text.match(/^use([A-Z]\w*?)(State)?\(\)$/);
  if (hook && PLUGINS.includes(hook[1])) return `inject(Epdf${hook[1]})`;
  const settings = text.match(/^use([A-Z]\w*?)Settings\(\)$/);
  if (settings && PLUGINS.includes(settings[1])) return `inject(Epdf${settings[1]}).settings()`;
  const factory = text.match(/^([a-z]\w*)Plugin\((.*)\)$/);
  if (factory) {
    const plugin = factory[1].charAt(0).toUpperCase() + factory[1].slice(1);
    if (PLUGINS.includes(plugin) || plugin === 'Annotation') return `with${plugin}(${factory[2]})`;
  }
  return null;
}

/**
 * The name a framework's page shows for a name written the React way. A name the rules don't
 * know is shown as written.
 *
 * @param {string} text the inline code, as written in the MDX
 * @param {Framework} framework
 * @param {NameContext} [context] where it stands: a props, State or Events table, or prose
 * @returns {string}
 */
export function frameworkName(text, framework, context = 'name') {
  if (framework === 'react' || !FRAMEWORKS.includes(framework)) return text;
  if (text.startsWith('@embedpdf/react')) return packageName(text, framework);

  if (context === 'prop' && /^[A-Za-z]\w*$/.test(text)) return propName(text, framework);
  if (context === 'event' && framework === 'angular') {
    // A plugin's events are RxJS streams on its Angular service: `onCompleted` → `completed$`.
    return text.replace(/(^|\.)on([A-Z]\w*)$/, (_, dot, name) => `${dot}${lowerFirst(name)}$`);
  }
  if (context === 'state' && framework === 'angular' && /^[a-z]\w*$/.test(text)) {
    return `${text}()`; // every State value is a signal
  }

  const component = componentName(text, framework);
  if (component) return component;
  if (framework === 'angular') return angularCall(text) ?? text;
  return text;
}

/**
 * The framework a docs page is for: the `<fw>` in `/docs/headless/<fw>/…` or
 * `/docs/viewer/<fw>/…`. React for every other page.
 *
 * @param {string} pathname
 * @returns {Framework}
 */
export function frameworkFromPath(pathname) {
  const [, docs, product, variant] = pathname.split('/');
  if (docs === 'docs' && (product === 'headless' || product === 'viewer') && FRAMEWORKS.includes(variant)) {
    return /** @type {Framework} */ (variant);
  }
  return 'react';
}

// ── standard sentences ─────────────────────────────────────────────────────

/**
 * The sentence that opens every `## State` section, in a framework's terms, as text and code
 * parts (`<StateIntro hook="useSearchState()" />` on the page, the same words in the Markdown).
 *
 * @param {string} hook the React state hook, such as `useSearchState()`
 * @param {Framework} framework
 * @returns {Array<{ text: string, code?: boolean }>}
 */
export function stateIntroParts(hook, framework) {
  const name = { text: frameworkName(hook, framework), code: true };
  const readOnce = ' The method in the last column reads the same value once.';
  switch (framework) {
    case 'vue':
      return [
        { text: 'Everything ' },
        name,
        { text: ` gives you, as refs: your template updates when a value changes.${readOnce}` },
      ];
    case 'svelte':
      return [
        { text: 'Everything ' },
        name,
        {
          text: ` gives you, as one reactive object: read its fields, and your markup updates when they change.${readOnce}`,
        },
      ];
    case 'angular':
      return [
        { text: 'Every value is a signal on ' },
        name,
        { text: ': read it in a template or a ' },
        { text: 'computed()', code: true },
        { text: `, and your view updates when it changes.${readOnce}` },
      ];
    default:
      return [
        { text: 'Everything ' },
        name,
        { text: ` gives you. Your component re-renders when a value changes.${readOnce}` },
      ];
  }
}

// ── code blocks ─────────────────────────────────────────────────────────────

/** Plugin factories with an Angular feature of the same name (`feedbackPlugin()` → `withFeedback()`). */
const FACTORIES = [...PLUGINS, 'Feedback'];

/**
 * A framework-free code block as a framework shows it: `@embedpdf/react/…` imports become that
 * framework's package, and on Angular `annotationPlugin({ … })` becomes `withAnnotation({ … })`.
 * So one block of plugin settings serves every framework.
 *
 * @param {string} code
 * @param {Framework} framework
 * @returns {string}
 */
export function frameworkCode(code, framework) {
  if (framework === 'react' || !FRAMEWORKS.includes(framework)) return code;
  let out = code.replace(/@embedpdf\/react(?=[/'"])/g, `@embedpdf/${framework}`);
  if (framework === 'angular') {
    out = out.replace(/\b([a-z]\w*)Plugin\b/g, (whole, name) => {
      const plugin = name.charAt(0).toUpperCase() + name.slice(1);
      return FACTORIES.includes(plugin) ? `with${plugin}` : whole;
    });
  }
  return out;
}

const CODE_LANGS = new Set(['ts', 'tsx', 'js', 'jsx', 'typescript', 'javascript']);

// ── links ───────────────────────────────────────────────────────────────────

const DOCS_LINK = /^((?:https:\/\/www\.(?:embedpdf|cloudpdf)\.com)?\/docs\/(headless|viewer))(\/[^?#]*)?([?#].*)?$/;

/**
 * Keep the reader's framework in a docs link: `/docs/viewer` → `/docs/viewer/vue`, and
 * `https://www.cloudpdf.com/docs/headless/setup` → `…/docs/headless/vue/setup`. A link that
 * already names a framework, and every other link, stays as written.
 *
 * @param {string} href
 * @param {Framework} framework
 * @returns {string}
 */
export function frameworkHref(href, framework) {
  const match = href.match(DOCS_LINK);
  if (!match || !FRAMEWORKS.includes(framework)) return href;
  const [, base, product, rest = '', suffix = ''] = match;
  const first = rest.split('/')[1];
  const named = product === 'viewer' ? [...FRAMEWORKS, 'vanilla'] : FRAMEWORKS;
  if (first && named.includes(first)) return href;
  return `${base}/${framework}${rest}${suffix}`;
}

// ── contexts ────────────────────────────────────────────────────────────────

const textOf = (node) =>
  node.type === 'text' || node.type === 'inlineCode'
    ? node.value
    : (node.children ?? []).map(textOf).join('');

/**
 * Where each inline code span stands, so `frameworkName` knows what it names: a cell under a
 * `Prop` column is a prop, a `Field` cell in `## State` is a state value, a cell under an `Event`
 * column is an event. Everything else is a name.
 *
 * @param {unknown} tree an mdast tree
 * @returns {Map<unknown, NameContext>}
 */
export function inlineCodeContexts(tree) {
  const contexts = new Map();
  let section = '';
  for (const node of /** @type {{ children: any[] }} */ (tree).children ?? []) {
    if (node.type === 'heading' && node.depth === 2) section = textOf(node).trim();
    if (node.type !== 'table') continue;
    const headers = (node.children[0]?.children ?? []).map((cell) => textOf(cell).trim());
    node.children.slice(1).forEach((row) => {
      row.children.forEach((cell, index) => {
        const header = headers[index];
        const context =
          header === 'Prop'
            ? 'prop'
            : header === 'Field' && section === 'State'
              ? 'state'
              : header === 'Event'
                ? 'event'
                : null;
        if (!context) return;
        visit(cell, 'inlineCode', (code) => {
          contexts.set(code, context);
        });
      });
    });
  }
  return contexts;
}

/**
 * Remark: on headless pages, every inline code span becomes `<FwCode value context />`, which
 * shows the reader's framework's name for it, and a code block that reads differently per framework
 * (`frameworkCode`) becomes one `<FwVariant frameworks="…">` per group of frameworks that read it
 * the same.
 */
export function remarkFrameworkNames() {
  return (tree, file) => {
    const path = String(file?.path ?? file?.history?.[0] ?? '');
    if (!/[/\\]docs[/\\]headless[/\\]/.test(path)) return;
    visit(tree, 'code', (node, index, parent) => {
      if (!parent || typeof index !== 'number' || !CODE_LANGS.has(node.lang ?? '')) return;
      const groups = new Map();
      for (const framework of FRAMEWORKS) {
        const value = frameworkCode(node.value, framework);
        groups.set(value, [...(groups.get(value) ?? []), framework]);
      }
      if (groups.size === 1) return;
      const variants = [...groups].map(([value, frameworks]) => ({
        type: 'mdxJsxFlowElement',
        name: 'FwVariant',
        attributes: [{ type: 'mdxJsxAttribute', name: 'frameworks', value: frameworks.join(' ') }],
        children: [{ ...node, value }],
      }));
      parent.children.splice(index, 1, ...variants);
      return index + variants.length;
    });
    const contexts = inlineCodeContexts(tree);
    visit(tree, 'inlineCode', (node, index, parent) => {
      // Headings stay plain text: the table of contents reads them.
      if (!parent || typeof index !== 'number' || parent.type === 'heading') return;
      parent.children[index] = {
        type: 'mdxJsxTextElement',
        name: 'FwCode',
        attributes: [
          { type: 'mdxJsxAttribute', name: 'value', value: node.value },
          { type: 'mdxJsxAttribute', name: 'context', value: contexts.get(node) ?? 'name' },
        ],
        children: [],
      };
    });
  };
}
