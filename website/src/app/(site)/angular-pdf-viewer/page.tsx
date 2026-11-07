import {
  Agreement01Icon,
  CodeIcon,
  FileSecurityIcon,
  Legal01Icon,
  LockIcon,
  SecurityCheckIcon,
  Shield01Icon,
  SparklesIcon,
  WifiOff01Icon,
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
  CodeSteps,
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
 * /angular-pdf-viewer — the Angular landing page. Its angle: Angular apps are
 * often the ones that run on documents (claims, contracts, forms), built by
 * teams with a security review. So it leads with the document work (forms,
 * digital signatures, redaction), shows that it's modern Angular (standalone,
 * signals, OnPush, zoneless, @defer), and answers the security questions.
 *
 * Every code sample is a docs snippet (docs/content/snippets), so the code
 * here is code the docs compile; the hero's is only reflowed to fit its card.
 */

const TITLE = 'Angular PDF Viewer: Standalone, Signal-Based | EmbedPDF';
const DESCRIPTION =
  'An open source PDF viewer for Angular 20.2+. A standalone component to annotate, fill in, sign and redact PDFs, plus signal-based services for your own UI.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: FRAMEWORK_PAGE.angular },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: FRAMEWORK_PAGE.angular,
    type: 'website',
  },
};

const glyph = (icon: typeof CodeIcon, size = 14) => (
  <HugeiconsIcon icon={icon} size={size} strokeWidth={2} className="text-ep-blue" />
);

const FAQS: Faq[] = [
  {
    question: 'Which Angular versions are supported?',
    answer:
      'Angular 20.2 and later. Everything is a standalone component, uses OnPush change detection and is built on signals, so it fits apps made with the current Angular defaults.',
  },
  {
    question: 'Can I use it in an app that still uses NgModules?',
    answer:
      'Yes. EpdfPdfViewer is a standalone component, and Angular lets you add standalone components to the imports of an NgModule. You don’t have to migrate your app first.',
  },
  {
    question: 'Does it need zone.js?',
    answer:
      'No. The components are OnPush and update through signals, so they work in zoneless apps that use provideZonelessChangeDetection(), the default for new Angular apps. They work in apps with zone.js too.',
  },
  {
    question: 'Does it work with Angular SSR?',
    answer:
      'Yes. The package is safe to import on the server, which renders an empty box of the size you set. Wrap the viewer in @defer (on viewport) and its code also stays out of the first download until the user scrolls to it.',
  },
  {
    question: 'How is it different from ngx-extended-pdf-viewer?',
    answer:
      'ngx-extended-pdf-viewer brings Mozilla’s PDF.js viewer, the one in Firefox, into Angular and lets you configure it. EmbedPDF gives you an Angular API of its own: a standalone component with inputs and outputs, and headless services with signals if you build your own UI. It runs on PDFium, the engine inside Chrome. It also includes real redaction and digital signatures with a key you control.',
  },
  {
    question: 'We embedded the version 2 snippet in Angular. What should we use now?',
    answer:
      'Use @embedpdf/viewer-angular. Version 2 had no Angular package, so many teams called @embedpdf/snippet from a component by hand. Version 3 gives you a real standalone component with inputs and outputs, and the migration guide in the docs maps each old config key to its new name.',
  },
  {
    question: 'Are documents sent to a server?',
    answer:
      'No. The PDF engine runs as WebAssembly in a Web Worker inside the browser. Documents are opened, changed and saved on the user’s device, and nothing is fetched from a third party at runtime.',
  },
  {
    question: 'What license is it under?',
    answer:
      'Apache-2.0. It is free for commercial use, it does not require you to open source your own code, and it includes an explicit patent grant, which legal teams tend to like.',
  },
];

