'use client'

import React, { useState } from 'react'
import {
  ArrowRight,
  Code,
  Package,
  Zap,
  FileText,
  ChevronRight,
  Cpu,
  Check,
  Search,
  Github,
  Heart,
} from 'lucide-react'
import Link from 'next/link'
import { Scribble3 } from './icons/scribble3'
import { ReactIcon, VueIcon, SvelteIcon } from './framework-icons'
import { JavaScript } from '@/components/icons/javascript'
import DiscordIcon from '@/components/icons/discord'

// Mock documentation packages data
const packages = [
  {
    id: 'snippet',
    name: '@embedpdf/snippet',
    description:
      'The complete, highest-level package with built-in UI and controls. Drop it into any website with just a simple snippet.',
    icon: <Code size={24} />,
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    tags: ['Complete UI', 'No Build Required'],
    sections: [{ title: 'Introduction', url: '/docs/snippet/introduction' }],
    url: '/docs/snippet/introduction',
  },
  {
    id: 'engine',
    name: '@embedpdf/engines',
    description:
      'Pluggable rendering engines. Ships with PdfiumEngine – a high‑level wrapper with advanced PDF processing capabilities.',
    icon: <Zap size={24} />,
    iconColor: 'text-blue-600 dark:text-blue-400',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    tags: ['High-level API', 'TypeScript'],
    sections: [{ title: 'Introduction', url: '/docs/engines/introduction' }],
    url: '/docs/engines/introduction',
  },
  {
    id: 'pdfium',
    name: '@embedpdf/pdfium',
    description:
      'Low-level JavaScript API wrapper for the PDFium rendering engine. Direct access to PDF manipulation.',
    icon: <FileText size={24} />,
    iconColor: 'text-purple-600 dark:text-purple-400',
    iconBg: 'bg-purple-100 dark:bg-purple-900/30',
    tags: ['Core', 'Low-level API'],
    sections: [
      { title: 'Introduction', url: '/docs/pdfium/introduction' },
      { title: 'Getting Started', url: '/docs/pdfium/getting-started' },
    ],
    url: '/docs/pdfium/introduction',
  },
]

// Animated background
const AnimatedBackground = () => {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Gradient circles */}
      <div className="animate-blob absolute left-10 top-20 h-64 w-64 rounded-full bg-purple-500 opacity-10 mix-blend-multiply blur-3xl filter dark:opacity-20 dark:mix-blend-normal"></div>
      <div className="animate-blob animation-delay-2000 absolute right-10 top-40 h-72 w-72 rounded-full bg-blue-500 opacity-10 mix-blend-multiply blur-3xl filter dark:opacity-20 dark:mix-blend-normal"></div>
      <div className="animate-blob animation-delay-4000 absolute bottom-32 left-20 h-80 w-80 rounded-full bg-teal-500 opacity-10 mix-blend-multiply blur-3xl filter dark:opacity-20 dark:mix-blend-normal"></div>

      {/* Documentation pattern */}
      <div className="bg-grid-pattern opacity-3 absolute inset-0 dark:opacity-[0.03]"></div>
    </div>
  )
}

