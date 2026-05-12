'use client'

import React, { useEffect, useRef, useState } from 'react'
import {
  AngularMaterialLogo,
  PrimeNGLogo,
  SpartanNgLogo,
  TailwindLogo,
} from './logos'
import {
  ArrowRight,
  Check,
  Cpu,
  Github,
  Heart,
  Layers,
  Layout,
  Play,
  Zap,
  Code,
  ZoomIn,
  Search,
  MousePointer2,
  PenTool,
  Grid,
  Printer,
  Share2,
  Lock,
  Hand,
  Maximize,
  RotateCw,
  Camera,
  FileCode,
  Server,
  Package,
  Activity,
  Construction,
} from 'lucide-react'
import Link from 'next/link'
import { Scribble2 } from '@/components/icons/scribble2'
import { AngularIcon } from './framework-icons'
import { CodeShowcase } from './code-showcase'
import { useAngularMount } from '@/content/docs/angular/code-examples/use-angular-mount'

// Animated background — fuchsia / pink / violet to echo the AngularIcon gradient
const AnimatedBackground = () => {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Fuchsia blob */}
      <div className="animate-blob absolute left-8 top-72 h-64 w-64 rounded-full bg-fuchsia-500 opacity-10 mix-blend-multiply blur-3xl filter dark:opacity-20 dark:mix-blend-normal"></div>

      {/* Pink blob */}
      <div className="animate-blob animation-delay-2000 absolute -right-8 top-32 h-80 w-80 rounded-full bg-pink-500 opacity-10 mix-blend-multiply blur-3xl filter dark:opacity-20 dark:mix-blend-normal"></div>

      {/* Violet blob */}
      <div className="animate-blob animation-delay-4000 absolute bottom-24 left-20 h-72 w-72 rounded-full bg-violet-500 opacity-10 mix-blend-multiply blur-3xl filter dark:opacity-20 dark:mix-blend-normal"></div>

      {/* Subtle grid pattern */}
      <div className="bg-grid-pattern absolute inset-0 opacity-5 dark:opacity-[0.03]"></div>
    </div>
  )
}

// Angular UI ecosystem trio (locked decision #2 + #4: logos-only, no toggle)
const uiLibraries = [
  { name: 'Angular Material', logo: <AngularMaterialLogo /> },
  { name: 'PrimeNG', logo: <PrimeNGLogo /> },
  {
    name: 'Spartan/ng',
    // Spartan mark uses currentColor; tint via text-* on parent
    logo: (
      <span className="text-zinc-900 dark:text-zinc-100">
        <SpartanNgLogo />
      </span>
    ),
  },
  { name: 'Tailwind CSS', logo: <TailwindLogo /> },
]

