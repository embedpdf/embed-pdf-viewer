'use client'
import React from 'react'
import {
  ArrowRight,
  Code,
  ExternalLink,
  Github,
  Heart,
  Play,
} from 'lucide-react'
import { JavaScript } from '@/components/icons/javascript'
import { Typescript } from '@/components/icons/typescript'
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
                A lightweight, customizable PDF viewer that works seamlessly
                with any JavaScript project. No dependencies, no hassle.
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

              {/* Feature cards */}
              <div className="mt-24 grid grid-cols-1 gap-6 md:grid-cols-3">
                <div className="group relative">
                  <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-purple-600 to-blue-500 opacity-25 blur transition duration-200 group-hover:opacity-100"></div>
                  <div className="relative h-full rounded-2xl bg-white p-6 shadow-lg dark:bg-gray-900">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[#765ba7]">
                      <Heart size={24} className="text-white" />
                    </div>
                    <h3 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">
                      Truly Open and Free
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      MIT licensed, no paywalls, no limits. Skip overpriced SDKs
                      with full source access.
                    </p>
                  </div>
                </div>

                <div className="group relative">
                  <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-blue-500 to-orange-400 opacity-25 blur transition duration-200 group-hover:opacity-100"></div>
                  <div className="relative h-full rounded-2xl bg-white p-6 shadow-lg dark:bg-gray-900">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[#765ba7]">
                      <Code size={24} className="text-white" />
                    </div>
                    <h3 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">
                      Customizable
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      Extensive API for complete control. Themes, annotations,
                      search, and more.
                    </p>
                  </div>
                </div>

                <div className="group relative">
                  <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-orange-400 to-red-500 opacity-25 blur transition duration-200 group-hover:opacity-100"></div>
                  <div className="relative h-full rounded-2xl bg-white p-6 shadow-lg dark:bg-gray-900">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[#765ba7]">
                      <ExternalLink size={24} className="text-white" />
                    </div>
                    <h3 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">
                      Works Everywhere
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      Works with JavaScript or TypeScript projects. React, Vue,
                      Svelte, or vanilla.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-24">
          {/* Embed Code Section */}
          <div className="relative mb-24">
            <div className="mx-auto max-w-4xl px-4">
              {/* Header */}
              <div className="mb-8 text-center">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
                  Quick Integration
                </h2>
                <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
                  Get started in seconds with just two lines of code
                </p>
              </div>

              <CodeShowcase />
            </div>
          </div>

          {/* Interactive Demo Section */}
          <div className="relative">
            {/* Header with arrow and call-to-action */}
            <div className="mb-8 text-center">
              <div className="relative inline-block">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
                  See it in action
                </h2>
              </div>
              <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
                Interact with our PDF viewer below - zoom, scroll, and navigate
                through pages
              </p>
            </div>

            {/* PDF Viewer with enhanced styling */}
            <div className="group relative mx-auto max-w-4xl px-4">
              {/* Main viewer container */}
              <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
                <PDFViewer className="h-[500px] w-full md:h-[700px]" />
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

          <div className="relative mt-20 px-4">
            <div className="relative mx-auto max-w-4xl overflow-hidden rounded-2xl">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 via-blue-500/20 to-orange-400/20"></div>
              <div className="relative rounded-2xl p-8 md:p-12">
                <h2 className="mx-auto mb-4 max-w-2xl text-center text-2xl font-bold text-gray-900 dark:text-white md:text-3xl">
                  Ready to transform your PDF experience?
                </h2>
                <p className="mx-auto mb-8 max-w-2xl text-center text-gray-600 dark:text-gray-300">
                  Join thousands of developers who&apos;ve simplified their PDF
                  integration with EmbedPDF.
                </p>
                <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <Link
                    href="/docs"
                    className="inline-flex items-center justify-center rounded-full bg-gray-900 px-6 py-3 font-medium text-white shadow-lg transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                  >
                    Get Started Free
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                  <Link
                    href="/sponsorship"
                    className="inline-flex items-center justify-center rounded-full border-2 border-purple-600 bg-transparent px-6 py-3 font-medium text-purple-600 shadow-lg transition-all hover:bg-purple-600 hover:text-white dark:border-purple-400 dark:text-purple-400 dark:hover:bg-purple-400 dark:hover:text-gray-900"
                  >
                    <Heart className="mr-2 h-5 w-5" />
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
