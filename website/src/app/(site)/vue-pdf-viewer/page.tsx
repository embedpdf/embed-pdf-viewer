import {
  ColorsIcon,
  DashboardSpeed01Icon,
  FileSecurityIcon,
  PuzzleIcon,
  Settings01Icon,
  SparklesIcon,
  TranslateIcon,
  ViewIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Metadata } from 'next';

import {
  FRAMEWORK_PAGE,
  headlessDocs,
  viewerDocs,
} from '@/components/site/framework-page/framework';
import {
  ClosingCta,
  FaqList,
  FeatureGrid,
  FrameworkHero,
  FrameworkJsonLd,
  ReasonGrid,
  SplitShowcase,
  TextLink,
  TwoPaths,
  type Faq,
} from '@/components/site/framework-page/sections';

/*
 * /vue-pdf-viewer — the Vue landing page. Its angle: a PDF viewer that
 * behaves like a Vue component. Props in, events out, slots for your own
 * parts, composables that give you refs, and Nuxt without <ClientOnly>.
 * It leads with the choice between the two packages, because Vue teams
 * often start ready-made and go custom later.
 *
 * Every code sample is a docs snippet (docs/content/snippets), so the code
 * here is code the docs compile; the hero's is only reflowed to fit its card.
 */

const TITLE = 'Vue PDF Viewer for Vue 3 and Nuxt | EmbedPDF';
const DESCRIPTION =
  'A free, open source PDF viewer for Vue 3 and Nuxt. One component for search, annotations, forms and signatures, or composables to build your own UI.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: FRAMEWORK_PAGE.vue },
  openGraph: { title: TITLE, description: DESCRIPTION, url: FRAMEWORK_PAGE.vue, type: 'website' },
};

const glyph = (icon: typeof ViewIcon, size = 14) => (
  <HugeiconsIcon icon={icon} size={size} strokeWidth={2} className="text-ep-blue" />
);

const FAQS: Faq[] = [
  {
    question: 'Does it work with Nuxt?',
    answer:
      'Yes. Use <PDFViewer> in any Nuxt page or component. The package is safe to import on the server, so you don’t need <ClientOnly> or a .client.vue file. The server renders an empty box of the size you set, and the viewer starts in the browser. A custom viewer built with the headless composables goes inside <ClientOnly>.',
  },
  {
    question: 'Which versions of Vue are supported?',
    answer:
      'Vue 3.4 and later. Both packages list vue >= 3.4 as their only peer dependency. Vue 2 is not supported.',
  },
  {
    question: 'How is EmbedPDF different from vue-pdf-embed?',
    answer:
      'vue-pdf-embed is a small component that draws PDF pages with PDF.js, with optional text and annotation layers. It leaves the rest to you: no toolbar, no search box, and no tools to add annotations, sign, or save a filled-in form back into the file. EmbedPDF includes all of that, ready to use, and runs on PDFium, the PDF engine inside Chrome.',
  },
  {
    question: 'How do I react to what happens in the viewer?',
    answer:
      'Listen to @ready. It gives you the viewer once it is live, and every feature is a plugin you reach by name, for example viewer.get("search"). In the headless package, event composables such as useSearchEvent() call your function when something happens, and stop listening when your component unmounts.',
  },
  {
    question: 'Can the viewer use my app’s language?',
    answer:
      'Yes. It speaks English, German, French, Spanish, Italian, Dutch, Portuguese, Polish, Swedish, Japanese, Simplified and Traditional Chinese, Korean, Arabic and Hebrew, and follows the browser by default. Bind locale to your own i18n setting to switch it, and use strings to change any label.',
  },
  {
    question: 'We use @embedpdf/vue-pdf-viewer from version 2. What changes?',
    answer:
      'The ready-made viewer is now @embedpdf/viewer-vue, and the headless composables live in @embedpdf/vue. The migration guide in the docs maps each version 2 name to its version 3 one.',
  },
  {
    question: 'Do I need a server or an API key?',
    answer:
      'No. The PDF engine runs as WebAssembly in a Web Worker in the browser, and its files are served from your own site. There is no account to create and no key to set.',
  },
  {
    question: 'Is it free for commercial projects?',
    answer:
      'Yes. EmbedPDF is open source under the Apache-2.0 license, so you can use it in paid and closed-source products at no cost.',
  },
];