const Hero = () => {
  return (
    <div className="pb-16 pt-20 sm:pt-24 lg:pt-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-6 py-2 text-sm font-medium text-fuchsia-800 dark:border-fuchsia-800/30 dark:bg-fuchsia-900/20 dark:text-fuchsia-300">
              <AngularIcon className="h-4 w-4" />
              <span>Angular PDF Viewer Open Source Library</span>
            </div>

            <h1 className="text-4xl font-black leading-tight tracking-tight text-gray-900 dark:text-white sm:text-6xl">
              <span className="relative inline-block">
                <span className="relative z-10">Angular PDF Viewer</span>
                <div className="absolute bottom-1 left-0 right-0 -z-10 h-3 -rotate-1 transform text-fuchsia-400 opacity-50 dark:text-fuchsia-500 md:h-4">
                  <Scribble2 color="currentColor" />
                </div>
              </span>
              <br />
              <span className="">built your way</span>
            </h1>

            <p className="relative mx-auto mt-6 max-w-2xl text-lg text-gray-600 dark:text-gray-400 md:mt-8 md:text-xl">
              The ultimate <strong>Angular PDF viewer</strong> for your next
              project. Drop in a polished <code>&lt;embedpdf-viewer&gt;</code>{' '}
              today — powered by signals, zoneless-ready, and TypeScript-first.{' '}
              <strong>Headless Angular injectables</strong> are coming soon.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row md:mt-10 md:gap-4">
              <Link
                href="/docs/angular"
                className="group relative inline-flex w-full items-center justify-center overflow-hidden rounded-full bg-gray-900 px-8 py-3.5 text-base font-medium text-white shadow-xl transition-all hover:scale-105 hover:shadow-2xl dark:bg-white dark:text-gray-900 sm:w-auto md:py-4"
              >
                <span className="absolute left-0 top-0 h-full w-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-violet-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></span>
                <span className="relative z-10 flex items-center">
                  Get Started
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>

              <a
                href="https://app.embedpdf.com"
                target="_blank"
                rel="noreferrer"
                className="group inline-flex w-full items-center justify-center rounded-full bg-white px-8 py-3.5 text-base font-medium text-gray-700 shadow-md transition-all hover:bg-gray-50 hover:text-gray-900 hover:shadow-lg dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:hover:text-white sm:w-auto md:py-4"
              >
                <Play className="mr-2 h-4 w-4 fill-current text-fuchsia-600 transition-transform group-hover:scale-110 dark:text-fuchsia-400" />
                Live Demo
              </a>

              <a
                href="https://github.com/embedpdf/embed-pdf-viewer"
                target="_blank"
                rel="noreferrer"
                className="group inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-base font-medium text-gray-500 transition-all hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white sm:w-auto"
              >
                <Github className="mr-2 h-5 w-5" />
                <span>Star on GitHub</span>
              </a>
            </div>

            {/* UI library ecosystem badges (logos-only, no toggle — decision #2) */}
            <div className="mt-16 md:mt-24">
              <p className="mb-8 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 md:text-sm">
                Works seamlessly with your favorite Angular libraries
              </p>
              <div className="mx-auto flex max-w-5xl flex-wrap justify-center gap-6 md:gap-8">
                {uiLibraries.map((lib) => (
                  <div
                    key={lib.name}
                    className="group flex flex-col items-center gap-3 transition-transform hover:-translate-y-1"
                  >
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-900/5 transition-all group-hover:shadow-md dark:bg-gray-800 dark:ring-white/10 md:h-14 md:w-14"
                      title={lib.name}
                    >
                      <div className="scale-110 opacity-70 grayscale transition-all duration-300 group-hover:scale-125 group-hover:opacity-100 group-hover:grayscale-0">
                        {lib.logo}
                      </div>
                    </div>
                    <span className="text-xs font-medium text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300">
                      {lib.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const IntegrationPaths = () => {
  return (
    <div className="mt-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
            Two ways to integrate
          </h2>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
            Choose the level of control that fits your Angular project
          </p>
        </div>

        <div className="grid gap-8 text-left md:grid-cols-2">
          {/* Path 1: Full UI */}
          <div className="group relative flex h-full flex-col rounded-3xl border border-gray-200 bg-white p-8 shadow-sm transition-all hover:shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <div className="absolute right-0 top-0 p-6 text-fuchsia-600 opacity-5 dark:text-fuchsia-400 dark:opacity-10">
              <Layout size={120} strokeWidth={1} />
            </div>
            <h3 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
              Full-UI Viewer
            </h3>
            <div className="mb-4 inline-flex w-fit rounded-full bg-fuchsia-100 px-2.5 py-0.5 text-xs font-medium text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-300">
              Available today
            </div>
            <p className="mb-6 min-h-[3rem] text-gray-600 dark:text-gray-400">
              A complete, polished PDF viewer with toolbar and thumbnails. Drop
              the standalone <code>PDFViewer</code> component into your template
              and you&apos;re done.
            </p>
            <ul className="mb-8 flex-grow space-y-3 text-gray-600 dark:text-gray-400">
              <li className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" /> Pre-built
                responsive UI
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" /> Signals &amp;
                zoneless ready
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" /> Production ready
              </li>
            </ul>
            <div className="mb-6 overflow-x-auto rounded-lg border border-gray-200 bg-gray-100 p-3 font-mono text-xs dark:border-gray-700 dark:bg-gray-800">
              npm install @embedpdf/angular-pdf-viewer
            </div>

            <div className="mt-auto">
              <Link
                href="/docs/angular/viewer/introduction"
                className="group/btn flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-3 font-medium text-white transition-all hover:bg-gray-800 dark:bg-white dark:text-gray-900"
              >
                <AngularIcon className="h-5 w-5" />
                <span>Get Drop-in Viewer</span>
                <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
              </Link>
            </div>
          </div>

          {/* Path 2: Headless */}
          <div className="group relative flex h-full flex-col rounded-3xl border border-gray-200 bg-white p-8 shadow-sm transition-all hover:shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <div className="absolute right-0 top-0 p-6 text-blue-600 opacity-5 dark:text-blue-400 dark:opacity-10">
              <Cpu size={120} strokeWidth={1} />
            </div>
            <h3 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
              Headless Injectables
            </h3>
            <div className="mb-4 inline-flex w-fit rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
              Coming soon
            </div>
            <p className="mb-6 min-h-[3rem] text-gray-600 dark:text-gray-400">
              Build a viewer that perfectly matches your design system with
              Angular injectables and signals on top of our headless core.
            </p>
            <ul className="mb-8 flex-grow space-y-3 text-gray-600 dark:text-gray-400">
              <li className="flex items-center gap-2">
                <Check className="h-5 w-5 text-blue-500" /> 100% UI freedom
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-5 w-5 text-blue-500" /> Tiny bundle size
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-5 w-5 text-blue-500" /> Modular plugin
                system
              </li>
            </ul>
            <div className="mb-6 overflow-x-auto rounded-lg border border-gray-200 bg-gray-100 p-3 font-mono text-xs dark:border-gray-700 dark:bg-gray-800">
              npm install @embedpdf/core
            </div>

            <div className="mt-auto">
              <Link
                href="/docs/angular/headless/introduction"
                className="group/btn flex items-center justify-center gap-2 rounded-lg border-2 border-gray-200 bg-transparent px-4 py-3 font-medium text-gray-900 transition-all hover:border-gray-900 dark:border-gray-700 dark:text-white dark:hover:border-white"
              >
                <Code className="h-5 w-5" />
                <span>Preview the headless plan</span>
                <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const FullUiShowcase = () => {
  return (
    <div className="mt-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-fuchsia-100 px-3 py-1 text-xs font-medium text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-300">
            <Layout size={14} /> Full-UI Component
          </div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
            Drop-in Integration
          </h2>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
            Get a fully featured PDF viewer in your Angular app with a single
            standalone component.
          </p>
        </div>

        <CodeShowcase framework="angular" />

        <div className="mt-8 flex justify-center">
          <Link
            href="/docs/angular/viewer/getting-started"
            className="group inline-flex items-center justify-center rounded-full bg-gray-900 px-6 py-3 text-sm font-medium text-white shadow-lg transition-transform hover:scale-105 dark:bg-white dark:text-gray-900"
          >
            View Full Documentation
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </div>
  )
}

// Live Angular demo — bootstraps the actual @embedpdf/angular-pdf-viewer
// wrapper via the shared mount glue (locked decision #1: diverge from
// sibling React/Vue/Svelte landings which embed the React Snippet UI).
const AngularPdfDemoMount = () => {
  const { containerRef } = useAngularMount(
    () => import('@embedpdf/example-angular-tailwind/viewer/viewer-example'),
  )
  return <div ref={containerRef} className="h-[500px] w-full md:h-[700px]" />
}

// Defer the Angular bootstrap (and its ~MB of @angular/core +
// @angular/platform-browser + @angular/compiler JIT chunks) until the demo
// section enters the viewport. The marketing page above the fold should not
// pay the cost of an Angular app a visitor may never scroll to.
const LazyAngularDemo = () => {
  const placeholderRef = useRef<HTMLDivElement | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const node = placeholderRef.current
    // SSR / jsdom / older browsers: no IO support → mount eagerly so docs
    // tests and non-browser environments still exercise the real Angular path.
    if (!node || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }

    // One-shot: once the demo enters view, we flip to inView=true forever and
    // disconnect the observer. The Angular app then owns its own lifecycle and
    // keeps running even if the user scrolls away — avoids JIT recompile churn
    // from mount/unmount thrash on long pages.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  if (inView) return <AngularPdfDemoMount />

  return (
    <div
      ref={placeholderRef}
      role="status"
      aria-live="polite"
      aria-label="Angular viewer demo (loads when visible)"
      className="flex h-[500px] w-full items-center justify-center rounded-lg border border-dashed border-fuchsia-200 bg-fuchsia-50/30 text-fuchsia-700 dark:border-fuchsia-800/40 dark:bg-fuchsia-900/10 dark:text-fuchsia-300 md:h-[700px]"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <AngularIcon className="h-5 w-5" />
        <span>Angular demo loads on scroll…</span>
      </div>
    </div>
  )
}

const FullUiDemo = () => {
  return (
    <div className="mt-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
            See it in Action
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
            This is the default UI you get with the{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-base font-medium text-fuchsia-600 dark:bg-gray-800 dark:text-fuchsia-400">
              &lt;embedpdf-viewer&gt;
            </code>{' '}
            component — running below as a real Angular application.
            <br />
            <span className="text-sm opacity-80">
              Want a different look? Scroll down for our headless plan.
            </span>
          </p>
        </div>

        {/* Angular demo with enhanced styling */}
        <div className="group relative">
          <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <LazyAngularDemo />
          </div>
        </div>
      </div>
    </div>
  )
}

// Real plugins from the library — same set across frameworks
const corePlugins = [
  {
    name: 'Document Manager',
    icon: <Layers size={18} />,
    pkg: 'plugin-document-manager',
    essential: true,
  },
  {
    name: 'Viewport',
    icon: <Maximize size={18} />,
    pkg: 'plugin-viewport',
    essential: true,
  },
  {
    name: 'Scroll',
    icon: <ArrowRight size={18} className="rotate-90" />,
    pkg: 'plugin-scroll',
    essential: true,
  },
  {
    name: 'Render',
    icon: <Layout size={18} />,
    pkg: 'plugin-render',
    essential: true,
  },
]

const featurePlugins = [
  { name: 'Zoom', icon: <ZoomIn size={18} />, pkg: 'plugin-zoom' },
  {
    name: 'Selection',
    icon: <MousePointer2 size={18} />,
    pkg: 'plugin-selection',
  },
  { name: 'Annotation', icon: <PenTool size={18} />, pkg: 'plugin-annotation' },
  { name: 'Thumbnail', icon: <Grid size={18} />, pkg: 'plugin-thumbnail' },
  { name: 'Search', icon: <Search size={18} />, pkg: 'plugin-search' },
  { name: 'Rotate', icon: <RotateCw size={18} />, pkg: 'plugin-rotate' },
  { name: 'Pan', icon: <Hand size={18} />, pkg: 'plugin-pan' },
  { name: 'Print', icon: <Printer size={18} />, pkg: 'plugin-print' },
  { name: 'Export', icon: <Share2 size={18} />, pkg: 'plugin-export' },
  { name: 'Capture', icon: <Camera size={18} />, pkg: 'plugin-capture' },
  { name: 'Redaction', icon: <Lock size={18} />, pkg: 'plugin-redaction' },
  { name: 'i18n', icon: <Zap size={18} />, pkg: 'plugin-i18n' },
]

// Headless "coming soon" callout (locked decision #3: do NOT render an
// aspirational headless-API snippet; API may drift before ship).
const HeadlessV11Callout = () => (
  <div className="overflow-hidden rounded-2xl bg-gray-950 shadow-2xl ring-1 ring-white/10">
    {/* Header */}
    <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900/50 px-4 py-3">
      <div className="flex space-x-2">
        <div className="h-3 w-3 rounded-full bg-red-500"></div>
        <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
        <div className="h-3 w-3 rounded-full bg-green-500"></div>
      </div>
      <span className="text-xs text-gray-500">headless-preview.ts</span>
    </div>

    {/* Coming-soon body */}
    <div className="px-8 py-12 text-center">
      <div className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/30">
        <Construction size={26} aria-hidden="true" />
      </div>
      <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-300">
        Coming soon
      </div>
      <h3 className="text-xl font-bold text-white md:text-2xl">
        Headless Angular bindings are on the way
      </h3>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-gray-400">
        The next release of the EmbedPDF Angular integration introduces{' '}
        <code className="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-200">
          @embedpdf/core/angular
        </code>{' '}
        with{' '}
        <code className="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-200">
          injectXxx()
        </code>{' '}
        helpers — signal-aware composition of every plugin, no template bindings
        required.
      </p>
      <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href="/docs/angular/headless/introduction"
          className="group inline-flex items-center justify-center rounded-full bg-blue-500/10 px-5 py-2.5 text-sm font-medium text-blue-300 ring-1 ring-blue-500/30 transition-all hover:bg-blue-500/20"
        >
          Read more
          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
        <a
          href="https://github.com/embedpdf/embed-pdf-viewer/discussions"
          target="_blank"
          rel="noreferrer"
          className="group inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium text-gray-400 transition-all hover:text-white"
        >
          Track progress
          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </a>
      </div>
    </div>
  </div>
)

const HeadlessShowcase = () => {
  return (
    <div className="mt-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
            <Cpu size={14} /> Headless Architecture
          </div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
            Compose Your Perfect Viewer
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
            Pick only the features you need. Each plugin is a separate package —
            your bundle stays lean, your app stays fast.
          </p>
        </div>

        <div className="grid items-start gap-12 lg:grid-cols-2">
          {/* Left: Plugin Architecture */}
          <div className="order-1 min-w-0">
            {/* Core Plugins */}
            <div className="mb-6">
              <div className="mb-3 flex items-center gap-2">
                <div className="h-px flex-1 bg-gradient-to-r from-gray-200 to-transparent dark:from-gray-700"></div>
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Core Foundation
                </span>
                <div className="h-px flex-1 bg-gradient-to-l from-gray-200 to-transparent dark:from-gray-700"></div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {corePlugins.map((plugin, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                      {plugin.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {plugin.name}
                      </div>
                      <div className="truncate font-mono text-[10px] text-gray-400">
                        @embedpdf/{plugin.pkg}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Feature Plugins */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <div className="h-px flex-1 bg-gradient-to-r from-blue-200 to-transparent dark:from-blue-900"></div>
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Feature Plugins
                </span>
                <div className="h-px flex-1 bg-gradient-to-l from-blue-200 to-transparent dark:from-blue-900"></div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {featurePlugins.map((plugin, idx) => (
                  <div
                    key={idx}
                    className="group flex flex-col items-center rounded-lg border border-gray-100 bg-white p-3 text-center transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-700"
                  >
                    <div className="mb-1.5 rounded-md bg-gray-50 p-1.5 text-gray-500 transition-colors group-hover:bg-blue-50 group-hover:text-blue-600 dark:bg-gray-800 dark:text-gray-500 dark:group-hover:bg-blue-900/30 dark:group-hover:text-blue-400">
                      {plugin.icon}
                    </div>
                    <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                      {plugin.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-center lg:justify-start">
              <Link
                href="/docs/angular/headless/introduction"
                className="group inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                Explore all {corePlugins.length + featurePlugins.length}+
                plugins
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </div>

          {/* Right: headless Coming-soon callout */}
          <div className="order-2 min-w-0">
            <HeadlessV11Callout />
            <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50/50 p-4 dark:border-blue-900/30 dark:bg-blue-900/10">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-blue-100 p-1 dark:bg-blue-900/50">
                  <Zap size={14} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    Drop-in today, headless next
                  </div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Today you can import{' '}
                    <code className="rounded bg-gray-200 px-1 py-0.5 text-xs dark:bg-gray-800">
                      PDFViewer
                    </code>{' '}
                    from{' '}
                    <code className="rounded bg-gray-200 px-1 py-0.5 text-xs dark:bg-gray-800">
                      @embedpdf/angular-pdf-viewer
                    </code>
                    . The next release unlocks the full headless plugin surface
                    as Angular injectables.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const BentoGridSection = () => {
  return (
    <section className="mt-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
            Built for the Modern Angular Stack
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
            Technical excellence you can rely on. Designed for signals-first,
            zoneless Angular applications.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Card 1: TypeScript - Large */}
          <div className="group relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-8 transition-all hover:shadow-xl dark:border-gray-800 dark:bg-gray-900 md:col-span-2">
            <div className="absolute right-0 top-0 h-64 w-64 translate-x-1/3 translate-y-[-10%] rounded-full bg-blue-500/10 blur-3xl group-hover:bg-blue-500/20"></div>
            <div className="relative z-10 flex h-full flex-col justify-between">
              <div>
                <div className="mb-4 inline-flex rounded-lg bg-blue-100 p-3 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                  <FileCode size={24} />
                </div>
                <h3 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
                  First-Class TypeScript
                </h3>
                <p className="mb-6 max-w-md text-gray-600 dark:text-gray-400">
                  Not an afterthought. Every input, output, and signal is fully
                  typed — giving you a superior developer experience with robust
                  autocomplete inside Angular templates.
                </p>
              </div>
              {/* Code visual */}
              <div className="relative overflow-hidden rounded-xl border border-gray-100 bg-gray-50 p-4 font-mono text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-400">
                <div className="flex gap-2 opacity-50">
                  <span className="text-purple-500">interface</span>{' '}
                  ViewerConfig {'{'}
                </div>
                <div className="pl-4">
                  <span className="text-blue-500">src</span>:{' '}
                  <span className="text-green-500">string</span> |{' '}
                  <span className="text-green-500">Uint8Array</span>;
                </div>
                <div className="flex gap-2 opacity-50">{'}'}</div>
              </div>
            </div>
          </div>

          {/* Card 2: Virtualization */}
          <div className="group relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-8 transition-all hover:shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <div className="absolute right-0 top-0 h-48 w-48 translate-x-1/3 translate-y-[-10%] rounded-full bg-fuchsia-500/10 blur-3xl group-hover:bg-fuchsia-500/20"></div>
            <div className="relative z-10">
              <div className="mb-4 inline-flex rounded-lg bg-fuchsia-100 p-3 text-fuchsia-600 dark:bg-fuchsia-900/30 dark:text-fuchsia-400">
                <Activity size={24} />
              </div>
              <h3 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">
                Virtualization Engine
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Handle documents with thousands of pages. We only render what is
                visible in the viewport, keeping memory usage low and frame
                rates high.
              </p>
            </div>
          </div>

          {/* Card 3: SSR / Zoneless */}
          <div className="group relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-8 transition-all hover:shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <div className="absolute right-0 top-0 h-48 w-48 translate-x-1/3 translate-y-[-10%] rounded-full bg-green-500/10 blur-3xl group-hover:bg-green-500/20"></div>
            <div className="relative z-10">
              <div className="mb-4 inline-flex rounded-lg bg-green-100 p-3 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                <Server size={24} />
              </div>
              <h3 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">
                SSR &amp; Zoneless Ready
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Built for Angular Universal and{' '}
                <code>provideZonelessChangeDetection()</code>. Client-only
                browser APIs are isolated, so you don&apos;t fight hydration.
              </p>
            </div>
          </div>

          {/* Card 4: Tree Shaking - Large */}
          <div className="group relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-8 transition-all hover:shadow-xl dark:border-gray-800 dark:bg-gray-900 md:col-span-2">
            <div className="absolute right-0 top-0 h-64 w-64 translate-x-1/3 translate-y-[-10%] rounded-full bg-orange-500/10 blur-3xl group-hover:bg-orange-500/20"></div>
            <div className="relative z-10 flex h-full flex-col justify-between">
              <div>
                <div className="mb-4 inline-flex rounded-lg bg-orange-100 p-3 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                  <Package size={24} />
                </div>
                <h3 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
                  Modular &amp; Tree-Shakeable
                </h3>
                <p className="mb-6 max-w-md text-gray-600 dark:text-gray-400">
                  Don&apos;t ship a 5MB viewer when you only need to show a
                  simple invoice. Our modular architecture means you import only
                  the parts you need, keeping your initial bundle size tiny.
                </p>
              </div>
              {/* Size visual */}
              <div className="flex w-full items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/50">
                <div className="flex-1">
                  <div className="mb-1 flex justify-between text-xs font-medium">
                    <span className="text-gray-500">Core Viewer</span>
                    <span className="text-green-600">~25kb (gzipped)</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div className="h-full w-[15%] rounded-full bg-green-500"></div>
                  </div>
                </div>
                <div className="hidden h-8 w-px bg-gray-300 dark:bg-gray-700 sm:block"></div>
                <div className="flex-1 opacity-50 grayscale">
                  <div className="mb-1 flex justify-between text-xs font-medium">
                    <span className="text-gray-500">Typical PDF Viewer</span>
                    <span className="text-gray-500">~500kb+</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div className="h-full w-[85%] rounded-full bg-gray-400"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// Angular-flavored FAQ
const faqs = [
  {
    question: 'How is this different from ng2-pdf-viewer or pdf-js wrappers?',
    answer:
      "Most Angular PDF libraries wrap PDF.js. EmbedPDF uses a custom WebAssembly engine powered by PDFium (Google Chrome's PDF engine). This delivers significantly faster rendering, better accuracy, and a true headless architecture that gives you full UI control.",
  },
  {
    question: 'Does it work with the latest Angular and zoneless mode?',
    answer:
      'Yes. The viewer is built and tested against Angular 21, ships as a standalone component, and works under provideZonelessChangeDetection(). Change detection is driven by signals — there is no NgZone dependency.',
  },
  {
    question: 'Can I use it with Angular Material, PrimeNG, or Spartan/ng?',
    answer:
      "Absolutely. The drop-in viewer is unopinionated about your chrome — it renders its own surface inside <embedpdf-viewer>. Wrap it with Angular Material, PrimeNG, or Spartan/ng components for your toolbars, dialogs and layout. Once the headless release ships, the injectables give you total control over the viewer's UI too.",
  },
  {
    question: 'What about SSR — does it work with Angular Universal?',
    answer:
      "Yes. The viewer is a client-only component (it needs Canvas and WebAssembly). When rendered on the server it cleanly skips and hydrates on the client, so you don't get hydration mismatches.",
  },
  {
    question: 'Do I need a server or API key?',
    answer:
      "No. The viewer runs entirely in the user's browser using WebAssembly. Your documents stay on the client, and you don't need to pay for any cloud processing or manage API keys.",
  },
  {
    question: 'When does the headless Angular package ship?',
    answer:
      'The drop-in PDFViewer is available today. Headless Angular bindings (@embedpdf/core/angular plus injectXxx() helpers for every plugin) are scheduled for the next release. Track progress on the Angular integration discussion on GitHub.',
  },
]

const FAQSection = () => {
  return (
    <section className="mt-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
            Common Questions
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
            Everything you need to know about the EmbedPDF Angular integration.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {faqs.map((faq, idx) => (
            <div
              key={idx}
              className="group rounded-2xl border border-gray-200 bg-white p-8 transition-all hover:border-fuchsia-200 hover:shadow-lg dark:border-gray-800 dark:bg-gray-900 dark:hover:border-fuchsia-900"
            >
              <h3 className="mb-4 text-lg font-bold text-gray-900 dark:text-white">
                {faq.question}
              </h3>
              <p className="leading-relaxed text-gray-600 dark:text-gray-400">
                {faq.answer}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const CallToAction = () => {
  return (
    <div className="relative mb-20 mt-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
          {/* Background Gradients */}
          <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-pink-500/20 blur-3xl"></div>
          <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl"></div>
          <div className="bg-grid-pattern absolute inset-0 opacity-[0.03]"></div>

          <div className="relative px-6 py-16 text-center md:px-12 md:py-24">
            <h2 className="mx-auto mb-6 max-w-3xl text-4xl font-black tracking-tight text-gray-900 dark:text-white md:text-5xl">
              Ready to build your Angular PDF viewer?
            </h2>
            <p className="mx-auto mb-10 max-w-2xl text-xl text-gray-600 dark:text-gray-300">
              Join thousands of developers using EmbedPDF to create amazing
              document experiences.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/docs/angular"
                className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-gray-900 px-8 py-4 text-base font-medium text-white shadow-xl transition-all hover:scale-105 hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              >
                Start Building Now
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/sponsorship"
                className="inline-flex items-center justify-center rounded-full border-2 border-transparent bg-gray-100 px-8 py-4 text-base font-medium text-gray-900 transition-all hover:bg-gray-200 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
              >
                <Heart className="mr-2 h-5 w-5 text-red-500" />
                Support Development
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AngularPDFViewerPage() {
  return (
    <div className="relative min-h-screen">
      <AnimatedBackground />

      <Hero />

      <IntegrationPaths />

      {/* Full UI Showcase using the CodeShowcase component (framework="angular") */}
      <FullUiShowcase />

      {/* Demo of the Full UI — real Angular wrapper via useAngularMount */}
      <FullUiDemo />

      {/* Headless Architecture Section — coming-soon callout */}
      <HeadlessShowcase />

      {/* Tech Specs / Why Choose */}
      <BentoGridSection />

      <FAQSection />

      <CallToAction />
    </div>
  )
}
