import {
  BookOpen01Icon,
  DashboardSquare01Icon,
  FlashIcon,
  PaintBoardIcon,
  PuzzleIcon,
  SecurityCheckIcon,
  SparklesIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Metadata } from 'next';
import Image from 'next/image';

import {
  LiveCompare,
  OptionCards,
  OptionCompare,
  PathSteps,
} from '@/components/site/framework-page/choice';
import {
  FRAMEWORK_PAGE,
  headlessDocs,
  viewerDocs,
} from '@/components/site/framework-page/framework';
import { CustomViewerLazy, ReadyMadeViewerLazy } from '@/components/site/framework-page/live/lazy';
import {
  ClosingCta,
  FaqList,
  FeatureRow,
  FrameworkHero,
  FrameworkJsonLd,
  ProofStrip,
  TextLink,
  type Faq,
} from '@/components/site/framework-page/sections';
import { GitHubIcon, ReactIcon } from '@/components/site/icons';

/*
 * /react-pdf-viewer — the React landing page. Its flow explains the one
 * choice a React developer makes: the ready-made <PDFViewer> or the headless
 * hooks. The two side by side, the features both share, the difference row
 * by row, both in code, and the path from one to the other. What's React's
 * own lives in each block: hooks and selectors, <ToolbarItem>, the Next.js
 * App Router, and react-pdf in the FAQ.
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

const glyph = (icon: typeof SparklesIcon, size = 14, className = 'text-ep-blue') => (
  <HugeiconsIcon icon={icon} size={size} strokeWidth={2} className={className} />
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
    question: 'Can I start with the ready-made viewer and switch to headless later?',
    answer:
      'Yes, and you don’t have to switch all at once. Both run on the same engine and the same plugins, with the same names and settings. Many apps start with <PDFViewer>, add their own buttons and components to it, and only move to the headless hooks when the viewer has to look completely like their product.',
  },
  {
    question: 'Which React versions are supported?',
    answer:
      'React 18 and React 19. The package lists react >= 18 as its only peer dependency, so it works with Vite, Next.js and any other setup that runs React 18 or later.',
  },
  {
    question: 'Will Tailwind or my global CSS break the viewer?',
    answer:
      'No. The ready-made viewer draws inside a shadow DOM, so resets like Tailwind’s preflight can’t reach it. You style it on purpose instead: a theme prop for colors, and --epdf-* CSS variables for every color and corner. With the headless hooks there is nothing to protect: the markup is yours.',
  },
  {
    question: 'How do I control the viewer from my own code?',
    answer:
      'Use the onReady prop. It hands you the viewer once it is live, and every feature is a plugin you reach by name: viewer.get("search").search({ text: "total" }) runs a search, for example. The headless docs describe every plugin’s methods.',
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
    question: 'I use @embedpdf/react-pdf-viewer from version 2. How do I move?',
    answer:
      'The package is now called @embedpdf/viewer-react. Install it in place of the old one and follow the migration guide in the docs, which maps each old config key and call to its new name.',
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

      <OptionCards
        eyebrow="Find your fit"
        title={
          <>
            Two ways to build a <em className="ep-grad not-italic">React PDF viewer</em>
          </>
        }
        lead="The same PDF engine and the same features. Pick how much of the interface you want to own."
        viewer={{
          badgeIcon: glyph(FlashIcon, 16),
          badgeLabel: 'Best for shipping fast',
          illustration: '/illustration-readymade.svg',
          title: 'Ready-made Viewer',
          sub: 'A complete PDF viewer in one React component, ready in minutes.',
          bullets: [
            'One <PDFViewer /> component',
            'Toolbar, panels and menus included',
            'Your colors, buttons and components',
          ],
          chips: [
            { icon: <ReactIcon size={18} />, label: 'Quick start', href: viewerDocs('react') },
            {
              icon: glyph(SparklesIcon, 18),
              label: 'Features',
              href: viewerDocs('react', 'features'),
            },
            {
              icon: glyph(PaintBoardIcon, 18),
              label: 'Theming',
              href: viewerDocs('react', 'customize/theming'),
            },
          ],
        }}
        headless={{
          badgeIcon: glyph(PuzzleIcon, 16, 'text-ep-purple'),
          badgeLabel: 'Best for full control',
          illustration: '/illustration-headless.svg',
          title: 'Headless Components',
          sub: 'React hooks and components for every feature, with no UI of their own.',
          bullets: [
            'Hooks for every feature',
            'Your design system, your markup',
            'Only what you import is bundled',
          ],
          chips: [
            { icon: <ReactIcon size={18} />, label: 'Quick start', href: headlessDocs('react') },
            {
              icon: glyph(BookOpen01Icon, 18, 'text-ep-purple'),
              label: 'How hooks work',
              href: headlessDocs('react', 'concepts/how-it-works'),
            },
            {
              icon: glyph(DashboardSquare01Icon, 18, 'text-ep-purple'),
              label: 'Your own toolbar',
              href: headlessDocs('react', 'ui/toolbar'),
            },
          ],
        }}
      />

      <FeatureRow
        eyebrow="Everything you need"
        eyebrowIcon={glyph(SparklesIcon)}
        title={
          <>
            PDF features, <em className="ep-grad not-italic">out of the box</em>
          </>
        }
        lead="Both options run on the same plugins, so you get these features either way."
        items={[
          {
            image: '/cap-thumbnails.svg',
            title: 'Viewing',
            body: 'Smooth scrolling, zoom and thumbnails, even in long files.',
            href: headlessDocs('react', 'viewing/stage'),
          },
          {
            image: '/cap-search.svg',
            title: 'Search',
            body: 'Every match highlighted in the page and listed.',
            href: headlessDocs('react', 'text/search'),
          },
          {
            image: '/cap-annotation.svg',
            title: 'Annotations',
            body: 'Highlight, draw, add shapes, notes and comments.',
            href: viewerDocs('react', 'features/annotations'),
          },
          {
            image: '/cap-stamps.svg',
            title: 'Stamps',
            body: 'Standard stamps, your own designs, or any image.',
            href: headlessDocs('react', 'annotations/stamps'),
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
            href: headlessDocs('react', 'forms/signatures'),
          },
          {
            image: '/cap-redaction.svg',
            title: 'Redaction',
            body: 'Remove private text and images from the file for good.',
            href: headlessDocs('react', 'annotations/redaction'),
          },
          {
            image: '/cap-print-export.svg',
            title: 'Download & print',
            body: 'Save every change into the PDF. Print all pages or a range.',
            href: viewerDocs('react', 'documents'),
          },
        ]}
      />

      <OptionCompare
        eyebrow="Compare options"
        title={
          <>
            Find the right option for <em className="ep-grad not-italic">your React app</em>
          </>
        }
        body={
          <p>
            Both options use the same PDF engine and the same plugins. The difference is how much is
            done for you, and how much you want to decide yourself.
          </p>
        }
        link={<TextLink href={viewerDocs('react', 'features')}>See every feature</TextLink>}
        viewerLabel="Ready-made viewer"
        headlessLabel="Headless"
        rows={[
          {
            topic: 'Time to a working viewer',
            viewer: ['yes', 'Minutes: one component'],
            headless: ['custom', 'Longer: you build the interface'],
          },
          {
            topic: 'Interface',
            viewer: ['yes', 'Toolbar, panels, menus and dialogs included'],
            headless: ['custom', 'None: your components, your design'],
          },
          {
            topic: 'Branding',
            viewer: [
              'yes',
              <>
                Accent color, light and dark, <code>--epdf-*</code> CSS variables
              </>,
            ],
            headless: ['custom', 'All of it: the markup and CSS are yours'],
          },
          {
            topic: 'Your own components',
            viewer: [
              'partial',
              <>
                In toolbars and panels, with <code>&lt;ToolbarItem&gt;</code>
              </>,
            ],
            headless: ['yes', 'Everywhere: the whole UI is yours'],
          },
          {
            topic: 'React state',
            viewer: [
              'partial',
              <>
                <code>onReady</code> gives you the viewer and its plugins
              </>,
            ],
            headless: [
              'yes',
              <>
                Hooks like <code>useSearchState()</code>; pick a value to re-render only on it
              </>,
            ],
          },
          {
            topic: 'Annotations, forms, search',
            viewer: ['yes', 'All included and switched on'],
            headless: ['yes', 'The same plugins, added as you need them'],
          },
          {
            topic: 'Bundle',
            viewer: ['partial', 'One package with every feature; turn off what you don’t use'],
            headless: ['yes', 'Each feature is its own import'],
          },
          {
            topic: 'Next.js App Router',
            viewer: ['yes', 'Render it from a server component, nothing to wrap'],
            headless: [
              'yes',
              <>
                Mark your viewer component <code>&apos;use client&apos;</code>
              </>,
            ],
          },
          {
            topic: 'Best for',
            viewer: ['yes', 'Most apps, and shipping fast'],
            headless: ['custom', 'Products where the viewer is part of your design'],
          },
        ]}
      />

      <LiveCompare
        eyebrow="See the difference"
        title={
          <>
            Both options, <em className="ep-grad not-italic">running live</em>
          </>
        }
        lead="These are real viewers, running in your browser from the code next to them. Switch between them to see what each option gives you."
        demos={[
          {
            id: 'ready-made',
            label: 'Ready-made viewer',
            tone: 'blue',
            source: 'src/components/site/framework-page/live/ready-made-viewer.tsx',
            filename: 'ReadyMadeViewer.tsx',
            preview: <ReadyMadeViewerLazy />,
            caption: (
              <>
                One component, and the toolbar, panels, search, annotations and forms come with it.
                Try them.
              </>
            ),
          },
          {
            id: 'headless',
            label: 'Headless',
            tone: 'purple',
            source: 'src/components/site/framework-page/live/custom-viewer.tsx',
            filename: 'CustomViewer.tsx',
            preview: <CustomViewerLazy />,
            caption: (
              <>
                More code, and every pixel is yours: here a floating toolbar built with{' '}
                <code>useStage()</code> and <code>useSearch()</code>. Search for a word.
              </>
            ),
          },
        ]}
      />

      <PathSteps
        eyebrow="Grow with confidence"
        title={
          <>
            A clear path from simple to <em className="ep-grad not-italic">fully custom</em>
          </>
        }
        body="Start with the ready-made viewer and change only what you need, when you need it. Every step runs on the same engine and the same plugins."
        action={
          <TextLink href={viewerDocs('react', 'concepts/how-it-works')}>
            How the viewer is built
          </TextLink>
        }
        steps={[
          {
            title: 'Start with the ready-made viewer',
            body: 'One component, every feature. Plenty of apps never need more.',
          },
          {
            title: 'Make it yours',
            body: (
              <>
                Your color, your buttons, and your React components in the toolbar with{' '}
                <code>&lt;ToolbarItem&gt;</code>.
              </>
            ),
          },
          {
            title: 'Go headless when you need to',
            tone: 'purple',
            body: 'Build the whole UI yourself with hooks. The plugins, their names and settings stay the same.',
          },
        ]}
      />

      <ProofStrip
        eyebrow="Open source proof"
        eyebrowIcon={glyph(SecurityCheckIcon)}
        title={
          <>
            Used in production. <em className="ep-grad not-italic">Built in the open.</em>
          </>
        }
        lead="No black box: read the code, check the numbers, and follow every change on GitHub."
        items={[
          {
            icon: (
              <svg width="38" height="15" viewBox="-90 -90 960 380" aria-hidden>
                <rect x="-90" y="-90" width="960" height="380" fill="#CB3837" rx="32" />
                <path
                  fill="#fff"
                  d="M240,250h100v-50h100V0H240V250z M340,50h50v100h-50V50z M480,0v200h100V50h50v150h50V50h50v150h50V0H480z M0,200h100V50h50v150h50V0H0V200z"
                />
              </svg>
            ),
            stat: '1M+',
            label: 'monthly downloads on npm',
            body: 'From side projects to document platforms.',
            href: 'https://www.npmjs.com/org/embedpdf',
            linkLabel: 'npmjs.com',
          },
          {
            icon: <GitHubIcon size={30} className="text-[#181717]" />,
            stat: '4K+',
            label: 'stars on GitHub',
            body: 'Issues, pull requests and releases, all in public.',
            href: 'https://github.com/embedpdf/embed-pdf-viewer',
            linkLabel: 'github.com',
          },
          {
            icon: <Image src="/pdf-association.svg" alt="" width={30} height={30} />,
            stat: 'Member',
            label: 'of the PDF Association',
            body: 'Working with the people behind the PDF standard.',
            href: 'https://pdfa.org',
            linkLabel: 'pdfa.org',
          },
          {
            icon: glyph(SecurityCheckIcon, 28, 'text-[#16A34A]'),
            stat: 'Apache-2.0',
            label: 'open source license',
            body: 'Free for commercial use, with an explicit patent grant.',
            href: 'https://github.com/embedpdf/embed-pdf-viewer/blob/main/LICENSE',
            linkLabel: 'Read the license',
          },
        ]}
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