// Package card - Redesigned to match homepage style
const PackageCard = ({
  pkg,
}: {
  pkg: {
    id: string
    name: string
    description: string
    icon: React.ReactNode
    iconColor: string
    iconBg: string
    tags: string[]
    sections: { title: string; url: string }[]
    url: string
  }
}) => {
  return (
    <div className="group relative flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-xl dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-4 flex items-start justify-between">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl ${pkg.iconBg} ${pkg.iconColor}`}
        >
          {pkg.icon}
        </div>
        <Link
          href={pkg.url}
          className="rounded-full bg-gray-100 p-2 text-gray-500 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          <ArrowRight size={16} />
        </Link>
      </div>

      <h3 className="mb-2 font-mono text-lg font-bold text-gray-900 dark:text-white">
        {pkg.name}
      </h3>

      <p className="mb-6 flex-grow text-gray-600 dark:text-gray-400">
        {pkg.description}
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        {pkg.tags.map((tag, index) => (
          <span
            key={index}
            className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
        <ul className="space-y-2">
          {pkg.sections.map(
            (section: { title: string; url: string }, index: number) => (
              <li key={index}>
                <Link
                  href={section.url}
                  className="flex items-center text-sm text-gray-600 transition-all hover:translate-x-1 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                >
                  <ChevronRight size={14} className="mr-1" />
                  {section.title}
                </Link>
              </li>
            ),
          )}
        </ul>
      </div>
    </div>
  )
}

const paths = [
  {
    icon: <Zap size={120} strokeWidth={1} />,
    bgIconClass: 'text-purple-600 dark:text-purple-400',
    title: 'Ready-made Viewer',
    tag: 'Batteries Included',
    tagClass:
      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    description:
      'The fastest way to get started. A polished, production-ready PDF viewer that drops into your app in seconds.',
    features: [
      'Pre-built UI & Themes',
      'Simple Configuration',
      'Standard Features Built-in',
    ],
    checkColor: 'text-green-500',
    ctaTitle: 'Choose your framework',
    links: [
      {
        href: '/docs/snippet/getting-started',
        icon: (
          <div className="flex h-5 w-5 items-center justify-center overflow-hidden">
            <JavaScript />
          </div>
        ),
        text: 'Vanilla',
      },
      {
        href: '/docs/react/viewer/introduction',
        icon: <ReactIcon className="h-5 w-5 text-[#61DAFB]" />,
        text: 'React',
      },
      {
        href: '/docs/vue/viewer/introduction',
        icon: <VueIcon className="h-5 w-5 text-[#4FC08D]" />,
        text: 'Vue',
      },
      {
        href: '/docs/svelte/viewer/introduction',
        icon: <SvelteIcon className="h-5 w-5 text-[#FF3E00]" />,
        text: 'Svelte',
      },
    ],
  },
  {
    icon: <Cpu size={120} strokeWidth={1} />,
    bgIconClass: 'text-blue-600 dark:text-blue-400',
    title: 'Headless Components',
    tag: 'Full Control',
    tagClass:
      'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    description:
      'Build your own custom viewer UI from scratch. We provide the engine and hooks, you control the pixels.',
    features: [
      '100% UI Customization',
      'React, Vue, Svelte Hooks',
      'Lightweight Core',
    ],
    checkColor: 'text-blue-500',
    ctaTitle: 'Choose your framework',
    links: [
      {
        href: '/docs/react/headless/introduction',
        icon: <ReactIcon className="h-5 w-5 text-[#61DAFB]" />,
        text: 'React',
      },
      {
        href: '/docs/vue/headless/introduction',
        icon: <VueIcon className="h-5 w-5 text-[#4FC08D]" />,
        text: 'Vue',
      },
      {
        href: '/docs/svelte/headless/introduction',
        icon: <SvelteIcon className="h-5 w-5 text-[#FF3E00]" />,
        text: 'Svelte',
      },
    ],
  },
]

// Documentation Paths Component
const DocPaths = () => {
  return (
    <div className="mb-32">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-8 md:grid-cols-2">
          {paths.map((path, idx) => (
            <div
              key={idx}
              className="group relative flex h-full flex-col rounded-3xl border border-gray-200 bg-white p-8 shadow-sm transition-all hover:shadow-2xl dark:border-gray-800 dark:bg-gray-900"
            >
              <div
                className={`absolute right-6 top-6 opacity-5 transition-opacity group-hover:opacity-10 dark:opacity-10 dark:group-hover:opacity-20 ${path.bgIconClass}`}
              >
                {path.icon}
              </div>

              <div className="relative">
                <h3 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
                  {path.title}
                </h3>
                <div
                  className={`mb-6 inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-medium ${path.tagClass}`}
                >
                  {path.tag}
                </div>

                <p className="mb-8 min-h-[3rem] text-lg text-gray-600 dark:text-gray-400">
                  {path.description}
                </p>

                <ul className="mb-10 space-y-4">
                  {path.features.map((feature, fIdx) => (
                    <li
                      key={fIdx}
                      className="flex items-center gap-3 text-gray-700 dark:text-gray-300"
                    >
                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-full ${path.checkColor.replace('text-', 'bg-').replace('500', '100')} dark:bg-gray-800`}
                      >
                        <Check
                          className={`h-3.5 w-3.5 ${path.checkColor}`}
                          strokeWidth={3}
                        />
                      </div>
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto">
                  <div className="tracking-wider mb-4 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    {path.ctaTitle}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {path.links.map((link, lIdx) => (
                      <Link
                        key={lIdx}
                        href={link.href}
                        className="group/btn flex items-center justify-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 transition-all hover:border-gray-300 hover:bg-white hover:shadow-md dark:border-gray-700 dark:bg-gray-800/50 dark:hover:border-gray-600 dark:hover:bg-gray-800"
                      >
                        {link.icon}
                        <span className="font-medium text-gray-700 dark:text-gray-200">
                          {link.text}
                        </span>
                        <ArrowRight className="-ml-1 h-4 w-4 text-gray-400 opacity-0 transition-all group-hover/btn:ml-0 group-hover/btn:text-gray-600 group-hover/btn:opacity-100 dark:text-gray-500 dark:group-hover/btn:text-gray-300" />
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const SupportSection = () => {
  return (
    <div className="relative mt-20 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900">
      {/* Background gradients */}
      <div className="absolute -left-20 top-0 h-64 w-64 rounded-full bg-purple-500/10 blur-3xl"></div>
      <div className="absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl"></div>

      <div className="relative px-8 py-12 text-center md:px-12">
        <h2 className="mb-4 text-3xl font-bold text-gray-900 dark:text-white">
          Need help?
        </h2>
        <p className="mx-auto mb-8 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
          Join our community for support, discussions, and to contribute to
          EmbedPDF's development.
        </p>

        <div className="flex flex-wrap justify-center gap-4">
          <a
            href="https://github.com/embedpdf/embed-pdf-viewer/issues"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-6 py-3 font-medium text-white transition-transform hover:scale-105 dark:bg-white dark:text-gray-900"
          >
            <Github className="h-5 w-5" />
            <span>GitHub Discussions</span>
          </a>
          <a
            href="https://discord.gg/mHHABmmuVU"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-[#5865F2] px-6 py-3 font-medium text-white transition-transform hover:scale-105"
          >
            <DiscordIcon size={20} strokeColor="white" />
            <span>Discord</span>
          </a>
          <Link
            href="/sponsorship"
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-6 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <Heart className="h-5 w-5 text-red-500" />
            <span>Support Us</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

const DocsOverview = () => {
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
          <div className="mb-16 text-center">
            <div className="mb-6 inline-block rounded-full border border-blue-200 bg-blue-50 px-6 py-2 text-sm font-medium text-blue-800 dark:border-blue-800/30 dark:bg-blue-900/20 dark:text-blue-300">
              Documentation
            </div>
            <h1 className="mb-6 text-4xl font-black leading-tight tracking-tight text-gray-900 dark:text-white md:text-6xl">
              <span className="relative inline-block">
                <span className="relative z-10">Everything you need</span>
                <div className="absolute bottom-2 left-0 right-0 -z-10 h-4 -rotate-1 transform text-[#bedbff] opacity-50 dark:text-blue-800 md:h-6">
                  <Scribble3 color="currentColor" />
                </div>
              </span>
              <br className="hidden md:block" />{' '}
              <span className="bg-gradient-to-r from-blue-600 to-teal-500 bg-clip-text text-transparent">
                to build amazing PDF experiences
              </span>
            </h1>
            <p className="mx-auto max-w-2xl text-xl text-gray-600 dark:text-gray-400">
              Two powerful ways to use EmbedPDF. Choose between our ready-made
              viewer for instant results, or our headless components for
              complete control.
            </p>
          </div>

          {/* New Documentation Paths */}
          <DocPaths />

          {/* Main Documentation */}
          <div className="mx-auto max-w-6xl">
            <div className="mb-8 flex items-center space-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                <Package size={20} />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Reference Packages
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {packages.map((pkg) => (
                <PackageCard key={pkg.id} pkg={pkg} />
              ))}
            </div>

            {/* Community Support */}
            <SupportSection />
          </div>
        </div>
      </div>
    </div>
  )
}

export default DocsOverview