export default function VuePdfViewerPage() {
  return (
    <main className="bg-ep-bg relative overflow-x-clip">
      <FrameworkJsonLd
        name="EmbedPDF for Vue"
        description={DESCRIPTION}
        url={FRAMEWORK_PAGE.vue}
        faqs={FAQS}
      />

      <FrameworkHero
        framework="vue"
        badge="Vue PDF Viewer"
        title={
          <>
            The <em className="ep-grad not-italic">Vue PDF viewer</em> that feels like Vue
          </>
        }
        intro="Props in, events out, slots for your own parts. Get a complete PDF viewer with a single tag, or build your own with composables that give you refs. Made for Vue 3 and Nuxt, free and open source."
        primary={{ href: viewerDocs('vue'), label: 'Start with Vue' }}
        code={{
          filename: 'App.vue',
          language: 'vue',
          code: `<script setup lang="ts">
import { PDFViewer } from '@embedpdf/viewer-vue';
</script>

<template>
  <PDFViewer
    src="/report.pdf"
    style="height: 100vh"
  />
</template>`,
        }}
        card={{
          title: 'Made for Vue 3',
          items: ['Vue 3.4 and later', 'Nuxt, no <ClientOnly>', '<script setup> ready'],
        }}
      />

      <TwoPaths
        eyebrow="Two packages"
        title={
          <>
            Start ready-made. <em className="ep-grad not-italic">Go custom</em> when you need to.
          </>
        }
        lead="Both run on the same engine and the same plugins, so nothing you learn in one is wasted in the other."
        viewer={{
          label: 'Ready-made viewer',
          title: 'A full viewer in one component',
          body: (
            <p>
              Toolbar, side panels, menus, dialogs and every feature, already designed and tested on
              phones and desktops. You set props, it does the rest.
            </p>
          ),
          bullets: [
            'Your brand color with one prop',
            '15 languages, right-to-left included',
            'Add, move or hide any button',
          ],
          install: 'npm install @embedpdf/viewer-vue',
          href: viewerDocs('vue'),
          cta: 'Vue viewer quick start',
        }}
        headless={{
          label: 'Headless',
          title: 'Composables and components',
          body: (
            <p>
              No ready-made UI at all. You get the PDF engine, the page view and every feature as
              composables, and you write the templates.
            </p>
          ),
          bullets: [
            'Composables that return refs',
            'Slots decide what each page shows',
            'Only the features you import are bundled',
          ],
          install: 'npm install @embedpdf/vue @embedpdf/engine',
          href: headlessDocs('vue'),
          cta: 'Vue headless quick start',
        }}
      />

      <SplitShowcase
        surface="white"
        eyebrow="Composables"
        eyebrowIcon={glyph(PuzzleIcon)}
        title={
          <>
            Composables that hand you <em className="ep-grad not-italic">refs</em>
          </>
        }
        body={
          <>
            <p>
              Every feature comes with composables you call in <code>&lt;script setup&gt;</code>.{' '}
              <code>useStage()</code> gives you the actions, like <code>zoomIn()</code>.{' '}
              <code>useStageState()</code> gives you refs to show, like <code>zoomLevel</code>.
            </p>
            <p>
              When the zoom changes, from your button, a pinch or a line of code, your template
              updates by itself. No watchers to wire up, no manual sync.
            </p>
          </>
        }
        points={[
          'The action object never changes, so it is safe in watchers and handlers',
          'Event composables stop listening when the component unmounts',
          'The same pattern for search, annotations, forms and every other feature',
        ]}
        code={{
          filename: 'ZoomControls.vue',
          language: 'vue',
          code: `<script setup lang="ts">
import { useStage, useStageState } from '@embedpdf/vue/stage';

const stage = useStage();
const { zoomLevel } = useStageState();
</script>

<template>
  <div>
    <button @click="stage.zoomOut()">−</button>
    <span>{{ Math.round(zoomLevel * 100) }}%</span>
    <button @click="stage.zoomIn()">+</button>
  </div>
</template>`,
        }}
        links={<TextLink href={headlessDocs('vue')}>How the composables work</TextLink>}
      />

      <SplitShowcase
        reverse
        eyebrow="Slots"
        eyebrowIcon={glyph(Settings01Icon)}
        title={
          <>
            Your own Vue components, <em className="ep-grad not-italic">inside the toolbar</em>
          </>
        }
        body={
          <>
            <p>
              The ready-made viewer is not a closed box. Put any of your components in a{' '}
              <code>&lt;ToolbarItem&gt;</code> slot and tell the layout where it goes.
            </p>
            <p>
              It stays your component: your styles, your Pinia stores, your props. The viewer only
              decides where it sits.
            </p>
          </>
        }
        points={[
          'Place it at the start or end of any toolbar',
          'Add your own commands with an icon and a tooltip',
          'Arrow keys reach it, like any built-in button',
        ]}
        code={{
          filename: 'App.vue',
          language: 'vue',
          code: `<script setup lang="ts">
import { PDFViewer, ToolbarItem, type Layout } from '@embedpdf/viewer-vue';
import DocumentStatus from './DocumentStatus.vue';

const layout = (layout: Layout) => layout.add({ custom: 'status' }, { to: 'main', section: 'end' });
</script>

<template>
  <PDFViewer src="/report.pdf" :layout="layout" style="height: 100vh">
    <ToolbarItem id="status">
      <DocumentStatus />
    </ToolbarItem>
  </PDFViewer>
</template>`,
        }}
        links={
          <TextLink href={viewerDocs('vue', 'customize/components')}>
            Your own components in the viewer
          </TextLink>
        }
      />

      <ReasonGrid
        surface="white"
        eyebrow="Why Vue teams pick it"
        eyebrowIcon={glyph(SparklesIcon)}
        title={
          <>
            Less to build, <em className="ep-grad not-italic">less to worry about</em>
          </>
        }
        lead="The things that usually take weeks are already done, tested and open source."
        reasons={[
          {
            icon: glyph(FileSecurityIcon, 22),
            title: 'Files stay on the device',
            body: 'The PDF engine runs in the browser, in a Web Worker. Nothing is uploaded, and nothing is fetched from a third party.',
          },
          {
            icon: glyph(ViewIcon, 22),
            title: 'The engine inside Chrome',
            body: 'PDFium, the engine Chrome uses to show PDFs, compiled to WebAssembly. Odd fonts and complex files look right.',
          },
          {
            icon: glyph(DashboardSpeed01Icon, 22),
            title: 'Smooth with big files',
            body: 'Only the pages on screen are drawn, so a report with hundreds of pages scrolls as easily as a one-page invoice.',
          },
          {
            icon: glyph(TranslateIcon, 22),
            title: 'Speaks 15 languages',
            body: 'It follows the browser, or your own locale. Arabic and Hebrew flip the whole layout right-to-left.',
          },
          {
            icon: glyph(ColorsIcon, 22),
            title: 'Looks like your app',
            body: 'One accent color restyles every button and handle. Light, dark or system, switched with a prop.',
          },
          {
            icon: glyph(Settings01Icon, 22),
            title: 'Only what you need',
            body: (
              <p>
                Turn features off with <code>disable</code>, or make the whole viewer read-only with{' '}
                <code>readOnly</code>. Both can change while the viewer runs.
              </p>
            ),
          },
        ]}
      />

      <SplitShowcase
        eyebrow="Nuxt"
        eyebrowIcon={glyph(DashboardSpeed01Icon)}
        title={
          <>
            Nuxt? <em className="ep-grad not-italic">No &lt;ClientOnly&gt;</em> needed.
          </>
        }
        body={
          <>
            <p>
              PDF libraries usually crash on the server, because they reach for the browser the
              moment you import them. So you wrap them in <code>&lt;ClientOnly&gt;</code> and live
              with the flash.
            </p>
            <p>
              <code>@embedpdf/viewer-vue</code> is safe to import on the server. Nuxt renders an
              empty box of the right size, the page does not jump, and the viewer starts as soon as
              the page loads in the browser.
            </p>
          </>
        }
        points={[
          'Works the same in Nuxt, Vite and any Vue 3 setup',
          'The engine’s WebAssembly is served from your own site',
          'Runs under a strict Content Security Policy',
        ]}
        code={{
          filename: 'pages/report.vue',
          language: 'vue',
          code: `<!-- pages/report.vue in Nuxt: no <ClientOnly> needed. -->
<script setup lang="ts">
import { PDFViewer } from '@embedpdf/viewer-vue';
</script>

<template>
  <PDFViewer src="/report.pdf" style="height: 100vh" />
</template>`,
        }}
        links={<TextLink href={viewerDocs('vue', 'setup')}>Setup and server rendering</TextLink>}
      />

      <FeatureGrid
        eyebrow="Features"
        eyebrowIcon={glyph(SparklesIcon)}
        title={
          <>
            More than a <em className="ep-grad not-italic">PDF preview</em>
          </>
        }
        lead="Your users don't just look at PDFs. They mark them up, fill them in and sign them. All of that is built in."
        features={[
          {
            image: '/cap-search.svg',
            title: 'Find anything',
            body: 'Type a word and see every match highlighted in the pages and listed in a panel.',
            href: headlessDocs('vue', 'text/search'),
          },
          {
            image: '/cap-annotation.svg',
            title: 'Mark it up',
            body: 'Highlights, drawings, shapes, text boxes and sticky notes with replies.',
            href: viewerDocs('vue', 'features/annotations'),
          },
          {
            image: '/cap-stamps.svg',
            title: 'Stamp it',
            body: 'The standard PDF stamps, your own designs, or any image.',
            href: headlessDocs('vue', 'annotations/stamps'),
          },
          {
            image: '/cap-forms.svg',
            title: 'Fill it in',
            body: 'Text fields, checkboxes and dropdowns, saved back into the PDF.',
            href: viewerDocs('vue', 'features/forms-and-signatures'),
          },
          {
            image: '/cap-signature.svg',
            title: 'Sign it',
            body: 'Draw, type or upload a signature and place it on the page.',
            href: headlessDocs('vue', 'forms/signatures'),
          },
          {
            image: '/cap-redaction.svg',
            title: 'Black it out',
            body: 'Remove private text and images from the file itself, not just cover them.',
            href: headlessDocs('vue', 'annotations/redaction'),
          },
        ]}
        links={<TextLink href={viewerDocs('vue', 'features')}>All viewer features</TextLink>}
      />

      <FaqList
        eyebrow="FAQ"
        title={
          <>
            Questions from <em className="ep-grad not-italic">Vue developers</em>
          </>
        }
        lead="Can't find yours? Ask in GitHub Discussions."
        faqs={FAQS}
      />

      <ClosingCta
        framework="vue"
        title={
          <>
            Give your Vue app <em className="ep-grad-blue not-italic">a real PDF viewer</em>
          </>
        }
        body="One install and one tag. Your users get search, annotations, forms and signatures today, and you keep full control for tomorrow."
        install={{
          filename: 'Terminal',
          language: 'bash',
          code: 'npm install @embedpdf/viewer-vue',
        }}
        primary={{ href: viewerDocs('vue'), label: 'Read the Vue docs' }}
        secondary={{ href: '/demo', label: 'Open the live demo' }}
      />
    </main>
  );
}