export default function AngularPdfViewerPage() {
  return (
    <main className="bg-ep-bg relative overflow-x-clip">
      <FrameworkJsonLd
        name="EmbedPDF for Angular"
        description={DESCRIPTION}
        url={FRAMEWORK_PAGE.angular}
        faqs={FAQS}
      />

      <FrameworkHero
        framework="angular"
        badge="Angular PDF Viewer"
        title={
          <>
            An <em className="ep-grad not-italic">Angular PDF viewer</em> for apps that run on
            documents
          </>
        }
        intro="Claims, contracts, onboarding forms, reports. EmbedPDF gives your Angular app one standalone component that reads, fills in, signs and redacts PDFs in the browser. Need your own UI? Every feature is also a service with signals."
        primary={{ href: viewerDocs('angular'), label: 'Start with Angular' }}
        code={{
          filename: 'app.ts',
          language: 'angular-ts',
          code: `import { Component } from '@angular/core';
import { EpdfPdfViewer } from '@embedpdf/viewer-angular';

@Component({
  selector: 'app-root',
  imports: [EpdfPdfViewer],
  template: \`
    <epdf-pdf-viewer
      src="/report.pdf"
      style="height: 100vh"
    />
  \`,
})
export class App {}`,
        }}
        card={{
          title: 'Modern Angular',
          items: ['Angular 20.2 and later', 'Standalone and OnPush', 'Zoneless ready'],
        }}
      />

      <FeatureGrid
        eyebrow="Document work"
        eyebrowIcon={glyph(Agreement01Icon)}
        title={
          <>
            Built for <em className="ep-grad not-italic">document-heavy</em> apps
          </>
        }
        lead="Your users don't only read PDFs. They review, fill in, approve and sign them. The viewer handles all of it, and saves the result into the PDF."
        features={[
          {
            image: '/cap-forms.svg',
            title: 'Forms',
            body: 'Fill in PDF forms, or let staff build new fields in the form mode.',
            href: headlessDocs('angular', 'forms'),
          },
          {
            image: '/cap-signature.svg',
            title: 'Digital signatures',
            body: 'Sign with a key you control, and check the signatures a file already has.',
            href: headlessDocs('angular', 'forms/signatures'),
          },
          {
            image: '/cap-redaction.svg',
            title: 'Redaction',
            body: 'Remove personal data from the file for good, not just cover it up.',
            href: headlessDocs('angular', 'annotations/redaction'),
          },
          {
            image: '/cap-annotation.svg',
            title: 'Review',
            body: 'Highlights, notes and comment threads with replies, by author.',
            href: headlessDocs('angular', 'annotations/comments'),
          },
          {
            image: '/cap-stamps.svg',
            title: 'Stamps',
            body: 'Standard stamps like Approved, or your own company stamps and images.',
            href: headlessDocs('angular', 'annotations/stamps'),
          },
          {
            image: '/cap-search.svg',
            title: 'Search',
            body: 'Find a clause in a 300-page contract, with every match listed.',
            href: headlessDocs('angular', 'text/search'),
          },
        ]}
        links={<TextLink href={viewerDocs('angular', 'features')}>All viewer features</TextLink>}
      />

      <CodeSteps
        eyebrow="Quick start"
        title={
          <>
            Up and running in <em className="ep-grad not-italic">three steps</em>
          </>
        }
        lead="No module to register, no assets to copy into angular.json. Import the component and use it."
        surface="soft"
        steps={[
          {
            title: 'Install the package',
            body: (
              <p>
                <code>@embedpdf/viewer-angular</code> holds the viewer, the toolbar and the PDF
                engine. The engine’s WebAssembly is served from your own app.
              </p>
            ),
            code: {
              filename: 'Terminal',
              language: 'bash',
              code: 'npm install @embedpdf/viewer-angular',
            },
          },
          {
            title: 'Import it and listen with (ready)',
            body: (
              <>
                <p>
                  Add <code>EpdfPdfViewer</code> to your component’s <code>imports</code> and put{' '}
                  <code>&lt;epdf-pdf-viewer&gt;</code> in the template.
                </p>
                <p>
                  The <code>(ready)</code> output gives you the viewer. Every feature is a plugin
                  you reach by name.
                </p>
              </>
            ),
            code: {
              filename: 'app.ts',
              language: 'angular-ts',
              code: `import { Component } from '@angular/core';
import { EpdfPdfViewer, type Viewer } from '@embedpdf/viewer-angular';

@Component({
  selector: 'app-root',
  imports: [EpdfPdfViewer],
  template: \`<epdf-pdf-viewer src="/report.pdf" style="height: 100vh" (ready)="onReady($event)" />\`,
})
export class App {
  onReady(viewer: Viewer) {
    viewer.documents.onOpened(() => viewer.get('search').search({ text: 'total' }));
  }
}`,
            },
          },
          {
            title: 'Add your own component to the toolbar',
            body: (
              <>
                <p>
                  Put any of your components in an <code>ng-template</code> with{' '}
                  <code>epdfToolbarItem</code>, and tell the layout where it goes.
                </p>
                <p>It keeps your services, your styles and your dependency injection.</p>
              </>
            ),
            code: {
              filename: 'app.ts',
              language: 'angular-ts',
              code: `import { Component } from '@angular/core';
import { EpdfPdfViewer, EpdfToolbarItem, type Layout } from '@embedpdf/viewer-angular';
import { DocumentStatus } from './document-status';

@Component({
  selector: 'app-root',
  imports: [EpdfPdfViewer, EpdfToolbarItem, DocumentStatus],
  template: \`
    <epdf-pdf-viewer src="/report.pdf" [layout]="layout" style="height: 100vh">
      <ng-template epdfToolbarItem="status">
        <app-document-status />
      </ng-template>
    </epdf-pdf-viewer>
  \`,
})
export class App {
  readonly layout = (layout: Layout) => layout.add({ custom: 'status' }, { to: 'main', section: 'end' });
}`,
            },
          },
        ]}
        footer={<TextLink href={viewerDocs('angular')}>The Angular quick start</TextLink>}
      />

      <SplitShowcase
        surface="white"
        eyebrow="Signals and services"
        eyebrowIcon={glyph(CodeIcon)}
        title={
          <>
            Your own UI, with the <em className="ep-grad not-italic">Angular you know</em>
          </>
        }
        body={
          <>
            <p>
              Install <code>@embedpdf/angular</code> when the ready-made toolbar is not enough. Each
              feature is one service: <code>inject(EpdfSearch)</code> for search,{' '}
              <code>inject(EpdfAnnotation)</code> for annotations, and so on.
            </p>
            <p>
              Call its methods from your event bindings. Read its state as signals in your template.
              A signal only updates what reads it, so a hit counter never redraws a list.
            </p>
          </>
        }
        points={[
          'State as signals, events as RxJS streams',
          <>
            PDF form fields as Reactive Forms controls, with <code>form.controlOf()</code>
          </>,
          'Works with @if, @for and @defer',
          'Easy to test: provide a fake service like any other',
        ]}
        code={{
          filename: 'search.ts',
          language: 'angular-ts',
          code: `import { Component, inject } from '@angular/core';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import { EpdfSearch, EpdfSearchLayer } from '@embedpdf/angular/search';
import { EpdfPageTemplate, EpdfStage } from '@embedpdf/angular/stage';

@Component({
  selector: 'app-search',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfSearchLayer],
  template: \`
    <form (submit)="$event.preventDefault()">
      <input #query (input)="search.search({ text: query.value })" />
      @if (search.status() === 'searching') {
        <span>Searching…</span>
      }
      @if (search.hitCount() > 0) {
        <span>{{ search.activeHitIndex() + 1 }} of {{ search.hitCount() }}</span>
      }
      <button type="button" (click)="search.previousHit()">↑</button>
      <button type="button" (click)="search.nextHit()">↓</button>
    </form>

    <epdf-stage>
      <ng-template epdfPage>
        <epdf-render-layer />
        <epdf-search-layer />
      </ng-template>
    </epdf-stage>
  \`,
})
export class SearchPage {
  protected readonly search = inject(EpdfSearch);
}`,
        }}
        links={<TextLink href={headlessDocs('angular')}>Angular headless docs</TextLink>}
      />

      <ReasonGrid
        eyebrow="Security review"
        eyebrowIcon={glyph(SecurityCheckIcon)}
        title={
          <>
            Answers for your <em className="ep-grad not-italic">security team</em>
          </>
        }
        lead="The questions that usually stall a PDF library in review, answered up front."
        reasons={[
          {
            icon: glyph(FileSecurityIcon, 22),
            title: 'Files stay in the browser',
            body: 'The PDF engine runs as WebAssembly in a Web Worker. Documents are never uploaded to us or anyone else.',
          },
          {
            icon: glyph(WifiOff01Icon, 22),
            title: 'No third-party calls',
            body: 'Nothing is fetched from an outside server unless you set it up, and our nightly tests fail on any request that leaves your app. It works in air-gapped networks.',
          },
          {
            icon: glyph(Shield01Icon, 22),
            title: 'Strict CSP',
            body: (
              <p>
                It runs under a strict Content Security Policy with no <code>unsafe-inline</code>.
                The docs list the exact policy to copy.
              </p>
            ),
          },
          {
            icon: glyph(LockIcon, 22),
            title: 'Permissions that hold',
            body: 'Give a document a scope, and the engine checks it on every call, from a button or from code.',
          },
          {
            icon: glyph(SecurityCheckIcon, 22),
            title: 'Redaction that removes',
            body: 'Redacted text and images are taken out of the file, so they can’t be copied or searched later.',
          },
          {
            icon: glyph(Legal01Icon, 22),
            title: 'A license legal approves',
            body: 'Apache-2.0: free for commercial use, no copyleft, and an explicit patent grant.',
          },
        ]}
      />

      <SplitShowcase
        reverse
        surface="white"
        eyebrow="Angular SSR"
        eyebrowIcon={glyph(SparklesIcon)}
        title={
          <>
            Server-rendered, and <em className="ep-grad not-italic">loaded when needed</em>
          </>
        }
        body={
          <>
            <p>
              The package is safe to import on the server, so Angular SSR and prerendering just
              work. The server sends an empty box of the right size, and the viewer starts in the
              browser.
            </p>
            <p>
              Wrap it in <code>@defer (on viewport)</code> and the viewer’s code is not even part of
              the first download. It loads when the user scrolls to it.
            </p>
          </>
        }
        points={[
          'No isPlatformBrowser checks around the viewer',
          'A placeholder keeps the layout from jumping',
          'Faster first load on pages where the PDF is further down',
        ]}
        code={{
          filename: 'report.ts',
          language: 'angular-ts',
          code: `import { Component } from '@angular/core';
import { EpdfPdfViewer } from '@embedpdf/viewer-angular';

@Component({
  selector: 'app-report',
  imports: [EpdfPdfViewer],
  template: \`
    @defer (on viewport) {
      <epdf-pdf-viewer src="/report.pdf" style="height: 100vh" />
    } @placeholder {
      <div style="height: 100vh"></div>
    }
  \`,
})
export class Report {}`,
        }}
        links={<TextLink href={viewerDocs('angular', 'setup')}>Setup and SSR</TextLink>}
      />

      <FaqList
        eyebrow="FAQ"
        title={
          <>
            Angular PDF viewer <em className="ep-grad not-italic">FAQ</em>
          </>
        }
        lead="What Angular teams ask before they adopt it."
        faqs={FAQS}
      />

      <ClosingCta
        framework="angular"
        title={
          <>
            Put PDFs to work <em className="ep-grad-blue not-italic">in your Angular app</em>
          </>
        }
        body="One standalone component today. Signals and services when you need more. Open source, Apache-2.0, and no documents leaving the browser."
        install={{
          filename: 'Terminal',
          language: 'bash',
          code: 'npm install @embedpdf/viewer-angular',
        }}
        primary={{ href: viewerDocs('angular'), label: 'Read the Angular docs' }}
        secondary={{ href: '/demo', label: 'Open the live demo' }}
      />
    </main>
  );
}
