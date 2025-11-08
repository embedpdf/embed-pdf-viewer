'use client'

import React, { useState } from 'react'
import {
  ArrowRight,
  Book,
  Code,
  Package,
  Github,
  Search,
  Terminal,
  Zap,
  FileText,
  Settings,
  Menu,
  ChevronRight,
  ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
import { Scribble3 } from './icons/scribble3'
import DiscordIcon from './icons/discord'
import NeedHelp from './need-help'
import { ReactIcon, VueIcon, SvelteIcon } from './framework-icons'

// Mock documentation packages data
const packages = [
  {
    id: 'snippet',
    name: '@embedpdf/snippet',
    description:
      'The complete, highest-level package with built-in UI and controls. Drop it into any website with just a simple snippet - no build tools required.',
    icon: <Code className="h-6 w-6 text-white" />,
    color: 'from-emerald-500 to-teal-600',
    tags: ['Complete UI', 'Ready to Use', 'No Build Required'],
    sections: [{ title: 'Introduction', url: '/docs/snippet/introduction' }],
    url: '/docs/snippet/introduction',
    latestVersion: '1.0.0',
    lastUpdated: 'May 29, 2025',
  },
  {
    id: 'engine',
    name: '@embedpdf/engines',
    description:
      'Pluggable rendering engines for EmbedPDF. Ships with PdfiumEngine – a high‑level, promise‑first wrapper with advanced PDF processing capabilities.',
    icon: <Zap className="h-6 w-6 text-white" />,
    color: 'from-blue-600 to-cyan-600',
    tags: ['High-level API', 'Universal Runtime', 'TypeScript', 'PDFium'],
    sections: [{ title: 'Introduction', url: '/docs/engines/introduction' }],
    url: '/docs/engines/introduction',
    latestVersion: '1.0.0',
    lastUpdated: 'May 29, 2025',
  },
  {
    id: 'pdfium',
    name: '@embedpdf/pdfium',
    description:
      'JavaScript API wrapper for PDFium rendering engine, providing low-level PDF manipulation capabilities.',
    icon: <FileText className="h-6 w-6 text-white" />,
    color: 'from-purple-600 to-blue-700',
    tags: ['Core', 'Rendering', 'Low-level API'],
    sections: [
      { title: 'Introduction', url: '/docs/pdfium/introduction' },
      { title: 'Getting Started', url: '/docs/pdfium/getting-started' },
    ],
    url: '/docs/pdfium/introduction',
    latestVersion: '1.0.0',
    lastUpdated: 'May 29, 2025',
  },
  /*
  {
    id: "engine",
    name: "@embedpdf/engine",
    description: "Pre-built rendering engine with higher-level abstractions for common PDF viewing and interaction needs.",
    icon: <Zap className="h-6 w-6 text-white" />,
    color: "from-blue-600 to-cyan-600",
    tags: ["Viewer", "High-level API", "UI Components"],
    sections: [
      { title: "Getting Started", url: "/docs/engine/getting-started" },
      { title: "Configuration", url: "/docs/engine/configuration" },
      { title: "Annotations", url: "/docs/engine/annotations" },
      { title: "Events", url: "/docs/engine/events" },
      { title: "Customization", url: "/docs/engine/customization" }
    ],
    latestVersion: "3.1.2",
    lastUpdated: "March 4, 2025"
  },
  {
    id: "react",
    name: "@embedpdf/react",
    description: "React components for seamlessly integrating PDF viewing capabilities into your React applications.",
    icon: <Code className="h-6 w-6 text-white" />,
    color: "from-cyan-600 to-teal-600",
    tags: ["React", "Components", "Hooks"],
    sections: [
      { title: "Installation", url: "/docs/react/installation" },
      { title: "Basic Usage", url: "/docs/react/basic-usage" },
      { title: "Props Reference", url: "/docs/react/props" },
      { title: "Hooks", url: "/docs/react/hooks" },
      { title: "Custom Rendering", url: "/docs/react/custom-rendering" }
    ],
    latestVersion: "2.2.0",
    lastUpdated: "February 15, 2025"
  },
  {
    id: "vue",
    name: "@embedpdf/vue",
    description: "Vue.js components for integrating PDF viewing capabilities into your Vue applications.",
    icon: <Code className="h-6 w-6 text-white" />,
    color: "from-teal-600 to-green-600",
    tags: ["Vue", "Components", "Composition API"],
    sections: [
      { title: "Installation", url: "/docs/vue/installation" },
      { title: "Basic Usage", url: "/docs/vue/basic-usage" },
      { title: "Props Reference", url: "/docs/vue/props" },
      { title: "Events", url: "/docs/vue/events" },
      { title: "Slots & Templates", url: "/docs/vue/slots" }
    ],
    latestVersion: "2.0.1",
    lastUpdated: "January 20, 2025"
  },
  {
    id: "annotations",
    name: "@embedpdf/annotations",
    description: "Advanced PDF annotation capabilities that can be used with any of the EmbedPDF packages.",
    icon: <Settings className="h-6 w-6 text-white" />,
    color: "from-green-600 to-yellow-500",
    tags: ["Annotations", "Markup", "Collaboration"],
    sections: [
      { title: "Overview", url: "/docs/annotations/overview" },
      { title: "Creating Annotations", url: "/docs/annotations/creating" },
      { title: "Styles & Formatting", url: "/docs/annotations/styles" },
      { title: "Persistence", url: "/docs/annotations/persistence" },
      { title: "Collaboration", url: "/docs/annotations/collaboration" }
    ],
    latestVersion: "1.4.0",
    lastUpdated: "March 1, 2025"
  },
  {
    id: "cli",
    name: "@embedpdf/cli",
    description: "Command-line tools for PDF processing, conversion, and optimization.",
    icon: <Terminal className="h-6 w-6 text-white" />,
    color: "from-yellow-500 to-orange-500",
    tags: ["CLI", "Tools", "Automation"],
    sections: [
      { title: "Installation", url: "/docs/cli/installation" },
      { title: "Commands", url: "/docs/cli/commands" },
      { title: "PDF Conversion", url: "/docs/cli/conversion" },
      { title: "Optimization", url: "/docs/cli/optimization" },
      { title: "Scripting", url: "/docs/cli/scripting" }
    ],
    latestVersion: "1.1.0",
    lastUpdated: "January 10, 2025"
  }*/
]

// Animated background
const AnimatedBackground = () => {
  return (
    <div className="absolute inset-0 -z-10">
      {/* Gradient circles */}
      <div className="animate-blob absolute left-10 top-20 h-64 w-64 rounded-full bg-purple-500 opacity-10 mix-blend-multiply blur-3xl filter"></div>
      <div className="animate-blob animation-delay-2000 absolute right-10 top-40 h-72 w-72 rounded-full bg-blue-500 opacity-10 mix-blend-multiply blur-3xl filter"></div>
      <div className="animate-blob animation-delay-4000 absolute bottom-32 left-20 h-80 w-80 rounded-full bg-teal-500 opacity-10 mix-blend-multiply blur-3xl filter"></div>

      {/* Documentation pattern */}
      <div className="bg-grid-pattern opacity-3 absolute inset-0"></div>
    </div>
  )
}

// Package card
const PackageCard = ({
  pkg,
}: {
  pkg: {
    id: string
    name: string
    description: string
    icon: React.ReactNode
    color: string
    tags: string[]
    sections: { title: string; url: string }[]
    latestVersion: string
    lastUpdated: string
    url: string
  }
}) => {
  return (
    <div className="group relative">
      <div
        className={`absolute -inset-0.5 bg-gradient-to-r ${pkg.color} rounded-2xl opacity-10 blur transition duration-300 group-hover:opacity-30`}
      ></div>
      <div className="relative flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-md">
        <div className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div
              className={`h-12 w-12 rounded-lg bg-gradient-to-br ${pkg.color} flex items-center justify-center`}
            >
              {pkg.icon}
            </div>
          </div>

          <h3 className="mb-2 font-mono text-xl font-bold text-gray-900 transition-colors group-hover:text-blue-600">
            {pkg.name}
          </h3>

          <p className="mb-6 text-gray-600">{pkg.description}</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {pkg.tags.map((tag, index) => (
              <span
                key={index}
                className="inline-flex items-center whitespace-nowrap rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700"
              >
                {tag}
              </span>
            ))}
          </div>
          {/*<div className="flex items-center text-sm text-gray-500 mb-4">
            <span className="font-mono bg-gray-100 px-2 py-1 rounded text-gray-700">v{pkg.latestVersion}</span>
            <span className="mx-2">•</span>
            <span>Updated: {pkg.lastUpdated}</span>
          </div>*/}

          <div className="mt-auto border-t border-gray-100 pt-4">
            <h4 className="mb-2 font-medium text-gray-900">Documentation:</h4>
            <ul className="mb-6 space-y-1">
              {pkg.sections.map(
                (section: { title: string; url: string }, index: number) => (
                  <li key={index}>
                    <Link
                      href={section.url}
                      className="flex items-center text-gray-600 transition-all hover:pl-1 hover:text-blue-600"
                    >
                      <ChevronRight size={14} className="mr-1" />
                      {section.title}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </div>

          <Link
            href={pkg.url}
            className={`inline-flex items-center rounded-full bg-gradient-to-r px-4 py-2 ${pkg.color} text-sm font-medium text-white transition-shadow hover:shadow-md`}
          >
            View Full Documentation
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}

// Framework Getting Started Card
const FrameworkGettingStartedCard = () => {
  return (
    <div className="relative mb-16 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white shadow-2xl">
      {/* Animated background orbs */}
      <div className="absolute right-0 top-0 h-80 w-80 -translate-y-1/3 translate-x-1/3 transform animate-pulse rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 opacity-20 blur-3xl"></div>
      <div className="animation-delay-2000 absolute bottom-0 left-0 h-72 w-72 -translate-x-1/3 translate-y-1/3 transform animate-pulse rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 opacity-25 blur-3xl"></div>
      <div className="animation-delay-4000 absolute right-1/4 top-1/2 h-64 w-64 -translate-y-1/2 transform animate-pulse rounded-full bg-gradient-to-br from-violet-400 to-purple-600 opacity-15 blur-3xl"></div>

      <div className="relative z-10 p-8 md:p-12">
        <div className="mb-12 text-center">
          <div className="mb-6 inline-block rounded-full border border-cyan-400/30 bg-cyan-400/10 px-6 py-2 text-sm font-bold text-slate-300 backdrop-blur-sm">
            ⚡&nbsp;&nbsp;Start Building Now
          </div>
          <h2 className="mb-6 text-4xl font-black leading-tight tracking-tight md:text-5xl">
            <span className="bg-gradient-to-r from-cyan-300 via-blue-300 to-purple-300 bg-clip-text text-transparent">
              Jump into your
            </span>
            <span className="block bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-300 bg-clip-text text-transparent">
              favorite framework
            </span>
          </h2>
          <p className="mx-auto max-w-3xl text-xl leading-relaxed text-slate-300">
            Headless PDF components that fit any UI framework. Get PDF viewing
            working in your app with our framework-specific guides designed by
            developers, for developers.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* React Card */}
          <div className="group relative flex">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 opacity-15 blur transition duration-300 group-hover:opacity-25"></div>
            <div className="relative flex w-full flex-col overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-800/80 backdrop-blur-sm">
              {/* Header */}
              <div className="border-b border-slate-700/50 bg-slate-800/50 px-8 py-6">
                <div className="flex items-center space-x-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600">
                    <ReactIcon className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">React</h3>
                    <p className="text-slate-400">Components & Hooks</p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex flex-1 flex-col p-8">
                <div className="mb-8 flex-1">
                  <h4 className="mb-4 text-lg font-bold text-white">
                    What you&apos;ll get:
                  </h4>
                  <ul className="space-y-3">
                    <li className="flex items-center text-slate-300">
                      <div className="mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-cyan-400"></div>
                      Pre-built PDF viewer components
                    </li>
                    <li className="flex items-center text-slate-300">
                      <div className="mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-blue-400"></div>
                      Custom hooks for PDF interactions
                    </li>
                    <li className="flex items-center text-slate-300">
                      <div className="mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-purple-400"></div>
                      TypeScript support out of the box
                    </li>
                    <li className="flex items-center text-slate-300">
                      <div className="mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-cyan-400"></div>
                      Seamless React lifecycle integration
                    </li>
                  </ul>
                </div>

                <Link
                  href="/docs/react/introduction"
                  className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-8 py-4 text-lg font-bold text-white shadow-lg transition-all hover:scale-105 hover:from-cyan-500 hover:to-blue-500 hover:shadow-xl"
                >
                  <span>Start with React</span>
                  <ArrowRight className="ml-3 h-6 w-6" />
                </Link>
              </div>
            </div>
          </div>

          {/* Vue Card */}
          <div className="group relative flex">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 opacity-15 blur transition duration-300 group-hover:opacity-25"></div>
            <div className="relative flex w-full flex-col overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-800/80 backdrop-blur-sm">
              {/* Header */}
              <div className="border-b border-slate-700/50 bg-slate-800/50 px-8 py-6">
                <div className="flex items-center space-x-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
                    <VueIcon className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">Vue</h3>
                    <p className="text-slate-400">Composition API</p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex flex-1 flex-col p-8">
                <div className="mb-8 flex-1">
                  <h4 className="mb-4 text-lg font-bold text-white">
                    What you&apos;ll get:
                  </h4>
                  <ul className="space-y-3">
                    <li className="flex items-center text-slate-300">
                      <div className="mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-emerald-400"></div>
                      Vue 3 compatible components
                    </li>
                    <li className="flex items-center text-slate-300">
                      <div className="mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-teal-400"></div>
                      Composition API composables
                    </li>
                    <li className="flex items-center text-slate-300">
                      <div className="mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-green-400"></div>
                      Reactive PDF state management
                    </li>
                    <li className="flex items-center text-slate-300">
                      <div className="mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-emerald-400"></div>
                      TypeScript support with Vue types
                    </li>
                  </ul>
                </div>

                <Link
                  href="/docs/vue/introduction"
                  className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-8 py-4 text-lg font-bold text-white shadow-lg transition-all hover:scale-105 hover:from-emerald-500 hover:to-teal-500 hover:shadow-xl"
                >
                  <span>Start with Vue.js</span>
                  <ArrowRight className="ml-3 h-6 w-6" />
                </Link>
              </div>
            </div>
          </div>

          {/* Svelte Card */}
          <div className="group relative flex">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 opacity-10 blur transition duration-300 group-hover:opacity-20"></div>
            <div className="relative flex w-full flex-col overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-800/80 backdrop-blur-sm">
              {/* Header */}
              <div className="border-b border-slate-700/50 bg-slate-800/50 px-8 py-6">
                <div className="flex items-center space-x-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-red-600">
                    <SvelteIcon className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">Svelte</h3>
                    <p className="text-slate-400">Runes & Reactivity</p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex flex-1 flex-col p-8">
                <div className="mb-8 flex-1">
                  <h4 className="mb-4 text-lg font-bold text-white">
                    What you&apos;ll get:
                  </h4>
                  <ul className="space-y-3">
                    <li className="flex items-center text-slate-300">
                      <div className="mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-orange-400"></div>
                      Svelte 5 compatible components
                    </li>
                    <li className="flex items-center text-slate-300">
                      <div className="mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-red-400"></div>
                      Modern runes API ($state, $effect)
                    </li>
                    <li className="flex items-center text-slate-300">
                      <div className="mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-amber-400"></div>
                      Truly reactive PDF state
                    </li>
                    <li className="flex items-center text-slate-300">
                      <div className="mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-orange-400"></div>
                      TypeScript support with snippets
                    </li>
                  </ul>
                </div>

                <Link
                  href="/docs/svelte/introduction"
                  className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-orange-600 to-red-600 px-8 py-4 text-lg font-bold text-white shadow-lg transition-all hover:scale-105 hover:from-orange-500 hover:to-red-500 hover:shadow-xl"
                >
                  <span>Start with Svelte</span>
                  <ArrowRight className="ml-3 h-6 w-6" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 text-center">
          <p className="mb-6 text-lg text-slate-400">
            Need something else? We&apos;ve got you covered.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/docs/snippet/introduction"
              className="inline-flex items-center rounded-full border border-slate-600 bg-slate-800/50 px-6 py-3 text-sm font-medium text-slate-300 backdrop-blur-sm transition-all hover:scale-105 hover:bg-slate-700/50 hover:text-white"
            >
              <Code className="mr-2 h-4 w-4" />
              Vanilla JS
            </Link>
            <Link
              href="/docs/engines/introduction"
              className="inline-flex items-center rounded-full border border-slate-600 bg-slate-800/50 px-6 py-3 text-sm font-medium text-slate-300 backdrop-blur-sm transition-all hover:scale-105 hover:bg-slate-700/50 hover:text-white"
            >
              <Zap className="mr-2 h-4 w-4" />
              Engine
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// Getting started card
const GettingStartedCard = () => {
  return (
    <div className="relative mb-12 overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 to-gray-800 text-white shadow-lg">
      <div className="absolute right-0 top-0 h-64 w-64 -translate-y-1/2 translate-x-1/2 transform rounded-full bg-gradient-to-br from-purple-500 to-blue-500 opacity-30 blur-xl"></div>
      <div className="absolute bottom-0 left-0 h-64 w-64 -translate-x-1/2 translate-y-1/2 transform rounded-full bg-gradient-to-br from-blue-500 to-teal-500 opacity-20 blur-xl"></div>

      <div className="relative z-10 p-8 md:p-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-center">
          <div className="md:flex-1">
            <div className="mb-4 inline-block rounded-full bg-blue-500/20 px-4 py-1 text-sm font-medium text-blue-300">
              New to EmbedPDF?
            </div>
            <h2 className="mb-4 text-3xl font-bold">Getting Started Guide</h2>
            <p className="mb-6 text-lg text-gray-300">
              Learn the fundamentals of integrating PDF viewing into your
              applications with our step-by-step introduction.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/docs/introduction"
                className="inline-flex items-center rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-blue-700"
              >
                <Book className="mr-2 h-5 w-5" />
                Read the Guide
              </Link>
              <Link
                href="/docs/quickstart"
                className="inline-flex items-center rounded-lg bg-gray-700 px-5 py-2.5 font-medium text-white transition-colors hover:bg-gray-600"
              >
                <Zap className="mr-2 h-5 w-5" />
                Quick Start
              </Link>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg bg-gray-800 shadow-xl md:w-72">
            <div className="flex items-center bg-gray-700 px-4 py-2 font-mono text-xs text-gray-300">
              <span>Terminal</span>
            </div>
            <div className="p-4 font-mono text-sm text-gray-300">
              <p className="text-green-400">$ npm install @embedpdf/engine</p>
              <p className="mt-2 text-gray-500"># or with yarn</p>
              <p className="text-green-400">$ yarn add @embedpdf/engine</p>
              <p className="mt-4 text-gray-400">
                {'// Import in your project'}
              </p>
              <p className="text-blue-300">
                import {'{ PDFViewer }'} from{' '}
                <span className="text-orange-300">
                  &apos;@embedpdf/engine&apos;
                </span>
                ;
              </p>
              <p className="mt-2 text-gray-400">{'// Initialize the viewer'}</p>
              <p className="text-blue-300">
                const viewer = new PDFViewer({'{'}
                <br />
                &nbsp;&nbsp;container:{' '}
                <span className="text-orange-300">
                  &apos;#pdf-container&apos;
                </span>
                ,
                <br />
                &nbsp;&nbsp;url:{' '}
                <span className="text-orange-300">
                  &apos;./document.pdf&apos;
                </span>
                <br />
                {'}'});
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Documentation section
const DocSection = ({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) => {
  return (
    <div className="mb-12">
      <div className="mb-6 flex items-center space-x-3">
        <div className="rounded-lg bg-blue-100 p-2 text-blue-700">{icon}</div>
        <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
      </div>
      {children}
    </div>
  )
}

const DocsOverview = () => {
  const [searchQuery, setSearchQuery] = useState('')

  // Filter packages based on search
  const filteredPackages = packages.filter(
    (pkg) =>
      pkg.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pkg.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pkg.tags.some((tag) =>
        tag.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
  )

  return (
    <div className="relative min-h-screen">
      <style jsx>{`
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(20px, -20px) scale(1.1);
          }
          66% {
            transform: translate(-15px, 15px) scale(0.95);
          }
          100% {
            transform: translate(0px, 0px) scale(1);
          }
        }

        .animate-blob {
          animation: blob 12s infinite alternate;
        }

        .animation-delay-2000 {
          animation-delay: 2s;
        }

        .animation-delay-4000 {
          animation-delay: 4s;
        }

        .bg-grid-pattern {
          background-image:
            linear-gradient(
              to right,
              rgba(24, 24, 100, 0.07) 1px,
              transparent 1px
            ),
            linear-gradient(
              to bottom,
              rgba(24, 24, 100, 0.07) 1px,
              transparent 1px
            );
          background-size: 24px 24px;
        }
      `}</style>

      <AnimatedBackground />

      <div className="pb-16 pt-20 sm:pt-24 lg:pt-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Documentation Header */}
          <div className="mb-24 text-center">
            <div className="mb-6 inline-block rounded-full border border-blue-200 bg-blue-50 px-6 py-2 text-sm font-medium text-blue-800">
              Documentation
            </div>
            <h1 className="mb-6 text-4xl font-black leading-tight tracking-tight text-gray-900 md:text-5xl">
              <span className="relative inline-block">
                <span className="relative z-10">Everything you need</span>
                <div className="absolute bottom-1 left-0 right-0 -z-10 h-4 -rotate-1 transform opacity-50">
                  <Scribble3 color="#bedbff" />
                </div>
              </span>
              <span className="block bg-gradient-to-r from-blue-600 to-teal-500 bg-clip-text text-transparent">
                to build amazing PDF experiences
              </span>
            </h1>
            <p className="mx-auto max-w-2xl text-xl text-gray-600">
              Comprehensive documentation for all EmbedPDF packages, with
              guides, API references, and examples.
            </p>
          </div>

          {/* Search */}
          {/*<div className="relative max-w-xl mx-auto mb-12">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={20} className="text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search documentation..."
              className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>*/}

          {/* Getting Started Section */}
          {/* <GettingStartedCard />*/}
          {/* Framework Getting Started Section */}
          <FrameworkGettingStartedCard />

          {/* Main Documentation */}
          <DocSection title="Available Packages" icon={<Package size={20} />}>
            {searchQuery && filteredPackages.length === 0 ? (
              <div className="rounded-xl bg-gray-50 py-12 text-center">
                <div className="text-2xl font-bold text-gray-400">
                  No packages found
                </div>
                <p className="mt-2 text-gray-500">
                  Try adjusting your search query
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                {filteredPackages.map((pkg) => (
                  <PackageCard key={pkg.id} pkg={pkg} />
                ))}
              </div>
            )}
          </DocSection>

          {/* Examples Section */}
          {/* 
          <DocSection title="Quick Examples" icon={<Code size={20} />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6"> 
              <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-100">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-100 flex justify-between items-center">
                  <div className="font-medium text-gray-700">Basic Viewer</div>
                  <Link 
                    href="/examples/basic-viewer"
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                  >
                    View Example <ExternalLink size={14} className="ml-1" />
                  </Link>
                </div>
                <div className="p-4">
                  <pre className="bg-gray-50 p-4 rounded-lg text-sm font-mono overflow-x-auto">
{`import { PDFViewer } from '@embedpdf/engine';

// Initialize a basic viewer
const viewer = new PDFViewer({
  container: '#viewer',
  url: '/sample.pdf',
  height: '600px',
  zoom: 1.2
});

// Load the document
viewer.load();`}
                  </pre>
                </div>
              </div>
              
              <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-100">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-100 flex justify-between items-center">
                  <div className="font-medium text-gray-700">React Component</div>
                  <Link 
                    href="/examples/react-component"
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                  >
                    View Example <ExternalLink size={14} className="ml-1" />
                  </Link>
                </div>
                <div className="p-4">
                  <pre className="bg-gray-50 p-4 rounded-lg text-sm font-mono overflow-x-auto">
{`import { useState } from 'react';
import { PDFViewer } from '@embedpdf/react';

function MyPDFViewer() {
  const [zoom, setZoom] = useState(1);
  
  return (
    <div className="pdf-container">
      <PDFViewer
        url="/document.pdf"
        zoom={zoom}
        onDocumentLoaded={(doc) => 
          console.log('Loaded:', doc.numPages)}
      />
      <button onClick={() => setZoom(zoom + 0.2)}>
        Zoom In
      </button>
    </div>
  );
}`}
                  </pre>
                </div>
              </div>
            </div>
            
            <div className="mt-6 text-center">
              <Link
                href="/examples"
                className="inline-flex items-center px-6 py-3 bg-blue-50 text-blue-700 font-medium rounded-lg hover:bg-blue-100 transition-colors"
              >
                View All Examples
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </div>
          </DocSection>
          */}

          {/* Resources Section */}
          {/*
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
            <div className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 p-6 rounded-xl">
              <div className="mb-4 w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
                <Book size={24} />
              </div>
              <h3 className="text-xl font-bold mb-2">API Reference</h3>
              <p className="text-gray-600 mb-4">Complete API documentation for all EmbedPDF packages and modules.</p>
              <Link
                href="/api-reference"
                className="inline-flex items-center text-purple-700 font-medium hover:text-purple-900"
              >
                Browse API Docs
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </div>
            
            <div className="bg-gradient-to-br from-blue-500/10 to-teal-500/10 p-6 rounded-xl">
              <div className="mb-4 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                <Code size={24} />
              </div>
              <h3 className="text-xl font-bold mb-2">Code Samples</h3>
              <p className="text-gray-600 mb-4">Ready-to-use code examples for common PDF viewing use cases and scenarios.</p>
              <Link
                href="/code-samples"
                className="inline-flex items-center text-blue-700 font-medium hover:text-blue-900"
              >
                View Samples
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </div>
            
            <div className="bg-gradient-to-br from-teal-500/10 to-green-500/10 p-6 rounded-xl">
              <div className="mb-4 w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center text-teal-600">
                <Terminal size={24} />
              </div>
              <h3 className="text-xl font-bold mb-2">Tutorials</h3>
              <p className="text-gray-600 mb-4">Step-by-step guides to help you implement advanced PDF features.</p>
              <Link
                href="/tutorials"
                className="inline-flex items-center text-teal-700 font-medium hover:text-teal-900"
              >
                Start Learning
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </div>
          </div>*/}

          {/* Community Support */}
          <NeedHelp />

          {/* Newsletter */}
          {/*<div className="text-center pb-8">
            <h2 className="text-2xl font-bold mb-4">Stay Updated</h2>
            <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
              Subscribe to our newsletter for the latest documentation updates, new features, and best practices.
            </p>
            <div className="max-w-md mx-auto flex">
              <input
                type="email"
                placeholder="Your email address"
                className="flex-1 min-w-0 block w-full px-4 py-3 rounded-l-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="button"
                className="inline-flex items-center px-6 py-3 border border-transparent shadow-sm text-base font-medium rounded-r-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Subscribe
              </button>
            </div>
          </div>*/}
        </div>
      </div>
    </div>
  )
}

export default DocsOverview
