'use client'

import React, { useState } from 'react'
import {
  ShadcnLogo,
  MUILogo,
  AntDesignLogo,
  RadixLogo,
  ChakraLogo,
  TailwindLogo,
} from './logos'
import {
  ArrowRight,
  Book,
  Check,
  ChevronDown,
  ChevronUp,
  Code,
  ExternalLink,
  Layers,
  Layout,
  Puzzle,
  Settings,
  Zap,
} from 'lucide-react'
import Link from 'next/link'

const CheckCircle = ({ className }: { className?: string }) => {
  return (
    <div className={`rounded-full p-1 ${className}`}>
      <Check size={14} className="stroke-[3] text-white" />
    </div>
  )
}

// Animated background component
const AnimatedBackground = () => {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="animate-blob absolute left-10 top-20 h-64 w-64 rounded-full bg-purple-500 opacity-10 mix-blend-multiply blur-3xl filter dark:opacity-20 dark:mix-blend-normal"></div>
      <div className="animate-blob animation-delay-2000 absolute right-10 top-40 h-72 w-72 rounded-full bg-blue-500 opacity-10 mix-blend-multiply blur-3xl filter dark:opacity-20 dark:mix-blend-normal"></div>
      <div className="animate-blob animation-delay-4000 absolute bottom-32 left-20 h-80 w-80 rounded-full bg-teal-500 opacity-10 mix-blend-multiply blur-3xl filter dark:opacity-20 dark:mix-blend-normal"></div>
      <div className="bg-grid-pattern absolute inset-0 opacity-5 dark:opacity-[0.03]"></div>
    </div>
  )
}

// Scribble SVG component
const Scribble = () => (
  <svg
    viewBox="0 0 286 73"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="absolute bottom-0 left-0 right-0 -z-10 h-4 w-full text-purple-200 dark:text-purple-800/40"
  >
    <path
      d="M142.293 71.0029C94.8159 71.0029 47.339 71.0029 0.862305 71.0029C0.862305 71.0029 71.0766 23.5254 142.293 1.00293C213.509 23.5254 283.724 71.0029 283.724 71.0029C237.247 71.0029 189.77 71.0029 142.293 71.0029Z"
      fill="currentColor"
    />
  </svg>
)

// UI Framework data
const frameworks = [
  { name: 'Material UI', logo: <MUILogo /> },
  { name: 'Chakra UI', logo: <ChakraLogo /> },
  { name: 'Tailwind CSS', logo: <TailwindLogo /> },
  { name: 'shadcn/ui', logo: <ShadcnLogo /> },
  { name: 'Ant Design', logo: <AntDesignLogo /> },
  { name: 'Radix UI', logo: <RadixLogo /> },
]

// FAQ Component
const FAQItem = ({
  question,
  answer,
}: {
  question: string
  answer: string
}) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="border-b border-gray-200 py-4 dark:border-gray-800">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between text-left transition-colors hover:text-purple-600 dark:hover:text-purple-400"
      >
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {question}
        </h3>
        <div className="ml-4 text-gray-500 dark:text-gray-400">
          {isOpen ? <ChevronUp /> : <ChevronDown />}
        </div>
      </button>
      {isOpen && (
        <div className="mt-3 leading-relaxed text-gray-600 dark:text-gray-400">
          <p>{answer}</p>
        </div>
      )}
    </div>
  )
}

