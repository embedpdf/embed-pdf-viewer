'use client'
import React from 'react'
import {
  ArrowRight,
  Code,
  ExternalLink,
  Github,
  Heart,
  Play,
  Zap,
  Cpu,
  Check,
  Layers,
  Palette,
  Settings,
} from 'lucide-react'
import { JavaScript } from '@/components/icons/javascript'
import { Typescript } from '@/components/icons/typescript'
import { ReactIcon, VueIcon, SvelteIcon } from './framework-icons'
import { Scribble2 } from '@/components/icons/scribble2'
import Link from 'next/link'
import PDFViewer from './pdf-viewer'
import { CodeShowcase } from './code-showcase'

// Animated blobs for the background
const AnimatedBackground = () => {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Purple blob */}
      <div className="top-70 animate-blob absolute left-8 h-64 w-64 rounded-full bg-purple-500 opacity-10 mix-blend-multiply blur-3xl filter dark:opacity-20 dark:mix-blend-normal"></div>

      {/* Blue blob */}
      <div className="animate-blob animation-delay-2000 absolute -right-8 top-32 h-80 w-80 rounded-full bg-blue-500 opacity-10 mix-blend-multiply blur-3xl filter dark:opacity-20 dark:mix-blend-normal"></div>

      {/* Orange blob */}
      <div className="animate-blob animation-delay-4000 absolute bottom-24 left-20 h-72 w-72 rounded-full bg-orange-400 opacity-10 mix-blend-multiply blur-3xl filter dark:opacity-20 dark:mix-blend-normal"></div>

      {/* Subtle grid pattern */}
      <div className="bg-grid-pattern absolute inset-0 opacity-5 dark:opacity-[0.03]"></div>
    </div>
  )
}

