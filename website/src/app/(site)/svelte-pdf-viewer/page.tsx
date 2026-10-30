import {
  CodeIcon,
  FileSecurityIcon,
  FlashIcon,
  MagicWand01Icon,
  PackageIcon,
  PuzzleIcon,
  SparklesIcon,
  ZapIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Metadata } from 'next';

import {
  FRAMEWORK_PAGE,
  headlessDocs,
  viewerDocs,
} from '@/components/site/framework-page/framework';
import {
  Cell,
  ClosingCta,
  CodeSteps,
  CompareTable,
  FaqList,
  FeatureGrid,
  FrameworkHero,
  FrameworkJsonLd,
  ReasonGrid,
  SplitShowcase,
  TextLink,
  type Faq,
} from '@/components/site/framework-page/sections';

/*
 * /svelte-pdf-viewer — the Svelte landing page. Its angle: written for
 * Svelte 5, not ported to it. Runes for state, snippets for custom parts,
 * callback props for events, and SvelteKit without browser checks. Its
 * comparison is against building the viewer yourself on PDF.js, which is
 * what most Svelte developers end up doing.
 *
 * Every code sample is a docs snippet (docs/content/snippets), so the code
 * here is code the docs compile; the hero's is only reflowed to fit its card.
 */

const TITLE = 'Svelte PDF Viewer for Svelte 5 and SvelteKit | EmbedPDF';
const DESCRIPTION =
  'An open source PDF viewer written for Svelte 5 and SvelteKit. One tag for search, annotations, forms and signatures, or runes to build your own UI.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: FRAMEWORK_PAGE.svelte },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: FRAMEWORK_PAGE.svelte,
    type: 'website',
  },
};

const glyph = (icon: typeof CodeIcon, size = 14) => (
  <HugeiconsIcon icon={icon} size={size} strokeWidth={2} className="text-ep-blue" />
);

const FAQS: Faq[] = [
  {
    question: 'Does it work with Svelte 4?',
    answer:
      'No. EmbedPDF is written for Svelte 5 (5.29 or later). It uses runes for state, snippets for custom parts and callback props for events. If your app is still on Svelte 4, the official Svelte migration tool can move most code over for you.',
  },
  {
    question: 'Does it work with SvelteKit and server rendering?',
    answer:
      'Yes. Import <PDFViewer> in a +page.svelte file and use it. The package is safe to import on the server, so you don’t need {#if browser}, onMount or ssr = false. The server renders an empty box of the right size, and the viewer starts in the browser.',
  },
  {
    question: 'I used @embedpdf/svelte-pdf-viewer in version 2. Is there an upgrade path?',
    answer:
      'Yes. Version 3 calls the ready-made viewer @embedpdf/viewer-svelte. Swap the package, then follow the migration guide in the docs. Note that version 3 needs Svelte 5.',
  },
  {
    question: 'Can I use it without SvelteKit?',
    answer:
      'Yes. It works in any Svelte 5 app, for example a plain Vite project. The engine’s WebAssembly is part of your build, so there is nothing extra to copy or host.',
  },
  {
    question: 'How do I build my own toolbar?',
    answer:
      'You have two options. Keep the ready-made viewer and add your own Svelte components to its toolbar with <ToolbarItem>. Or install @embedpdf/svelte, the headless package, and build the whole UI yourself with functions like useStage() and useSearchState().',
  },
  {
    question: 'How is it different from other Svelte PDF components?',
    answer:
      'Most Svelte PDF components wrap PDF.js and focus on showing pages, sometimes with zoom and a basic search. EmbedPDF is a full document viewer: annotations, comments, stamps, forms, signatures and redaction, saved into the PDF. It runs on PDFium, the engine inside Chrome.',
  },
  {
    question: 'Do my users’ files leave their device?',
    answer:
      'No. The engine runs in a Web Worker in the browser. PDFs are opened, changed and saved on the device, and nothing is fetched from a third party at runtime.',
  },
  {
    question: 'What does it cost?',
    answer:
      'Nothing. EmbedPDF is open source under the Apache-2.0 license, free for personal and commercial use.',
  },
];