export default function ReactPDFViewerPage() {
  return (
    <div className="relative min-h-screen bg-white transition-colors duration-300 dark:bg-gray-950">
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

      {/* Hero Section */}
      <section className="pb-20 pt-20 sm:pt-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="mb-6 inline-block rounded-full border border-purple-200 bg-purple-50 px-6 py-2 text-sm font-medium text-purple-800 dark:border-purple-800/30 dark:bg-purple-900/20 dark:text-purple-300">
              Open Source • Powered by PDFium
            </div>

            <h1 className="md:text-7xl mb-6 text-5xl font-black leading-tight tracking-tight text-gray-900 dark:text-white">
              Build your{' '}
              <span className="relative inline-block">
                <span className="relative z-10">React PDF Viewer</span>
                <Scribble />
              </span>
              <br />
              <span className="bg-gradient-to-r from-purple-600 via-blue-500 to-teal-500 bg-clip-text text-transparent">
                your way
              </span>
            </h1>

            <p className="mx-auto max-w-3xl text-xl leading-relaxed text-gray-600 dark:text-gray-400">
              Choose between a complete viewer with built-in UI or composable,
              headless components for total control. Open source and powered by
              PDFium.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/docs/react/introduction"
                className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-gray-900 px-8 py-4 text-base font-medium text-white shadow-xl transition-all hover:scale-105 dark:bg-white dark:text-gray-900"
              >
                <span className="absolute left-0 top-0 h-full w-full bg-gradient-to-r from-purple-600 via-blue-500 to-teal-400 opacity-0 transition-opacity group-hover:opacity-100"></span>
                <span className="relative z-10 flex items-center gap-2 group-hover:text-white">
                  View Documentation
                  <ArrowRight />
                </span>
              </Link>

              <a
                href="https://mui.embedpdf.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-gray-900 bg-transparent px-8 py-4 text-base font-medium text-gray-900 transition-all hover:bg-gray-900 hover:text-white dark:border-gray-100 dark:text-gray-100 dark:hover:bg-gray-100 dark:hover:text-gray-900"
              >
                <ExternalLink />
                Live Demo
              </a>
            </div>
          </div>

          {/* Framework Badges */}
          <div className="mt-20">
            <p className="tracking-wider mb-8 text-center text-sm font-medium uppercase text-gray-500 dark:text-gray-400">
              Works Seamlessly With Your Favorite UI Framework
            </p>
            <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
              {frameworks.map((fw) => (
                <div
                  key={fw.name}
                  className="group relative flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-purple-300 hover:shadow-lg dark:border-gray-800 dark:bg-gray-900 dark:hover:border-purple-500/50"
                >
                  <div className="mb-3 text-gray-400 transition-all duration-300 group-hover:scale-110 group-hover:text-purple-600 dark:text-gray-500 dark:group-hover:text-purple-400">
                    {fw.logo}
                  </div>
                  <span className="text-center text-sm font-medium text-gray-600 transition-colors group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-gray-200">
                    {fw.name}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
              ...and any other React UI library or CSS framework
            </p>
          </div>
        </div>
      </section>

      {/* Two Paths Section */}
      <section className="relative overflow-hidden border-y border-white/10 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-24 dark:border-gray-800">
        {/* Animated background orbs */}
        <div className="absolute right-0 top-0 h-80 w-80 -translate-y-1/3 translate-x-1/3 transform animate-pulse rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 opacity-20 blur-3xl"></div>
        <div className="animation-delay-2000 absolute bottom-0 left-0 h-72 w-72 -translate-x-1/3 translate-y-1/3 transform animate-pulse rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 opacity-25 blur-3xl"></div>
        <div className="animation-delay-4000 absolute right-1/4 top-1/2 h-64 w-64 -translate-y-1/2 transform animate-pulse rounded-full bg-gradient-to-br from-violet-400 to-purple-600 opacity-15 blur-3xl"></div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <div className="mb-6 inline-block rounded-full border border-cyan-400/30 bg-cyan-400/10 px-6 py-2 text-sm font-bold text-slate-300 backdrop-blur-sm">
              Choose Your Integration Path
            </div>
            <h2 className="mb-6 text-4xl font-black leading-tight tracking-tight text-white md:text-5xl">
              <span className="bg-gradient-to-r from-cyan-300 via-blue-300 to-purple-300 bg-clip-text text-transparent">
                Build it your way
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-xl leading-relaxed text-slate-300">
              Start with a full-featured viewer or build your own from
              composable primitives
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            {/* Full-UI Path */}
            <div className="group relative">
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 opacity-25 blur transition duration-300 group-hover:opacity-40"></div>
              <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-800/80 backdrop-blur-sm">
                {/* Header */}
                <div className="border-b border-slate-700/50 bg-slate-800/50 px-8 py-8">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg">
                    <Layout className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="mb-3 text-2xl font-bold text-white">
                    Full-UI React PDF Viewer
                  </h3>
                  <p className="text-base leading-relaxed text-slate-300">
                    Drop in a complete viewer with toolbar, search, and
                    annotations. Ready to use out of the box with zero
                    configuration.
                  </p>
                </div>

                {/* Highlights */}
                <div className="flex-1 px-8 py-8">
                  <h4 className="tracking-wider mb-6 text-sm font-bold uppercase text-slate-400">
                    What you&apos;ll get
                  </h4>
                  <ul className="space-y-4">
                    <li className="flex items-center">
                      <div className="mr-3 h-2 w-2 rounded-full bg-cyan-400"></div>
                      <div>
                        <p className="font-medium text-white">
                          Complete UI Components
                        </p>
                        <p className="text-sm text-slate-300">
                          Includes toolbar, zoom, search, and annotation out of
                          the box
                        </p>
                      </div>
                    </li>
                    <li className="flex items-center">
                      <div className="mr-3 h-2 w-2 rounded-full bg-blue-400"></div>
                      <div>
                        <p className="font-medium text-white">
                          Zero Configuration
                        </p>
                        <p className="text-sm text-slate-300">
                          One-line integration, zero configuration required
                        </p>
                      </div>
                    </li>
                    <li className="flex items-center">
                      <div className="mr-3 h-2 w-2 rounded-full bg-purple-400"></div>
                      <div>
                        <p className="font-medium text-white">
                          Full API Control
                        </p>
                        <p className="text-sm text-slate-300">
                          Programmatically navigate, zoom, or toggle features
                        </p>
                      </div>
                    </li>
                  </ul>
                </div>

                {/* CTAs */}
                <div className="border-t border-slate-700/50 bg-slate-800/50 px-8 py-6">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Link
                      href="/docs/snippet/introduction"
                      className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-8 py-4 text-lg font-bold text-white shadow-lg transition-all hover:scale-105 hover:from-cyan-500 hover:to-blue-500 hover:shadow-xl"
                    >
                      <span>Try simple snippet</span>
                      <ArrowRight className="ml-3 h-6 w-6" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Headless Path */}
            <div className="group relative">
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 opacity-25 blur transition duration-300 group-hover:opacity-40"></div>
              <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-800/80 backdrop-blur-sm">
                {/* Header */}
                <div className="border-b border-slate-700/50 bg-slate-800/50 px-8 py-8">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg">
                    <Layers className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="mb-3 text-2xl font-bold text-white">
                    Headless React PDF Components
                  </h3>
                  <p className="text-base leading-relaxed text-slate-300">
                    Build your own custom PDF viewer with low-level components.
                    Full control over rendering, interactions, and UI.
                  </p>
                </div>

                {/* Highlights */}
                <div className="flex-1 px-8 py-8">
                  <h4 className="tracking-wider mb-6 text-sm font-bold uppercase text-slate-400">
                    What you&apos;ll get
                  </h4>
                  <ul className="space-y-4">
                    <li className="flex items-center">
                      <div className="mr-3 h-2 w-2 rounded-full bg-emerald-400"></div>
                      <div>
                        <p className="font-medium text-white">
                          Modular Plugin System
                        </p>
                        <p className="text-sm text-slate-300">
                          Render, tiling, annotation, redaction, and more
                        </p>
                      </div>
                    </li>
                    <li className="flex items-center">
                      <div className="mr-3 h-2 w-2 rounded-full bg-teal-400"></div>
                      <div>
                        <p className="font-medium text-white">
                          Complete Control
                        </p>
                        <p className="text-sm text-slate-300">
                          Build your own viewer with viewport, zoom, pan, and
                          scroll control
                        </p>
                      </div>
                    </li>
                    <li className="flex items-center">
                      <div className="mr-3 h-2 w-2 rounded-full bg-green-400"></div>
                      <div>
                        <p className="font-medium text-white">
                          Framework Agnostic
                        </p>
                        <p className="text-sm text-slate-300">
                          Works with MUI, Radix, shadcn/ui, or your own
                          components
                        </p>
                      </div>
                    </li>
                  </ul>
                </div>

                {/* CTAs */}
                <div className="border-t border-slate-700/50 bg-slate-800/50 px-8 py-6">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Link
                      href="/docs/react/introduction"
                      className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-8 py-4 text-lg font-bold text-white shadow-lg transition-all hover:scale-105 hover:from-emerald-500 hover:to-teal-500 hover:shadow-xl"
                    >
                      <span>Explore headless</span>
                      <ArrowRight className="ml-3 h-6 w-6" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-black text-gray-900 dark:text-white">
              EmbedPDF vs Traditional PDF Viewers
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-gray-600 dark:text-gray-400">
              See how our headless approach compares to traditional solutions
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-gray-800 dark:to-gray-800">
                  <tr>
                    <th className="tracking-wider px-6 py-4 text-left text-sm font-bold uppercase text-gray-900 dark:text-white">
                      Feature
                    </th>
                    <th className="tracking-wider px-6 py-4 text-center text-sm font-bold uppercase text-purple-600 dark:text-purple-400">
                      EmbedPDF
                    </th>
                    <th className="tracking-wider px-6 py-4 text-center text-sm font-bold uppercase text-gray-500 dark:text-gray-400">
                      Traditional Viewers
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  <tr className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">
                      Custom UI Design
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="mx-auto flex justify-center">
                        <CheckCircle className="bg-green-600 dark:bg-green-500" />
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-400 dark:text-gray-500">
                      Limited
                    </td>
                  </tr>
                  <tr className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">
                      UI Framework Support
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="mx-auto flex justify-center">
                        <CheckCircle className="bg-green-600 dark:bg-green-500" />
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-400 dark:text-gray-500">
                      None
                    </td>
                  </tr>
                  <tr className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">
                      TypeScript Support
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="mx-auto flex justify-center">
                        <CheckCircle className="bg-green-600 dark:bg-green-500" />
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="mx-auto flex justify-center">
                        <CheckCircle className="bg-gray-400 dark:bg-gray-600" />
                      </div>
                    </td>
                  </tr>
                  <tr className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">
                      Modular Features
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="mx-auto flex justify-center">
                        <CheckCircle className="bg-green-600 dark:bg-green-500" />
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-400 dark:text-gray-500">
                      Monolithic
                    </td>
                  </tr>
                  <tr className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">
                      Bundle Size
                    </td>
                    <td className="px-6 py-4 text-center font-semibold text-green-600 dark:text-green-400">
                      Minimal
                    </td>
                    <td className="px-6 py-4 text-center font-semibold text-gray-400 dark:text-gray-500">
                      Large
                    </td>
                  </tr>
                  <tr className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">
                      Open Source
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="mx-auto flex justify-center">
                        <CheckCircle className="bg-green-600 dark:bg-green-500" />
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-400 dark:text-gray-500">
                      Often Paid
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Code Example Section */}
      <section className="border-y border-white/10 bg-gradient-to-br from-gray-900 to-gray-800 py-24 text-white dark:border-gray-800 dark:from-black dark:to-gray-900">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-4xl font-black">
              Simple. Powerful. Flexible.
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-gray-300">
              Get started with just a few lines of code. Works with any React
              setup.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-6 py-4">
              <div className="flex items-center space-x-2">
                <div className="h-3 w-3 rounded-full bg-red-500"></div>
                <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                <div className="h-3 w-3 rounded-full bg-green-500"></div>
              </div>
              <span className="text-sm text-gray-400">PDFViewer.tsx</span>
            </div>
            <pre className="overflow-x-auto bg-gray-950 p-6 text-sm leading-relaxed">
              <code className="text-gray-300">
                <span className="text-purple-400">import</span>{' '}
                <span className="text-blue-300">{'{ EmbedPDF }'}</span>{' '}
                <span className="text-purple-400">from</span>{' '}
                <span className="text-yellow-300">
                  &apos;@embedpdf/core/react&apos;
                </span>
                ;{'\n'}
                <span className="text-purple-400">import</span>{' '}
                <span className="text-blue-300">{'{ usePdfiumEngine }'}</span>{' '}
                <span className="text-purple-400">from</span>{' '}
                <span className="text-yellow-300">
                  &apos;@embedpdf/engines/react&apos;
                </span>
                ;{'\n\n'}
                <span className="text-purple-400">
                  export default function
                </span>{' '}
                <span className="text-blue-300">PDFViewer</span>
                {'() {'}
                {'\n'}
                {'  '}
                <span className="text-purple-400">const</span>{' '}
                <span className="text-gray-300">{'{ engine }'}</span>{' '}
                <span className="text-purple-400">=</span>{' '}
                <span className="text-blue-300">usePdfiumEngine</span>();
                {'\n\n'}
                {'  '}
                <span className="text-purple-400">return</span> ({'\n'}
                {'    '}
                <span className="text-blue-400">&lt;EmbedPDF</span>{' '}
                <span className="text-green-300">engine</span>=
                <span className="text-yellow-300">{'{engine}'}</span>{' '}
                <span className="text-green-300">plugins</span>=
                <span className="text-yellow-300">{'{plugins}'}</span>
                <span className="text-blue-400">&gt;</span>
                {'\n'}
                {'      '}
                <span className="text-gray-500">
                  {'{/* Your UI components here */}'}
                </span>
                {'\n'}
                {'    '}
                <span className="text-blue-400">&lt;/EmbedPDF&gt;</span>
                {'\n'}
                {'  '});{'\n'}
                {'}'}
              </code>
            </pre>
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/docs/react/getting-started"
              className="inline-flex items-center gap-2 text-lg font-medium text-blue-400 transition-colors hover:text-blue-300"
            >
              View Full Getting Started Guide
              <ArrowRight />
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-black text-gray-900 dark:text-white">
              Everything You Need for Modern PDF Viewing
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-gray-600 dark:text-gray-400">
              A complete toolkit with all the features your users expect
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: '🔍',
                title: 'Zoom & Pan',
                description:
                  'Smooth zooming with fit-to-page, fit-to-width, and marquee zoom modes.',
              },
              {
                icon: '📝',
                title: 'Text Selection',
                description:
                  'Native-feeling text selection with copy-to-clipboard support.',
              },
              {
                icon: '🔎',
                title: 'Search',
                description:
                  'Fast full-text search with result highlighting and navigation.',
              },
              {
                icon: '✏️',
                title: 'Annotations',
                description:
                  'Add highlights, comments, drawings, and stamps to PDFs.',
              },
              {
                icon: '🖼️',
                title: 'Thumbnails',
                description:
                  'Sidebar with virtualized page thumbnails for quick navigation.',
              },
              {
                icon: '⚙️',
                title: 'And More...',
                description:
                  'Print, export, rotate, capture, redaction, and customizable toolbars.',
              },
            ].map((feature, idx) => (
              <div
                key={idx}
                className="group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-purple-200 hover:shadow-lg dark:border-gray-800 dark:bg-gray-900 dark:hover:border-purple-500/50"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 text-2xl shadow-lg transition-transform group-hover:scale-110">
                  {feature.icon}
                </div>
                <h3 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="bg-gradient-to-br from-blue-50 to-purple-50 py-24 dark:from-gray-900 dark:to-gray-900">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-4xl font-black text-gray-900 dark:text-white">
              Frequently Asked Questions
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Everything you need to know about our React PDF Viewer
            </p>
          </div>

          <div className="rounded-2xl bg-white p-8 shadow-lg dark:border dark:border-gray-700 dark:bg-gray-800 dark:shadow-xl">
            <FAQItem
              question="What makes EmbedPDF different from other React PDF viewers?"
              answer="EmbedPDF is headless and framework-agnostic. Unlike traditional PDF viewers with fixed UIs, you get complete control over the design and can use any UI framework like Material UI, Chakra UI, or Tailwind CSS. You only load the features you need, keeping your bundle size minimal."
            />
            <FAQItem
              question="Does it work with Material UI, Chakra UI, and other component libraries?"
              answer="Yes! EmbedPDF is designed to work seamlessly with any React UI framework. We have examples for Material UI, Chakra UI, Tailwind CSS, shadcn/ui, Ant Design, Radix UI, and more. The headless architecture means you can style components exactly how you want."
            />
            <FAQItem
              question="Is EmbedPDF open source and free to use?"
              answer="Yes! EmbedPDF is MIT licensed, completely open source, and free for both personal and commercial use. No hidden costs, no paywalls, no premium features. The entire codebase is available on GitHub."
            />
            <FAQItem
              question="What features does the React PDF viewer support?"
              answer="EmbedPDF includes zoom (with marquee/area zoom), pan, text selection, search, annotations (highlights, drawings, stamps), thumbnails, page rotation, printing, PDF export, capture, redaction, and more. Features are modular, so you only include what you need."
            />
            <FAQItem
              question="Does it support TypeScript?"
              answer="Absolutely! EmbedPDF is built with TypeScript first. All packages include comprehensive type definitions for excellent IntelliSense and type safety throughout your application."
            />
            <FAQItem
              question="How do I get started?"
              answer="Install the core packages with npm or yarn, register the plugins you need, and start building your UI. Our documentation includes a complete getting started guide, code examples, and a full-featured Material UI demo. Most developers are up and running in under 15 minutes."
            />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-600 via-blue-500 to-teal-500 p-12 text-center text-white shadow-2xl">
            <div className="absolute right-0 top-0 h-64 w-64 -translate-y-1/3 translate-x-1/3 transform rounded-full bg-white opacity-10 blur-3xl"></div>
            <div className="absolute bottom-0 left-0 h-64 w-64 -translate-x-1/3 translate-y-1/3 transform rounded-full bg-white opacity-10 blur-3xl"></div>

            <div className="relative z-10">
              <h2 className="mb-4 text-4xl font-black">
                Ready to Build Your React PDF Viewer?
              </h2>
              <p className="mx-auto mb-8 max-w-2xl text-xl text-blue-50">
                Join thousands of developers using EmbedPDF to create amazing
                PDF experiences
              </p>
              <div className="flex flex-col justify-center gap-4 sm:flex-row">
                <Link
                  href="/docs/react/introduction"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-8 py-4 text-base font-medium text-gray-900 shadow-lg transition-all hover:scale-105 hover:shadow-xl"
                >
                  Get Started Now
                  <ArrowRight />
                </Link>
                <a
                  href="https://github.com/embedpdf/embed-pdf-viewer"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-white bg-transparent px-8 py-4 text-base font-medium text-white transition-all hover:bg-white hover:text-gray-900"
                >
                  View on GitHub
                  <ExternalLink />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
