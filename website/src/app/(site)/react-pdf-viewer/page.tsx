import { CodeIcon, PaintBoardIcon, SparklesIcon } from '@hugeicons/core-free-icons';
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
  SplitShowcase,
  TextLink,
  type Faq,
} from '@/components/site/framework-page/sections';

/*
 * /react-pdf-viewer — the React landing page. Its angle: React developers
 * know react-pdf, which draws pages and stops there. This page shows what
 * comes after the pages (the toolbar, search, annotations, forms) and that
 * it's still plain React: one component, props, your own components inside
 * it, or hooks for a UI of your own.
 *
 * Every code sample is a docs snippet (docs/content/snippets), so the code
 * here is code the docs compile; the hero's is only reflowed to fit its card.
 */

const TITLE = 'React PDF Viewer: Open Source Component and Hooks | EmbedPDF';
const DESCRIPTION =
  'Add a full PDF viewer to your React app with one component, or build your own UI with hooks. Search, annotations, forms and signatures. Free and open source.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: FRAMEWORK_PAGE.react },
  openGraph: { title: TITLE, description: DESCRIPTION, url: FRAMEWORK_PAGE.react, type: 'website' },
};

const icon = (glyph: typeof CodeIcon) => (
  <HugeiconsIcon icon={glyph} size={14} strokeWidth={2} className="text-ep-blue" />
);

const FAQS: Faq[] = [
  {
    question: 'How is EmbedPDF different from react-pdf?',
    answer:
      'react-pdf is a good library for drawing PDF pages in React. It gives you a Document and a Page component on top of PDF.js, and everything around the pages is yours to build: the toolbar, zoom buttons, a search box, thumbnails, and any way to mark up the file. EmbedPDF gives you all of that ready to use, plus annotations, forms, signatures and redaction that are saved into the PDF itself. It runs on PDFium, the PDF engine inside Chrome, instead of PDF.js.',
  },
  {
    question: 'Does it work with the Next.js App Router?',
    answer:
      'Yes. <PDFViewer> is already a client component, so you can render it straight from a server component. There is no "use client" file to add, no dynamic import and no ssr: false. The server sends an empty box of the size you set, and the viewer starts in the browser. If you build your own UI with the headless hooks, mark that component "use client", like any component that uses hooks.',
  },
  {
    question: 'Which React versions are supported?',
    answer:
      'React 18 and React 19. The package lists react >= 18 as its only peer dependency, so it works with Vite, Next.js and any other setup that runs React 18 or later.',
  },
  {
    question: 'Can I style the viewer to match my app?',
    answer:
      'Yes. Pass your brand color with the theme prop, pick light, dark or system, and move, hide or add toolbar buttons with the layout. You can even put your own React components into the toolbar. If you want full control over every pixel, use the headless hooks from @embedpdf/react and build the UI with Tailwind, shadcn/ui, MUI or plain CSS.',
  },
  {
    question: 'Will Tailwind or my global CSS break the viewer?',
    answer:
      'No. The ready-made viewer draws inside a shadow DOM, so resets like Tailwind’s preflight can’t reach it. You style it on purpose instead: a theme prop for colors, and --epdf-* CSS variables for every color and corner.',
  },
  {
    question: 'I use @embedpdf/react-pdf-viewer from version 2. How do I move?',
    answer:
      'The package is now called @embedpdf/viewer-react. Install it in place of the old one and follow the migration guide in the docs, which maps each old config key and call to its new name.',
  },
  {
    question: 'Do my PDFs get uploaded anywhere?',
    answer:
      'No. The PDF engine runs as WebAssembly in a Web Worker inside the user’s browser. Files are opened, edited and saved on the device. The engine files are part of your own build, so nothing is fetched from a third party unless you set that up.',
  },
  {
    question: 'Is it free for commercial projects?',
    answer:
      'Yes. EmbedPDF is open source under the Apache-2.0 license. You can use it in commercial and closed-source products without paying, and without having to open source your own code.',
  },
  {
    question: 'How do I control the viewer from my own code?',
    answer:
      'Use the onReady prop. It hands you the viewer once it is live, and every feature is a plugin you reach by name: viewer.get("search").search({ text: "total" }) runs a search, for example. The headless docs describe every plugin’s methods.',
  },
];