export default function SveltePdfViewerPage() {
  return (
    <main className="bg-ep-bg relative overflow-x-clip">
      <FrameworkJsonLd
        name="EmbedPDF for Svelte"
        description={DESCRIPTION}
        url={FRAMEWORK_PAGE.svelte}
        faqs={FAQS}
      />

      <FrameworkHero
        framework="svelte"
        badge="Svelte PDF Viewer"
        title={
          <>
            A <em className="ep-grad not-italic">Svelte PDF viewer</em> written for Svelte 5
          </>
        }
        intro="One tag and your users can read, search, mark up, fill in and sign PDFs. Want your own design? The headless parts speak runes and snippets, just like the rest of your Svelte 5 code. Free and open source."
        primary={{ href: viewerDocs('svelte'), label: 'Start with Svelte' }}
        code={{
          filename: '+page.svelte',
          language: 'svelte',
          code: `<script lang="ts">
  import { PDFViewer } from '@embedpdf/viewer-svelte';
</script>

<PDFViewer
  src="/report.pdf"
  style="height: 100vh"
/>`,
        }}
        card={{
          title: 'Svelte 5 native',
          items: ['Runes and snippets', 'SvelteKit SSR safe', 'Callback props, typed'],
        }}
      />

      <ReasonGrid
        eyebrow="Svelte-first"
        eyebrowIcon={glyph(SparklesIcon)}
        title={
          <>
            It feels at home in <em className="ep-grad not-italic">your Svelte code</em>
          </>
        }
        lead="Everything you touch from Svelte follows the patterns Svelte 5 introduced: runes, snippets and callback props."
        reasons={[
          {
            icon: glyph(ZapIcon, 22),
            title: 'State, the runes way',
            body: (
              <p>
                <code>useSearchState()</code> gives you one reactive object. Read{' '}
                <code>state.hitCount</code> in your markup and it updates by itself. No stores to
                subscribe to.
              </p>
            ),
          },
          {
            icon: glyph(PuzzleIcon, 22),
            title: 'Snippets for your parts',
            body: (
              <p>
                Pass a <code>{'{#snippet fallback()}'}</code> to show while a file opens. Whatever
                you put inside <code>&lt;Stage&gt;</code> is drawn on every page.
              </p>
            ),
          },
          {
            icon: glyph(CodeIcon, 22),
            title: 'Events are props',
            body: (
              <p>
                Listen with plain callback props like <code>onready</code>, the Svelte 5 way. No
                event dispatchers, and every callback is typed.
              </p>
            ),
          },
          {
            icon: glyph(PackageIcon, 22),
            title: 'Only what you import',
            body: 'Every feature is its own import path. Search, forms or redaction you don’t use never reach your bundle.',
          },
          {
            icon: glyph(FlashIcon, 22),
            title: 'Fine in SvelteKit',
            body: (
              <p>
                The ready-made viewer goes straight into <code>+page.svelte</code>. No{' '}
                <code>{'{#if browser}'}</code> checks and no <code>onMount</code> tricks.
              </p>
            ),
          },
          {
            icon: glyph(FileSecurityIcon, 22),
            title: 'Private by design',
            body: 'The PDF engine runs in a Web Worker in the browser. Your users’ files are never uploaded anywhere.',
          },
        ]}
      />

      <CodeSteps
        eyebrow="SvelteKit in 3 steps"
        title={
          <>
            Add it to a <em className="ep-grad not-italic">SvelteKit</em> app
          </>
        }
        lead="The same three steps work in a plain Svelte 5 + Vite project."
        steps={[
          {
            title: 'Install the viewer',
            body: (
              <p>
                <code>@embedpdf/viewer-svelte</code> brings the whole viewer: toolbar, panels and
                the PDF engine. It needs Svelte 5.
              </p>
            ),
            code: {
              filename: 'Terminal',
              language: 'bash',
              code: 'npm install @embedpdf/viewer-svelte',
            },
          },
          {
            title: 'Drop it into a route',
            body: (
              <p>
                Use it in any <code>+page.svelte</code>. It is safe to render on the server, so no
                guards are needed. Give it a height and it fills the box.
              </p>
            ),
            code: {
              filename: 'src/routes/report/+page.svelte',
              language: 'svelte',
              code: `<!-- src/routes/report/+page.svelte in SvelteKit: no {#if browser} needed. -->
<script lang="ts">
  import { PDFViewer } from '@embedpdf/viewer-svelte';
</script>

<PDFViewer src="/report.pdf" style="height: 100vh" />`,
            },
          },
          {
            title: 'Take control with onready',
            body: (
              <p>
                <code>onready</code> hands you the viewer once it is live. Every feature is a plugin
                you reach by name. This one searches each document for “total” when it opens.
              </p>
            ),
            code: {
              filename: '+page.svelte',
              language: 'svelte',
              code: `<script lang="ts">
  import { PDFViewer, type Viewer } from '@embedpdf/viewer-svelte';

  function onready(viewer: Viewer) {
    viewer.documents.onOpened(() => viewer.get('search').search({ text: 'total' }));
  }
</script>

<PDFViewer src="/report.pdf" {onready} style="height: 100vh" />`,
            },
          },
        ]}
        surface="white"
        footer={<TextLink href={viewerDocs('svelte')}>The full Svelte quick start</TextLink>}
      />

      <SplitShowcase
        eyebrow="Headless"
        eyebrowIcon={glyph(MagicWand01Icon)}
        title={
          <>
            Or build your own viewer with <em className="ep-grad not-italic">runes</em>
          </>
        }
        body={
          <>
            <p>
              Install <code>@embedpdf/svelte</code> and there is no ready-made UI at all. You get
              the engine, the page view and every feature as small functions. You write the markup.
            </p>
            <p>
              This search box is the whole thing: an input, a counter and two buttons. Style it
              however you like. The matches light up in the pages by themselves.
            </p>
          </>
        }
        points={[
          'Action objects never change, so they are safe in $effect',
          'Works with Tailwind, Skeleton, shadcn-svelte or your own CSS',
          'Every value and callback is typed',
        ]}
        code={{
          filename: 'Search.svelte',
          language: 'svelte',
          code: `<script lang="ts">
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { SearchLayer, useSearch, useSearchState } from '@embedpdf/svelte/search';
  import { Stage } from '@embedpdf/svelte/stage';

  const search = useSearch();
  const state = useSearchState();
</script>

<form onsubmit={(event) => event.preventDefault()}>
  <input oninput={(event) => search.search({ text: event.currentTarget.value })} />
  {#if state.status === 'searching'}
    <span>Searching…</span>
  {/if}
  {#if state.hitCount > 0}
    <span>{state.activeHitIndex + 1} of {state.hitCount}</span>
  {/if}
  <button type="button" onclick={() => search.previousHit()}>↑</button>
  <button type="button" onclick={() => search.nextHit()}>↓</button>
</form>

<Stage>
  <RenderLayer />
  <SearchLayer />
</Stage>`,
        }}
        links={<TextLink href={headlessDocs('svelte')}>Svelte headless docs</TextLink>}
      />

      <FeatureGrid
        eyebrow="In the box"
        eyebrowIcon={glyph(SparklesIcon)}
        title={
          <>
            Every tool, <em className="ep-grad not-italic">switched on</em>
          </>
        }
        lead="Your users get all of this on day one. Switch off what you don't need with the disable prop."
        features={[
          {
            image: '/cap-annotation.svg',
            title: 'Annotate',
            body: 'Highlight text, draw freehand, add shapes, notes and callouts. Ctrl+Z undoes.',
            href: viewerDocs('svelte', 'features/annotations'),
          },
          {
            image: '/cap-search.svg',
            title: 'Search',
            body: 'Every match highlighted on the page and listed in a side panel.',
            href: headlessDocs('svelte', 'text/search'),
          },
          {
            image: '/cap-forms.svg',
            title: 'Forms',
            body: 'Fill in existing forms, or add new fields in the form mode.',
            href: headlessDocs('svelte', 'forms'),
          },
          {
            image: '/cap-signature.svg',
            title: 'Signatures',
            body: 'Drawn, typed or uploaded, placed on a page or in a signature field.',
            href: headlessDocs('svelte', 'forms/signatures'),
          },
          {
            image: '/cap-redaction.svg',
            title: 'Redaction',
            body: 'Removes the text and images under the box from the file for good.',
            href: headlessDocs('svelte', 'annotations/redaction'),
          },
          {
            image: '/cap-thumbnails.svg',
            title: 'Page tools',
            body: 'Thumbnails, plus rotate, reorder, insert and delete pages.',
            href: headlessDocs('svelte', 'documents/pages'),
          },
        ]}
        links={
          <TextLink href={viewerDocs('svelte', 'features')}>Every feature, explained</TextLink>
        }
      />

      <CompareTable
        eyebrow="Build or install"
        title={
          <>
            What it takes to build this <em className="ep-grad not-italic">yourself</em>
          </>
        }
        lead="Many Svelte teams start with PDF.js and a canvas. It works, until the feature requests arrive."
        theirsLabel="Building it yourself on PDF.js"
        rows={[
          {
            topic: 'Show the pages',
            ours: <Cell yes>One tag</Cell>,
            theirs: <Cell yes>pdfjs-dist, a worker setup and a canvas per page</Cell>,
          },
          {
            topic: 'Long documents',
            ours: <Cell yes>Only the pages on screen are drawn</Cell>,
            theirs: <Cell yes={false}>You add virtual scrolling yourself</Cell>,
          },
          {
            topic: 'Search',
            ours: <Cell yes>Built in, with a list of every match</Cell>,
            theirs: <Cell yes={false}>A text layer, a find controller and your own search UI</Cell>,
          },
          {
            topic: 'Annotations',
            ours: <Cell yes>Standard PDF annotations, saved into the file</Cell>,
            theirs: <Cell yes={false}>Your own editor and your own save logic</Cell>,
          },
          {
            topic: 'Redaction',
            ours: <Cell yes>Content removed from the file</Cell>,
            theirs: <Cell yes={false}>Not possible with PDF.js alone</Cell>,
          },
          {
            topic: 'Phones and tablets',
            ours: <Cell yes>Pinch to zoom, menus that fit a small screen</Cell>,
            theirs: <Cell yes={false}>Touch handling and a mobile layout to design</Cell>,
          },
          {
            topic: 'Languages',
            ours: <Cell yes>15 built in, right-to-left included</Cell>,
            theirs: <Cell yes={false}>Every label to translate</Cell>,
          },
        ]}
        note="PDF.js is a great PDF renderer. The point is the weeks of UI work on top of it, which EmbedPDF has already done."
      />

      <FaqList
        surface="white"
        eyebrow="FAQ"
        title={
          <>
            Svelte PDF viewer, <em className="ep-grad not-italic">answered</em>
          </>
        }
        lead="Quick answers for Svelte and SvelteKit developers."
        faqs={FAQS}
      />

      <ClosingCta
        framework="svelte"
        title={
          <>
            Your next Svelte app <em className="ep-grad-blue not-italic">opens PDFs</em>
          </>
        }
        body="Install it, add one tag, and move on to the parts of your app that only you can build."
        install={{
          filename: 'Terminal',
          language: 'bash',
          code: 'npm install @embedpdf/viewer-svelte',
        }}
        primary={{ href: viewerDocs('svelte'), label: 'Read the Svelte docs' }}
        secondary={{ href: '/demo', label: 'Open the live demo' }}
      />
    </main>
  );
}