const HeaderAndHero = () => {
  return (
    <div className="relative min-h-screen">
      <AnimatedBackground />

      {/* Hero Section */}
      <div className="pb-16 pt-20 sm:pt-24 lg:pt-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mb-6 inline-block rounded-full border border-purple-200 bg-purple-50 px-6 py-2 text-sm font-medium text-purple-800 dark:border-purple-800/30 dark:bg-purple-900/20 dark:text-purple-300">
                Open Source & Framework Agnostic
              </div>

              <h1 className="md:text-7xl text-5xl font-black leading-tight tracking-tight text-gray-900 dark:text-white sm:text-6xl">
                <span className="relative inline-block">
                  <span className="relative z-10">Embed PDF files</span>
                  <div className="absolute bottom-1 left-0 right-0 -z-10 h-4 -rotate-1 transform text-[#765ba7] opacity-50 dark:text-[#a78bfa]">
                    <Scribble2 color="currentColor" />
                  </div>
                </span>
                <br />
                <span className="">without the pain</span>
              </h1>

              <p className="relative mx-auto mt-8 max-w-2xl text-xl text-gray-600 dark:text-gray-400">
                The ultimate <strong>Open Source PDF viewer</strong> for
                JavaScript. Choose our drop-in component for instant results, or
                use our <strong>headless library</strong> to build a completely
                custom UI.
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-5 sm:flex-row">
                <Link
                  href="/docs"
                  className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-gray-900 px-8 py-4 text-base font-medium text-white shadow-xl transition-transform hover:scale-105 dark:bg-white dark:text-gray-900"
                >
                  <span className="absolute left-0 top-0 h-full w-full bg-gradient-to-r from-purple-600 via-blue-500 to-orange-400 opacity-0 transition-opacity group-hover:opacity-100"></span>
                  <span className="relative z-10 flex items-center group-hover:text-white">
                    Get Started
                    <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>

                {/* Bold Demo Button */}
                <a
                  href="https://app.embedpdf.com"
                  target="_blank"
                  rel="noreferrer"
                  className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-gradient-to-r from-purple-600 via-blue-500 to-orange-400 px-8 py-4 text-base font-medium text-white shadow-xl transition-all hover:scale-105 hover:shadow-2xl"
                >
                  <span className="absolute left-0 top-0 h-full w-full bg-gradient-to-r from-orange-400 via-red-500 to-pink-500 opacity-0 transition-opacity group-hover:opacity-100"></span>
                  <span className="relative z-10 flex items-center">
                    <div className="mr-3 rounded-full bg-white/20 p-1.5 backdrop-blur-sm">
                      <Play className="h-4 w-4 fill-current transition-transform group-hover:scale-110" />
                    </div>
                    Live Demo
                  </span>

                  {/* Animated ring */}
                  <div className="absolute inset-0 rounded-full border-2 border-white/30 transition-all group-hover:scale-110 group-hover:border-white/50"></div>
                </a>

                <a
                  href="https://github.com/embedpdf/embed-pdf-viewer"
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex items-center justify-center px-5 py-3 text-base font-medium text-gray-700 transition-all hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                >
                  <div className="flex items-center space-x-2 border-b border-dashed border-gray-300 group-hover:border-gray-600 dark:border-gray-600 dark:group-hover:border-white">
                    <Github />
                    <span>Source on GitHub</span>
                  </div>
                </a>
              </div>

              {/* Technology badges */}
              <div className="mt-8 flex items-center justify-center gap-8">
                <div className="flex flex-col items-center text-gray-600 dark:text-gray-400">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-gray-800">
                    <JavaScript />
                  </div>
                  <div className="mt-2 text-sm font-medium">JavaScript</div>
                </div>
                <div className="flex flex-col items-center text-gray-600 dark:text-gray-400">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-gray-800">
                    <Typescript />
                  </div>
                  <div className="mt-2 text-sm font-medium">TypeScript</div>
                </div>
              </div>

              {/* Two Paths Section */}
              <div className="mt-24">
                <div className="mb-12 text-center">
                  <h2 className="text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
                    Two ways to integrate
                  </h2>
                  <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
                    Choose the level of control that fits your project
                  </p>
                </div>

                <div className="grid gap-8 text-left md:grid-cols-2">
                  {/* Path 1: Snippet / Ready-made */}
                  <div className="group relative flex h-full flex-col rounded-3xl border border-gray-200 bg-white p-8 shadow-sm transition-all hover:shadow-xl dark:border-gray-800 dark:bg-gray-900">
                    <div className="absolute right-0 top-0 p-6 text-purple-600 opacity-5 dark:text-purple-400 dark:opacity-10">
                      <Zap size={120} strokeWidth={1} />
                    </div>
                    <h3 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
                      Ready-made Viewer
                    </h3>
                    <div className="mb-4 inline-flex w-fit rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
                      Batteries Included
                    </div>
                    <p className="mb-6 min-h-[3rem] text-gray-600 dark:text-gray-400">
                      A polished, production-ready PDF viewer that drops into
                      your app in seconds. Perfect for standard use cases.
                    </p>
                    <ul className="mb-8 flex-grow space-y-3 text-gray-600 dark:text-gray-400">
                      <li className="flex items-center gap-2">
                        <Check className="h-5 w-5 text-green-500" /> Beautiful
                        default UI
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-5 w-5 text-green-500" /> 2 lines of
                        code
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-5 w-5 text-green-500" /> Fully
                        responsive & accessible
                      </li>
                    </ul>
                    <div className="mb-6 overflow-x-auto rounded-lg border border-gray-200 bg-gray-100 p-3 font-mono text-xs dark:border-gray-700 dark:bg-gray-800">
                      npm install @embedpdf/snippet
                    </div>

                    <div className="mt-auto">
                      <div className="tracking-wider mb-3 text-sm font-semibold uppercase text-gray-500 dark:text-gray-400">
                        Get Started
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href="/docs/snippet/getting-started#1-vanilla-htmljs-easiest"
                          className="group/btn flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                        >
                          <div className="flex h-5 w-5 items-center justify-center overflow-hidden">
                            <JavaScript />
                          </div>
                          <span className="font-medium text-gray-700 dark:text-gray-200">
                            Vanilla JS
                          </span>
                          <ArrowRight className="-ml-1 h-4 w-4 text-gray-400 opacity-0 transition-all group-hover/btn:ml-0 group-hover/btn:text-gray-600 group-hover/btn:opacity-100 dark:text-gray-500 dark:group-hover/btn:text-gray-300" />
                        </Link>
                        <Link
                          href="/docs/snippet/getting-started#2-framework-components"
                          className="group/btn flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                        >
                          <ReactIcon className="h-5 w-5 text-[#61DAFB]" />
                          <span className="font-medium text-gray-700 dark:text-gray-200">
                            React
                          </span>
                          <ArrowRight className="-ml-1 h-4 w-4 text-gray-400 opacity-0 transition-all group-hover/btn:ml-0 group-hover/btn:text-gray-600 group-hover/btn:opacity-100 dark:text-gray-500 dark:group-hover/btn:text-gray-300" />
                        </Link>
                        <Link
                          href="/docs/snippet/getting-started#2-framework-components"
                          className="group/btn flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                        >
                          <VueIcon className="h-5 w-5 text-[#4FC08D]" />
                          <span className="font-medium text-gray-700 dark:text-gray-200">
                            Vue
                          </span>
                          <ArrowRight className="-ml-1 h-4 w-4 text-gray-400 opacity-0 transition-all group-hover/btn:ml-0 group-hover/btn:text-gray-600 group-hover/btn:opacity-100 dark:text-gray-500 dark:group-hover/btn:text-gray-300" />
                        </Link>
                        <Link
                          href="/docs/snippet/getting-started#2-framework-components"
                          className="group/btn flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                        >
                          <SvelteIcon className="h-5 w-5 text-[#FF3E00]" />
                          <span className="font-medium text-gray-700 dark:text-gray-200">
                            Svelte
                          </span>
                          <ArrowRight className="-ml-1 h-4 w-4 text-gray-400 opacity-0 transition-all group-hover/btn:ml-0 group-hover/btn:text-gray-600 group-hover/btn:opacity-100 dark:text-gray-500 dark:group-hover/btn:text-gray-300" />
                        </Link>
                      </div>
                    </div>
                  </div>

                  {/* Path 2: Headless */}
                  <div className="group relative flex h-full flex-col rounded-3xl border border-gray-200 bg-white p-8 shadow-sm transition-all hover:shadow-xl dark:border-gray-800 dark:bg-gray-900">
                    <div className="absolute right-0 top-0 p-6 text-blue-600 opacity-5 dark:text-blue-400 dark:opacity-10">
                      <Cpu size={120} strokeWidth={1} />
                    </div>
                    <h3 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
                      Headless Components
                    </h3>
                    <div className="mb-4 inline-flex w-fit rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                      Full Control
                    </div>
                    <p className="mb-6 min-h-[3rem] text-gray-600 dark:text-gray-400">
                      Build your own custom viewer UI from scratch. We provide
                      the engine, you control the pixels.
                    </p>
                    <ul className="mb-8 flex-grow space-y-3 text-gray-600 dark:text-gray-400">
                      <li className="flex items-center gap-2">
                        <Check className="h-5 w-5 text-blue-500" /> 100% UI
                        Control
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-5 w-5 text-blue-500" /> Tiny bundle
                        size
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-5 w-5 text-blue-500" /> React, Vue,
                        Svelte hooks
                      </li>
                    </ul>
                    <div className="mb-6 overflow-x-auto rounded-lg border border-gray-200 bg-gray-100 p-3 font-mono text-xs dark:border-gray-700 dark:bg-gray-800">
                      npm install @embedpdf/core
                    </div>

                    <div className="mt-auto">
                      <div className="tracking-wider mb-3 text-sm font-semibold uppercase text-gray-500 dark:text-gray-400">
                        Read Documentation
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href="/docs/react/introduction"
                          className="group/btn flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                        >
                          <ReactIcon className="h-5 w-5 text-[#61DAFB]" />
                          <span className="font-medium text-gray-700 dark:text-gray-200">
                            React
                          </span>
                          <ArrowRight className="-ml-1 h-4 w-4 text-gray-400 opacity-0 transition-all group-hover/btn:ml-0 group-hover/btn:text-gray-600 group-hover/btn:opacity-100 dark:text-gray-500 dark:group-hover/btn:text-gray-300" />
                        </Link>
                        <Link
                          href="/docs/vue/introduction"
                          className="group/btn flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                        >
                          <VueIcon className="h-5 w-5 text-[#4FC08D]" />
                          <span className="font-medium text-gray-700 dark:text-gray-200">
                            Vue
                          </span>
                          <ArrowRight className="-ml-1 h-4 w-4 text-gray-400 opacity-0 transition-all group-hover/btn:ml-0 group-hover/btn:text-gray-600 group-hover/btn:opacity-100 dark:text-gray-500 dark:group-hover/btn:text-gray-300" />
                        </Link>
                        <Link
                          href="/docs/svelte/introduction"
                          className="group/btn flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                        >
                          <SvelteIcon className="h-5 w-5 text-[#FF3E00]" />
                          <span className="font-medium text-gray-700 dark:text-gray-200">
                            Svelte
                          </span>
                          <ArrowRight className="-ml-1 h-4 w-4 text-gray-400 opacity-0 transition-all group-hover/btn:ml-0 group-hover/btn:text-gray-600 group-hover/btn:opacity-100 dark:text-gray-500 dark:group-hover/btn:text-gray-300" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Feature cards - Updated UI */}
              <div className="mt-24 grid grid-cols-1 gap-8 md:grid-cols-3">
                {/* Card 1 */}
                <div className="group relative flex h-full flex-col items-center rounded-2xl border border-gray-200 bg-white p-8 transition-all hover:shadow-xl dark:border-gray-800 dark:bg-gray-900">
                  <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                    <Heart size={24} />
                  </div>
                  <h3 className="mb-3 text-xl font-bold text-gray-900 dark:text-white">
                    Truly Open Source
                  </h3>
                  <p className="text-base leading-relaxed text-gray-600 dark:text-gray-400">
                    MIT licensed core. Whether you use the snippet or headless,
                    you own the code. No black boxes.
                  </p>
                </div>

                {/* Card 2 */}
                <div className="group relative flex h-full flex-col items-center rounded-2xl border border-gray-200 bg-white p-8 transition-all hover:shadow-xl dark:border-gray-800 dark:bg-gray-900">
                  <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    <Settings size={24} />
                  </div>
                  <h3 className="mb-3 text-xl font-bold text-gray-900 dark:text-white">
                    Flexible Architecture
                  </h3>
                  <p className="text-base leading-relaxed text-gray-600 dark:text-gray-400">
                    Configurable theming for the Viewer, or 100% pixel-perfect
                    control with our Headless libraries.
                  </p>
                </div>

                {/* Card 3 */}
                <div className="group relative flex h-full flex-col items-center rounded-2xl border border-gray-200 bg-white p-8 transition-all hover:shadow-xl dark:border-gray-800 dark:bg-gray-900">
                  <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                    <Layers size={24} />
                  </div>
                  <h3 className="mb-3 text-xl font-bold text-gray-900 dark:text-white">
                    Universal Compatibility
                  </h3>
                  <p className="text-base leading-relaxed text-gray-600 dark:text-gray-400">
                    Works with any framework. Drop the snippet in a legacy app,
                    or build a modern React/Vue/Svelte SPA.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-24">
          {/* Embed Code Section - Explicitly for Ready-made Viewer */}
          <div className="relative mb-24">
            <div className="mx-auto max-w-4xl px-4">
              {/* Header */}
              <div className="mb-8 text-center">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  <Zap size={14} /> Ready-made Viewer
                </div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
                  Drop-in Integration
                </h2>
                <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
                  See how easy it is to add the pre-built viewer to your app.
                </p>
              </div>

              <CodeShowcase />

              <div className="mt-8 flex justify-center">
                <Link
                  href="/docs/snippet/introduction"
                  className="group inline-flex items-center justify-center rounded-full bg-gray-900 px-6 py-3 text-sm font-medium text-white shadow-lg transition-transform hover:scale-105 dark:bg-white dark:text-gray-900"
                >
                  Read Snippet Documentation
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </div>
          </div>

          {/* Interactive Demo Section - Explicitly for Ready-made Viewer */}
          <div className="relative">
            {/* Header with arrow and call-to-action */}
            <div className="mb-8 text-center">
              <div className="relative inline-block">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
                  Try the Ready-made Viewer
                </h2>
              </div>
              <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
                This is the default UI you get with our snippet. <br />
                <span className="text-sm opacity-80">
                  Don&apos;t like how it looks? Use Headless to build something
                  completely different.
                </span>
              </p>
            </div>

            {/* PDF Viewer with enhanced styling */}
            <div className="group relative mx-auto max-w-4xl px-4">
              {/* Main viewer container */}
              <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
                <PDFViewer className="h-[500px] w-full md:h-[700px]" />
              </div>

              <div className="mt-8 flex justify-center">
                <Link
                  href="/docs/snippet/getting-started"
                  className="group inline-flex items-center justify-center rounded-full bg-gradient-to-r from-purple-600 via-blue-500 to-orange-400 px-8 py-3 text-sm font-medium text-white shadow-lg transition-transform hover:scale-105"
                >
                  Get Started with Snippet
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </div>
          </div>

          {/* NEW SECTION: Headless Capabilities */}
          <div className="relative mt-32 px-4">
            <div className="mx-auto max-w-6xl">
              <div className="mb-12 text-center">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  <Cpu size={14} /> Headless Components
                </div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
                  Why go Headless?
                </h2>
                <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
                  When the standard UI holds you back, our headless libraries
                  set you free.
                </p>
              </div>

              <div className="grid gap-8 md:grid-cols-3">
                <div className="flex h-full flex-col items-center rounded-2xl bg-gray-50 p-6 text-center dark:bg-gray-800/50">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    <Palette size={24} />
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-gray-900 dark:text-white">
                    Native Look & Feel
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Seamlessly blend the viewer into your app. Render PDF pages
                    directly inside your own components.
                  </p>
                </div>
                <div className="flex h-full flex-col items-center rounded-2xl bg-gray-50 p-6 text-center dark:bg-gray-800/50">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                    <Layers size={24} />
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-gray-900 dark:text-white">
                    Deep Integration
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Overlay custom data, build annotation tools that sync with
                    your backend, or create AI-powered analysis views.
                  </p>
                </div>
                <div className="flex h-full flex-col items-center rounded-2xl bg-gray-50 p-6 text-center dark:bg-gray-800/50">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                    <Zap size={24} />
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-gray-900 dark:text-white">
                    Performance First
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Load only what you need. No bloated UI bundles. Perfect for
                    mobile apps and high-performance dashboards.
                  </p>
                </div>
              </div>

              <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
                <Link
                  href="/docs/react/introduction"
                  className="group flex w-full items-center justify-center gap-3 rounded-full border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-blue-700 sm:w-auto"
                >
                  <ReactIcon className="h-5 w-5 text-[#61DAFB]" />
                  <span>React Docs</span>
                </Link>
                <Link
                  href="/docs/vue/introduction"
                  className="group flex w-full items-center justify-center gap-3 rounded-full border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-emerald-700 sm:w-auto"
                >
                  <VueIcon className="h-5 w-5 text-[#4FC08D]" />
                  <span>Vue Docs</span>
                </Link>
                <Link
                  href="/docs/svelte/introduction"
                  className="group flex w-full items-center justify-center gap-3 rounded-full border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-orange-300 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-orange-700 sm:w-auto"
                >
                  <SvelteIcon className="h-5 w-5 text-[#FF3E00]" />
                  <span>Svelte Docs</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Testimonials section */}
          <div className="relative mt-24 px-4">
            <div className="mx-auto max-w-6xl">
              {/* Section header */}
              <div className="mb-12 text-center">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
                  Loved by developers
                </h2>
                <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
                  See what teams are building with EmbedPDF
                </p>
              </div>

              {/* Testimonials grid */}
              <div className="grid gap-8 md:grid-cols-2">
                {/* Stirling PDF Testimonial */}
                <div className="group relative">
                  <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-red-500/20 via-orange-500/20 to-yellow-500/20 opacity-0 blur-xl transition-all duration-500 group-hover:opacity-100"></div>
                  <div className="relative flex h-full flex-col rounded-2xl border border-gray-200/50 bg-white/80 p-8 shadow-xl backdrop-blur-sm transition-all duration-300 hover:shadow-2xl dark:border-gray-700/50 dark:bg-gray-900/80">
                    {/* Quote mark */}
                    <div className="text-7xl absolute -top-4 left-8 font-serif text-red-200 dark:text-red-900/50">
                      &quot;
                    </div>

                    {/* Company logo */}
                    <div className="mb-6 flex items-center justify-between">
                      <div className="flex h-12 items-center gap-3">
                        <img
                          src="/testimonials/stirling-logo.svg"
                          alt="Stirling PDF"
                          className="h-10 w-auto"
                        />
                        <span className="text-xl font-bold text-gray-900 dark:text-white">
                          Stirling-PDF
                        </span>
                      </div>
                      <div className="rounded-full bg-gradient-to-r from-red-500/10 to-orange-500/10 px-3 py-1 text-xs font-medium text-red-700 dark:text-red-400">
                        PDF Tools
                      </div>
                    </div>

                    {/* Quote */}
                    <blockquote className="relative z-10 mb-6 flex-grow text-lg leading-relaxed text-gray-700 dark:text-gray-300">
                      I love the modular plugin architecture, the flexibility to
                      integrate and customize however we need has been
                      invaluable. A great open-source product with an amazing
                      license and community of developers ready to help.
                    </blockquote>

                    {/* Author */}
                    <div className="flex items-center border-t border-gray-100 pt-6 dark:border-gray-800">
                      <div className="relative">
                        <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-red-500 to-orange-500 opacity-50 blur"></div>
                        <img
                          src="/testimonials/stirling-founder.webp"
                          alt="Anthony Stirling"
                          className="relative h-14 w-14 rounded-full border-2 border-white object-cover shadow-lg dark:border-gray-800"
                        />
                      </div>
                      <div className="ml-4">
                        <div className="font-semibold text-gray-900 dark:text-white">
                          Anthony Stirling
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          CTO & Founder
                        </div>
                        <div className="mt-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                          Stirling PDF
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Grella Testimonial */}
                <div className="group relative">
                  <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-purple-500/20 via-violet-500/20 to-indigo-500/20 opacity-0 blur-xl transition-all duration-500 group-hover:opacity-100"></div>
                  <div className="relative flex h-full flex-col rounded-2xl border border-gray-200/50 bg-white/80 p-8 shadow-xl backdrop-blur-sm transition-all duration-300 hover:shadow-2xl dark:border-gray-700/50 dark:bg-gray-900/80">
                    {/* Quote mark */}
                    <div className="text-7xl absolute -top-4 left-8 font-serif text-purple-200 dark:text-purple-900/50">
                      &quot;
                    </div>

                    {/* Company logo */}
                    <div className="mb-6 flex items-center justify-between">
                      <div className="flex h-12 items-center">
                        <img
                          src="/testimonials/grella-logo.svg"
                          alt="Grella"
                          className="h-8 w-auto"
                        />
                      </div>
                      <div className="rounded-full bg-gradient-to-r from-purple-500/10 to-violet-500/10 px-3 py-1 text-xs font-medium text-purple-700 dark:text-purple-400">
                        AI Citations
                      </div>
                    </div>

                    {/* Quote */}
                    <blockquote className="relative z-10 mb-6 flex-grow text-lg leading-relaxed text-gray-700 dark:text-gray-300">
                      After fighting with PDF.js in the browser, we found
                      EmbedPDF with its first-class Svelte support. Within
                      minutes we had something working, its extensible nature
                      gave us the control we needed to build citation
                      highlighting on top. Not a single regret.
                    </blockquote>

                    {/* Author */}
                    <div className="flex items-center border-t border-gray-100 pt-6 dark:border-gray-800">
                      <div className="relative">
                        <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-purple-500 to-violet-500 opacity-50 blur"></div>
                        <img
                          src="/testimonials/grella-founder.jpg"
                          alt="Xander Aguinaldo"
                          className="relative h-14 w-14 rounded-full border-2 border-white object-cover shadow-lg dark:border-gray-800"
                        />
                      </div>
                      <div className="ml-4">
                        <div className="font-semibold text-gray-900 dark:text-white">
                          Xander Aguinaldo
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Founder
                        </div>
                        <div className="mt-0.5 text-xs font-medium text-purple-600 dark:text-purple-400">
                          Grella
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative mb-20 mt-32 px-4">
            <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
              {/* Background Gradients */}
              <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-purple-500/20 blur-3xl"></div>
              <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl"></div>
              <div className="bg-grid-pattern absolute inset-0 opacity-[0.03]"></div>

              <div className="relative px-6 py-16 text-center md:px-12 md:py-24">
                <h2 className="mx-auto mb-6 max-w-3xl text-4xl font-black tracking-tight text-gray-900 dark:text-white md:text-5xl">
                  Ready to transform your PDF experience?
                </h2>
                <p className="mx-auto mb-10 max-w-2xl text-xl text-gray-600 dark:text-gray-300">
                  Join thousands of developers who have chosen the open-source
                  path. No vendor lock-in, no black boxes, just code.
                </p>
                <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <Link
                    href="/docs"
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
      </div>
    </div>
  )
}

export default HeaderAndHero