export default function ReactPdfViewerPage() {
  return (
    <main className="bg-ep-bg relative overflow-x-clip">
      <FrameworkJsonLd
        name="EmbedPDF for React"
        description={DESCRIPTION}
        url={FRAMEWORK_PAGE.react}
        faqs={FAQS}
      />

      <FrameworkHero
        framework="react"
        badge="React PDF Viewer"
        title={
          <>
            The <em className="ep-grad not-italic">React PDF viewer</em> with the hard parts already
            built
          </>
        }
        intro="Add one component and your users can read, search, highlight, fill in and sign PDFs right inside your React app. Want your own look? Build it with our React hooks instead. Free and open source."
        primary={{ href: viewerDocs('react'), label: 'Start with React' }}
        code={{
          filename: 'App.tsx',
          language: 'tsx',
          code: `import { PDFViewer } from '@embedpdf/viewer-react';

export function App() {
  return (
    <PDFViewer
      src="/report.pdf"
      style={{ height: '100vh' }}
    />
  );
}`,
        }}
        card={{
          title: 'Fits your React stack',
          items: ['React 18 and 19', 'Next.js and Vite', 'Every prop typed'],
        }}
      />

      <CodeSteps
        eyebrow="Three steps"
        title={
          <>
            From <em className="ep-grad not-italic">npm install</em> to a working viewer
          </>
        }
        lead="No config file, no worker setup, no copying files into public/. The package brings the toolbar, the panels and the PDF engine."
        steps={[
          {
            title: 'Install the package',
            body: (
              <p>
                One package, <code>@embedpdf/viewer-react</code>. It works with React 18 and later.
              </p>
            ),
            code: {
              filename: 'Terminal',
              language: 'bash',
              code: 'npm install @embedpdf/viewer-react',
            },
          },
          {
            title: 'Render it, then talk to it',
            body: (
              <>
                <p>
                  Render <code>&lt;PDFViewer&gt;</code> with a file and a height. That is already a
                  full viewer.
                </p>
                <p>
                  When you need more, <code>onReady</code> hands you the viewer. Here it searches
                  every document for “total” as soon as it opens.
                </p>
              </>
            ),
            code: {
              filename: 'App.tsx',
              language: 'tsx',
              code: `import { PDFViewer, type Viewer } from '@embedpdf/viewer-react';

function onReady(viewer: Viewer) {
  viewer.documents.onOpened(() => viewer.get('search').search({ text: 'total' }));
}

export function App() {
  return <PDFViewer src="/report.pdf" onReady={onReady} style={{ height: '100vh' }} />;
}`,
            },
          },
          {
            title: 'Put your own components in the toolbar',
            body: (
              <>
                <p>
                  The toolbar is not a black box. Wrap any React component in{' '}
                  <code>&lt;ToolbarItem&gt;</code> and place it with the layout.
                </p>
                <p>
                  It stays part of your app: your CSS styles it, and it reads your state, your
                  context and your hooks like any other component.
                </p>
              </>
            ),
            code: {
              filename: 'App.tsx',
              language: 'tsx',
              code: `import { PDFViewer, ToolbarItem, type Layout } from '@embedpdf/viewer-react';
import { useDocumentStatus } from './my-app';

const layout = (layout: Layout) => layout.add({ custom: 'status' }, { to: 'main', section: 'end' });

function DocumentStatus() {
  const status = useDocumentStatus(); // your own app state
  return <span className="status">{status}</span>;
}

export function App() {
  return (
    <PDFViewer src="/report.pdf" layout={layout} style={{ height: '100vh' }}>
      <ToolbarItem id="status">
        <DocumentStatus />
      </ToolbarItem>
    </PDFViewer>
  );
}`,
            },
          },
        ]}
        footer={
          <>
            <TextLink href={viewerDocs('react')}>Read the React quick start</TextLink>
            <TextLink href="/demo">Try the live demo</TextLink>
          </>
        }
      />

      <FeatureGrid
        eyebrow="Included"
        eyebrowIcon={icon(SparklesIcon)}
        title={
          <>
            Everything your users expect from a <em className="ep-grad not-italic">PDF app</em>
          </>
        }
        lead="Every feature is on from the start. Don't need one? Leave it out with a single prop, like disable={['forms']}."
        features={[
          {
            image: '/cap-annotation.svg',
            title: 'Annotations',
            body: 'Highlight, underline, draw, add notes, shapes and comment threads.',
            href: viewerDocs('react', 'features/annotations'),
          },
          {
            image: '/cap-forms.svg',
            title: 'Forms',
            body: 'Fill in PDF forms, or build new ones in the form mode.',
            href: viewerDocs('react', 'features/forms-and-signatures'),
          },
          {
            image: '/cap-signature.svg',
            title: 'Signatures',
            body: 'Draw, type or upload a signature and sign fields.',
            href: viewerDocs('react', 'features/forms-and-signatures'),
          },
          {
            image: '/cap-search.svg',
            title: 'Search',
            body: 'Find any word, with every match highlighted and listed.',
            href: headlessDocs('react', 'text/search'),
          },
          {
            image: '/cap-redaction.svg',
            title: 'Redaction',
            body: 'Mark text or areas, then remove them from the file for good.',
            href: headlessDocs('react', 'annotations/redaction'),
          },
          {
            image: '/cap-thumbnails.svg',
            title: 'Pages',
            body: 'Thumbnails to jump around; rotate, move, insert and delete pages.',
            href: viewerDocs('react', 'features'),
          },
        ]}
        links={<TextLink href={viewerDocs('react', 'features')}>See every feature</TextLink>}
      />

      <SplitShowcase
        eyebrow="Headless hooks"
        eyebrowIcon={icon(PaintBoardIcon)}
        title={
          <>
            Your design system, <em className="ep-grad not-italic">our PDF engine</em>
          </>
        }
        body={
          <>
            <p>
              Sometimes a ready-made toolbar is not what you want. Install{' '}
              <code>@embedpdf/react</code> and build the viewer from your own components.
            </p>
            <p>
              Every feature comes with a few small hooks. <code>useSearch()</code> does things,{' '}
              <code>useSearchState()</code> gives you what to show. The search box on the right is
              all the code you need, and it looks exactly like the rest of your app.
            </p>
          </>
        }
        points={[
          <>Works with Tailwind, shadcn/ui, MUI, Chakra or plain CSS</>,
          <>
            Re-render only on what you read: <code>useSearchState((s) =&gt; s.hitCount)</code>
          </>,
          <>Each feature is its own import, so unused ones never reach your bundle</>,
        ]}
        code={{
          filename: 'SearchBox.tsx',
          language: 'tsx',
          code: `import { useSearch, useSearchState } from '@embedpdf/react/search';

export function SearchBox() {
  const search = useSearch();
  const { hitCount, activeHitIndex, status } = useSearchState();

  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <input onChange={(event) => search.search({ text: event.target.value })} />
      {status === 'searching' && <span>Searching…</span>}
      {hitCount > 0 && (
        <span>
          {activeHitIndex + 1} of {hitCount}
        </span>
      )}
      <button type="button" onClick={() => search.previousHit()}>↑</button>
      <button type="button" onClick={() => search.nextHit()}>↓</button>
    </form>
  );
}`,
        }}
        links={
          <>
            <TextLink href={headlessDocs('react')}>Explore the headless hooks</TextLink>
          </>
        }
      />

      <SplitShowcase
        reverse
        surface="white"
        eyebrow="Next.js"
        eyebrowIcon={icon(CodeIcon)}
        title={
          <>
            Server components? <em className="ep-grad not-italic">Nothing to wrap.</em>
          </>
        }
        body={
          <>
            <p>
              Most PDF libraries break the first time they meet server rendering. You end up with{' '}
              <code>dynamic()</code>, <code>ssr: false</code> and a loading flash.
            </p>
            <p>
              <code>&lt;PDFViewer&gt;</code> is a client component already, and it is safe to import
              on the server. Render it from any page in the App Router. The server sends an empty
              box of the right size, so the layout does not jump, and the viewer starts when the
              page loads.
            </p>
          </>
        }
        points={[
          <>No hydration errors, no window checks</>,
          <>The engine’s WebAssembly ships inside your own build</>,
          <>Runs under a strict Content Security Policy, no unsafe-inline</>,
        ]}
        code={{
          filename: 'app/report/page.tsx',
          language: 'tsx',
          code: `// app/report/page.tsx: a server component. <PDFViewer> is a client component already.
import { PDFViewer } from '@embedpdf/viewer-react';

export default function ReportPage() {
  return <PDFViewer src="/report.pdf" style={{ height: '100vh' }} />;
}`,
        }}
        links={
          <TextLink href={viewerDocs('react', 'setup')}>Server rendering in the docs</TextLink>
        }
      />

      <CompareTable
        eyebrow="Compared"
        title={
          <>
            Showing pages is the <em className="ep-grad not-italic">easy part</em>
          </>
        }
        lead="Libraries like react-pdf draw the pages and leave the rest to you. Here is what that rest looks like."
        theirsLabel="Page-rendering libraries (like react-pdf)"
        rows={[
          {
            topic: 'Show PDF pages',
            ours: <Cell yes>Yes, only the pages on screen are drawn</Cell>,
            theirs: <Cell yes>Yes</Cell>,
          },
          {
            topic: 'Toolbar, zoom, thumbnails',
            ours: <Cell yes>Included, and you can move or replace any part</Cell>,
            theirs: <Cell yes={false}>You build them yourself</Cell>,
          },
          {
            topic: 'Search with highlighted matches',
            ours: <Cell yes>Included, with a results list</Cell>,
            theirs: <Cell yes={false}>You build it on top of the text layer</Cell>,
          },
          {
            topic: 'Add and save annotations',
            ours: <Cell yes>Highlights, ink, shapes, notes and comments, saved in the PDF</Cell>,
            theirs: <Cell yes={false}>Shows existing ones; adding new ones is up to you</Cell>,
          },
          {
            topic: 'Fill in and sign forms',
            ours: <Cell yes>Fill, build and sign, then download the filled PDF</Cell>,
            theirs: <Cell yes={false}>Saving the filled-in file is up to you</Cell>,
          },
          {
            topic: 'Real redaction',
            ours: <Cell yes>The text and images are removed from the file</Cell>,
            theirs: <Cell yes={false}>Not available</Cell>,
          },
          {
            topic: 'PDF engine',
            ours: <Cell yes>PDFium, the engine inside Chrome, as WebAssembly</Cell>,
            theirs: <Cell yes>PDF.js, the engine inside Firefox</Cell>,
          },
        ]}
        note="react-pdf is a fine choice when all you need is to show a few pages. Choose EmbedPDF when people need to work with the document."
      />

      <FaqList
        eyebrow="FAQ"
        title={
          <>
            React PDF viewer <em className="ep-grad not-italic">questions</em>
          </>
        }
        lead="Short answers to what React developers ask us most."
        faqs={FAQS}
      />

      <ClosingCta
        framework="react"
        title={
          <>
            Ship PDFs in your React app <em className="ep-grad-blue not-italic">this afternoon</em>
          </>
        }
        body="Install one package, render one component, and your users have a full PDF viewer. Open source under Apache-2.0, free for commercial use."
        install={{
          filename: 'Terminal',
          language: 'bash',
          code: 'npm install @embedpdf/viewer-react',
        }}
        primary={{ href: viewerDocs('react'), label: 'Read the React docs' }}
        secondary={{ href: '/demo', label: 'Open the live demo' }}
      />
    </main>
  );
}
