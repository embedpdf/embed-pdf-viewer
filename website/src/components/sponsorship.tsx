'use client'
import React from 'react'

const Sponsorship2: React.FC = () => {
  return (
    <div className="">
      <style jsx>{`
        @keyframes float {
          0% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-20px);
          }
          100% {
            transform: translateY(0px);
          }
        }
        .float-animation {
          animation: float 6s ease-in-out infinite;
        }
        .gradient-text {
          background: linear-gradient(to right, #3b82f6, #8b5cf6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        @keyframes progress {
          0% {
            width: 0%;
          }
          100% {
            width: var(--progress);
          }
        }
        .progress-animation {
          animation: progress 2s ease-out forwards;
        }
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

      {/* Hero Section - The Story */}
      <section className="relative">
        {/* Animated background */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="top-70 animate-blob absolute left-8 h-64 w-64 rounded-full bg-purple-500 opacity-10 mix-blend-multiply blur-3xl filter dark:opacity-20 dark:mix-blend-normal"></div>
          <div className="animate-blob animation-delay-2000 absolute -right-8 top-32 h-80 w-80 rounded-full bg-blue-500 opacity-10 mix-blend-multiply blur-3xl filter dark:opacity-20 dark:mix-blend-normal"></div>
          <div className="animate-blob animation-delay-4000 absolute bottom-24 left-20 h-72 w-72 rounded-full bg-orange-400 opacity-10 mix-blend-multiply blur-3xl filter dark:opacity-20 dark:mix-blend-normal"></div>
          <div className="bg-grid-pattern absolute inset-0 opacity-5 dark:opacity-[0.03]"></div>
        </div>
        <div className="relative mx-auto max-w-4xl px-6 py-20">
          {/* Personal Badge */}
          <div className="mb-8 text-center">
            <span className="inline-block rounded-full border border-purple-200 bg-purple-50 px-6 py-2 text-sm font-medium text-purple-800 dark:border-purple-800/30 dark:bg-purple-900/20 dark:text-purple-300">
              💜 A message from Bob Singor, Founder of EmbedPDF
            </span>
          </div>

          <h1 className="mb-12 text-center text-4xl font-black leading-tight text-gray-900 dark:text-white md:text-5xl lg:text-6xl">
            I Did Not Want to Pay{' '}
            <span className="text-red-600 dark:text-red-500">
              $180,000/year
            </span>
            <br /> For a PDF SDK. <br />
            <span className="gradient-text">So I Built My Own.</span>
          </h1>

          <div className="prose prose-xl mb-12 max-w-none text-gray-700 dark:text-gray-300">
            <p className="mb-8 text-xl leading-relaxed">
              When I needed a PDF SDK for my project, what I discovered about
              the industry shocked me:
            </p>

            <div className="relative mb-10 overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-gray-900 to-slate-900 p-8 shadow-2xl dark:border dark:border-gray-800">
              {/* Background effects */}
              <div className="absolute right-0 top-0 h-32 w-32 -translate-y-1/2 translate-x-1/2 transform rounded-full bg-gradient-to-br from-red-400 to-orange-500 opacity-20 blur-2xl"></div>
              <div className="absolute bottom-0 left-0 h-24 w-24 -translate-x-1/2 translate-y-1/2 transform rounded-full bg-gradient-to-br from-blue-400 to-purple-500 opacity-20 blur-2xl"></div>

              <div className="relative z-10 grid gap-6 md:grid-cols-3">
                <div className="text-center">
                  <div className="mb-2 text-3xl font-bold text-red-400">
                    Apryse
                  </div>
                  <div className="text-xl font-semibold text-white">
                    $30K-$700K/year
                  </div>
                </div>
                <div className="text-center">
                  <div className="mb-2 text-3xl font-bold text-orange-400">
                    Nutrient
                  </div>
                  <div className="text-xl font-semibold text-white">
                    $25K-$400K/year
                  </div>
                </div>
                <div className="text-center">
                  <div className="mb-2 text-3xl font-bold text-yellow-400">
                    ComPDF
                  </div>
                  <div className="text-xl font-semibold text-white">
                    $15K-$100K/year
                  </div>
                </div>
              </div>
            </div>

            <p className="mb-6 text-xl leading-relaxed">
              These weren&apos;t just expensive licenses. They were{' '}
              <strong className="text-gray-900 dark:text-white">
                &quot;black boxes&quot;
              </strong>{' '}
              — closed source code you can&apos;t inspect, modify, or truly own.
              Your entire product depends on software you can&apos;t see, from
              vendors who can change pricing at any time.
            </p>

            <p className="text-xl font-semibold leading-relaxed">
              <span className="text-blue-600 dark:text-blue-400">
                So I started building an open-source alternative.
              </span>{' '}
              No vendor lock-in. No black boxes. Just great PDF technology that
              developers can trust.
            </p>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <a
              href="#join-movement"
              className="group relative inline-flex w-full items-center justify-center overflow-hidden rounded-full bg-gray-900 px-8 py-4 text-base font-medium text-white shadow-xl dark:bg-white dark:text-gray-900 lg:w-auto"
            >
              <span className="absolute left-0 top-0 h-full w-full bg-gradient-to-r from-purple-600 via-blue-500 to-orange-400 opacity-0 transition-opacity group-hover:opacity-100"></span>
              <span className="relative z-10 flex items-center">
                Become a Founding Sponsor
                <svg
                  className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  ></path>
                </svg>
              </span>
            </a>
            <a
              href="https://app.embedpdf.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative inline-flex w-full items-center justify-center overflow-hidden rounded-full bg-gradient-to-r from-purple-600 via-blue-500 to-orange-400 px-8 py-4 text-base font-medium text-white shadow-xl transition-all hover:scale-105 hover:shadow-2xl lg:w-auto"
            >
              <span className="absolute left-0 top-0 h-full w-full bg-gradient-to-r from-orange-400 via-red-500 to-pink-500 opacity-0 transition-opacity group-hover:opacity-100"></span>
              <span className="relative z-10 flex items-center">
                <div className="mr-3 rounded-full bg-white/20 p-1.5 backdrop-blur-sm">
                  <svg
                    className="h-4 w-4 fill-current transition-transform group-hover:scale-110"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M15 14h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    ></path>
                  </svg>
                </div>
                Try Live Demo
              </span>
              <div className="absolute inset-0 rounded-full border-2 border-white/30 transition-all group-hover:scale-110 group-hover:border-white/50"></div>
            </a>
            <a
              href="https://github.com/embedpdf/embed-pdf-viewer"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex w-full items-center justify-center px-5 py-3 text-base font-medium text-gray-700 transition-all hover:text-gray-900 dark:text-gray-300 dark:hover:text-white lg:w-auto"
            >
              <div className="flex items-center space-x-2 border-b border-dashed border-gray-300 group-hover:border-gray-600 dark:border-gray-600 dark:group-hover:border-gray-400">
                <svg
                  className="h-5 w-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836a9.59 9.59 0 012.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"></path>
                </svg>
                <span>2,000+ Stars on GitHub</span>
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* Our Progress in 7 Months */}
      <section className="bg-gray-50 py-20 dark:bg-gray-900">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <h2 className="mb-6 text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
              What We Built in 8 Months{' '}
              <span className="text-gray-500 dark:text-gray-400">
                (With Zero Funding)
              </span>
            </h2>

            <div className="mb-12 rounded-xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="grid gap-6 text-center md:grid-cols-3">
                <div>
                  <div className="mb-1 text-3xl font-black text-blue-600 dark:text-blue-400">
                    2,000+
                  </div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    GitHub Stars
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Organic developer interest
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-3xl font-black text-green-600 dark:text-green-400">
                    Web SDK
                  </div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    Production Ready
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Used by real companies
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-3xl font-black text-purple-600 dark:text-purple-400">
                    100%
                  </div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    Open Source
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    MIT licensed forever
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center">
              <h3 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">
                Our Vision: A Complete Multi-Platform PDF SDK
              </h3>

              <div className="mx-auto max-w-3xl text-center">
                <p className="text-lg leading-relaxed text-gray-600 dark:text-gray-300">
                  Universal platform support, enterprise-grade performance,
                  sponsor-driven development, and 100% open source forever —
                  building the PDF SDK developers deserve.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Problem Section */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="mb-12 text-center text-4xl font-black text-gray-900 dark:text-white">
            Real Conversations from This Week
          </h2>

          <div className="mb-12 grid gap-8 md:grid-cols-3">
            <div className="rounded-xl bg-white p-6 shadow-lg dark:border dark:border-gray-800 dark:bg-gray-900">
              <div className="mb-3 font-bold text-red-600 dark:text-red-400">
                SaaS Founder
              </div>
              <p className="mb-3 text-gray-700 dark:text-gray-300">
                &quot;We&apos;re using Nutrient and I&apos;m terrified they
                might double the price. We couldn&apos;t afford it and our whole
                business depends on their software.&quot;
              </p>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                — CEO, phone call
              </div>
            </div>

            <div className="rounded-xl bg-white p-6 shadow-lg dark:border dark:border-gray-800 dark:bg-gray-900">
              <div className="mb-3 font-bold text-orange-600 dark:text-orange-400">
                Small Startup
              </div>
              <p className="mb-3 text-gray-700 dark:text-gray-300">
                &quot;They told us $25,000/year is their minimum. That&apos;s
                our entire tools budget for the year.&quot;
              </p>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                — Startup founder, phone call
              </div>
            </div>

            <div className="rounded-xl bg-white p-6 shadow-lg dark:border dark:border-gray-800 dark:bg-gray-900">
              <div className="mb-3 font-bold text-blue-600 dark:text-blue-400">
                Construction Software
              </div>
              <p className="mb-3 text-gray-700 dark:text-gray-300">
                &quot;We need multi-platform support and would much rather
                invest in open-source than pay Apryse or Nutrient tens of
                thousands for a black box.&quot;
              </p>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                — Founder, phone call
              </div>
            </div>
          </div>

          <div className="mt-12 text-center">
            <p className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">
              Every story is the same: trapped by expensive, closed-source
              vendors.
            </p>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              It&apos;s time for an open-source alternative that companies can
              actually own.
            </p>
          </div>
        </div>
      </section>

      {/* The Ask */}
      <section className="py-20" id="join-movement">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-3xl border bg-gradient-to-br from-gray-900 to-blue-900 px-6 py-20 dark:border-gray-700 md:px-10">
            <div className="text-center text-white">
              <h2 className="mb-6 text-4xl font-black md:text-5xl">
                Let&apos;s Build the Alternative Together
              </h2>

              <p className="mx-auto mb-12 max-w-3xl text-2xl leading-relaxed">
                Instead of paying $50K-$700K/year to vendors, invest a fraction
                of that to build an{' '}
                <strong>open-source SDK you&apos;ll own forever.</strong>
              </p>

              <div className="mb-12 rounded-3xl bg-white/10 p-6 backdrop-blur sm:p-8 md:p-10">
                <h3 className="mb-8 text-3xl font-bold">
                  Our Funding Goal: $30,000/month
                </h3>

                <div className="mb-8 grid gap-8 text-left md:grid-cols-2">
                  <div>
                    <h4 className="mb-4 text-xl font-bold text-yellow-300">
                      This Enables:
                    </h4>
                    <ul className="space-y-3">
                      <li className="flex items-start">
                        <svg
                          className="mr-2 mt-0.5 h-6 w-6 flex-shrink-0 text-green-400"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          ></path>
                        </svg>
                        <span>Me working full-time as lead developer</span>
                      </li>
                      <li className="flex items-start">
                        <svg
                          className="mr-2 mt-0.5 h-6 w-6 flex-shrink-0 text-green-400"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          ></path>
                        </svg>
                        <span>Hiring a senior mobile SDK developer</span>
                      </li>
                      <li className="flex items-start">
                        <svg
                          className="mr-2 mt-0.5 h-6 w-6 flex-shrink-0 text-green-400"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          ></path>
                        </svg>
                        <span>Accelerated development timeline</span>
                      </li>
                      <li className="flex items-start">
                        <svg
                          className="mr-2 mt-0.5 h-6 w-6 flex-shrink-0 text-green-400"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          ></path>
                        </svg>
                        <span>Professional project sustainability</span>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="mb-4 text-xl font-bold text-yellow-300">
                      You Get:
                    </h4>
                    <ul className="space-y-3">
                      <li className="flex items-start">
                        <svg
                          className="mr-2 mt-0.5 h-6 w-6 flex-shrink-0 text-green-400"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          ></path>
                        </svg>
                        <span>Multi-platform SDKs in 12 months</span>
                      </li>
                      <li className="flex items-start">
                        <svg
                          className="mr-2 mt-0.5 h-6 w-6 flex-shrink-0 text-green-400"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          ></path>
                        </svg>
                        <span>Direct influence on the roadmap</span>
                      </li>
                      <li className="flex items-start">
                        <svg
                          className="mr-2 mt-0.5 h-6 w-6 flex-shrink-0 text-green-400"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          ></path>
                        </svg>
                        <span>No vendor lock-in ever again</span>
                      </li>
                      <li className="flex items-start">
                        <svg
                          className="mr-2 mt-0.5 h-6 w-6 flex-shrink-0 text-green-400"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          ></path>
                        </svg>
                        <span>80-95% cost savings forever</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-2">
                  <div className="mb-3 text-center sm:text-left">
                    <div className="text-sm text-white/80">
                      Current Progress
                    </div>
                    <div className="text-lg font-bold sm:text-xl">
                      $2,650 / $30,000 per month
                    </div>
                  </div>
                  <div className="h-6 overflow-hidden rounded-full bg-white/20 sm:h-8">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-1000 ease-out"
                      style={{ width: 'max(3%, 8.83%)' }}
                    ></div>
                  </div>
                  <div className="mt-2 text-center text-xs text-white/70 sm:text-left sm:text-sm">
                    8.83% funded
                  </div>
                </div>
              </div>

              <a
                href="#sponsorship-tiers"
                className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-gradient-to-r from-yellow-400 to-orange-400 px-8 py-4 text-lg font-bold text-gray-900 shadow-xl transition-all hover:scale-105 hover:shadow-2xl sm:px-10 sm:py-5 sm:text-xl"
              >
                <span className="absolute left-0 top-0 h-full w-full bg-gradient-to-r from-orange-400 via-red-500 to-pink-500 opacity-0 transition-opacity group-hover:opacity-100"></span>
                <span className="relative z-10 flex items-center whitespace-nowrap">
                  <span className="sm:hidden">Join Movement</span>
                  <span className="hidden sm:inline">
                    View Sponsorship Options
                  </span>
                  <svg
                    className="ml-2 h-6 w-6 transition-transform group-hover:translate-x-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    ></path>
                  </svg>
                </span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Sponsorship Tiers */}
      <section
        className="bg-white py-20 dark:bg-gray-950"
        id="sponsorship-tiers"
      >
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="mb-6 text-center text-4xl font-black text-gray-900 dark:text-white">
            Become a Founding Sponsor
          </h2>
          <p className="mx-auto mb-20 max-w-3xl text-center text-xl text-gray-600 dark:text-gray-400">
            The first 10 sponsors that commit to one of the plans below for 1
            year will be permanently recognized as founding sponsors who made
            this project possible.
          </p>
          <div className="grid gap-8 md:grid-cols-3">
            {/* Bronze */}
            <div className="rounded-2xl border-2 border-gray-200 p-8 transition hover:scale-105 hover:transform hover:border-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-400">
              <div className="mb-6 text-center">
                <h3 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
                  Bronze
                </h3>
                <div className="text-4xl font-black text-gray-600 dark:text-gray-300">
                  $500-1,500
                </div>
                <div className="text-gray-500 dark:text-gray-400">
                  per month
                </div>
              </div>
              <ul className="mb-8 space-y-3 text-gray-700 dark:text-gray-300">
                <li className="flex items-start">
                  <svg
                    className="mr-2 mt-0.5 h-5 w-5 text-green-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span>Logo on website & README</span>
                </li>
                <li className="flex items-start">
                  <svg
                    className="mr-2 mt-0.5 h-5 w-5 text-green-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span>Monthly roadmap input calls</span>
                </li>
                <li className="flex items-start">
                  <svg
                    className="mr-2 mt-0.5 h-5 w-5 text-green-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span>Private Discord sponsor channel</span>
                </li>
                <li className="flex items-start">
                  <svg
                    className="mr-2 mt-0.5 h-5 w-5 text-green-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span>Priority GitHub issue response</span>
                </li>
                <li className="flex items-start">
                  <svg
                    className="mr-2 mt-0.5 h-5 w-5 text-green-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span>Sponsor updates</span>
                </li>
              </ul>
              <div className="text-center">
                <a
                  href="#contact"
                  className="inline-flex w-full items-center justify-center rounded-full bg-gray-100 py-3 font-semibold text-gray-900 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
                >
                  Get Started
                </a>
              </div>
            </div>

            {/* Silver - Most Popular */}
            <div className="relative scale-105 transform rounded-2xl border-2 border-blue-500 p-8 shadow-xl dark:bg-gray-900">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 transform">
                <span className="rounded-full bg-blue-500 px-4 py-1 text-sm font-bold text-white">
                  SWEET SPOT
                </span>
              </div>
              <div className="mb-6 text-center">
                <h3 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
                  Silver
                </h3>
                <div className="text-4xl font-black text-blue-600 dark:text-blue-400">
                  $2,500
                </div>
                <div className="text-gray-500 dark:text-gray-400">
                  per month
                </div>
              </div>
              <ul className="mb-8 space-y-3 text-gray-700 dark:text-gray-300">
                <li className="flex items-start">
                  <svg
                    className="mr-2 mt-0.5 h-5 w-5 text-green-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span>Everything in Bronze</span>
                </li>
                <li className="flex items-start">
                  <svg
                    className="mr-2 mt-0.5 h-5 w-5 text-green-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span>Prominent logo placement</span>
                </li>
                <li className="flex items-start">
                  <svg
                    className="mr-2 mt-0.5 h-5 w-5 text-green-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span>Bi-weekly 1:1 founder calls</span>
                </li>
                <li className="flex items-start">
                  <svg
                    className="mr-2 mt-0.5 h-5 w-5 text-green-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span>Feature request priority</span>
                </li>
                <li className="flex items-start">
                  <svg
                    className="mr-2 mt-0.5 h-5 w-5 text-green-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span>Technical support & integration help</span>
                </li>
              </ul>
              <div className="text-center">
                <a
                  href="#contact"
                  className="inline-flex w-full items-center justify-center rounded-full bg-blue-600 py-3 font-semibold text-white shadow-lg transition hover:bg-blue-700 hover:shadow-xl"
                >
                  Become a Silver Sponsor
                </a>
              </div>
            </div>

            {/* Gold */}
            <div className="rounded-2xl border-2 border-gray-200 p-8 transition hover:scale-105 hover:transform hover:border-yellow-500 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-yellow-400">
              <div className="mb-6 text-center">
                <h3 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
                  Gold
                </h3>
                <div className="text-4xl font-black text-yellow-600 dark:text-yellow-400">
                  $5,000+
                </div>
                <div className="text-gray-500 dark:text-gray-400">
                  per month
                </div>
              </div>
              <ul className="mb-8 space-y-3 text-gray-700 dark:text-gray-300">
                <li className="flex items-start">
                  <svg
                    className="mr-2 mt-0.5 h-5 w-5 text-green-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span>Everything in Silver</span>
                </li>
                <li className="flex items-start">
                  <svg
                    className="mr-2 mt-0.5 h-5 w-5 text-green-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span>Weekly direct founder access</span>
                </li>
                <li className="flex items-start">
                  <svg
                    className="mr-2 mt-0.5 h-5 w-5 text-green-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span>Custom feature development priority</span>
                </li>
                <li className="flex items-start">
                  <svg
                    className="mr-2 mt-0.5 h-5 w-5 text-green-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span>Full migration assistance & consulting</span>
                </li>
                <li className="flex items-start">
                  <svg
                    className="mr-2 mt-0.5 h-5 w-5 text-green-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span>Co-marketing & case study opportunities</span>
                </li>
              </ul>
              <div className="text-center">
                <a
                  href="#contact"
                  className="inline-flex w-full items-center justify-center rounded-full bg-yellow-100 py-3 font-semibold text-gray-900 transition hover:bg-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-300 dark:hover:bg-yellow-500/30"
                >
                  Discuss Gold Sponsorship
                </a>
              </div>
            </div>
          </div>

          <div className="mt-20 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-purple-50 p-8 text-center dark:border-blue-800 dark:from-blue-900/20 dark:to-purple-900/20">
            <p className="mb-4 text-2xl font-bold text-blue-600 dark:text-blue-400">
              🔓 Own Your Code Forever
            </p>
            <p className="text-lg leading-relaxed text-gray-700 dark:text-gray-300">
              Stop paying endless licensing fees for software black boxes.
              <br />
              <span className="font-semibold text-blue-600 dark:text-blue-400">
                Sponsor open-source development once, own the technology
                forever.
              </span>
              <br />
              <span className="mt-2 block text-base text-gray-600 dark:text-gray-400">
                No vendor lock-in. No surprise price hikes. No limitations.
              </span>
            </p>
          </div>

          {/* Community Support Section */}
          <div className="mt-8 rounded-xl bg-gray-100 p-6 text-center dark:bg-gray-900">
            <h3 className="mb-3 text-xl font-bold text-gray-800 dark:text-white">
              Can&apos;t commit to a big sponsorship?
            </h3>
            <p className="mb-4 text-gray-600 dark:text-gray-400">
              Every contribution helps! Support with any amount starting from
              $5/month.
            </p>
            <a
              href="https://github.com/sponsors/embedpdf"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-lg bg-gray-800 px-6 py-3 font-semibold text-white transition hover:bg-gray-900 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            >
              <svg
                className="mr-2 h-5 w-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836a9.59 9.59 0 012.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
              </svg>
              Support on GitHub Sponsors
            </a>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 dark:bg-gray-900">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="mb-12 text-center text-4xl font-black text-gray-900 dark:text-white">
            Questions I&apos;m Hearing
          </h2>

          <div className="space-y-6">
            <div className="rounded-xl bg-white p-6 shadow-lg dark:border dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 text-xl font-bold text-gray-900 dark:text-white">
                Why should I trust this will succeed?
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                Fair question. Look at our track record: 2,000+ GitHub stars and
                a working Web SDK in just 8 months with zero funding. I&apos;ve
                been building PDF technology for years and understand the
                ecosystem deeply. The project has real momentum, active
                community engagement, and proven development velocity.
              </p>
            </div>

            <div className="rounded-xl bg-white p-6 shadow-lg dark:border dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 text-xl font-bold text-gray-900 dark:text-white">
                What happens to my sponsorship if you get acquired?
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                The code is MIT licensed forever. The community owns the code.
                That&apos;s the beauty of open source—no single entity can take
                it away.
              </p>
            </div>

            <div className="rounded-xl bg-white p-6 shadow-lg dark:border dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 text-xl font-bold text-gray-900 dark:text-white">
                Why $30,000/month?
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                Transparency: This covers my salary as lead developer
                ($15-18K/month) and hiring a senior mobile developer
                ($12-15K/month). Two experienced developers working full-time
                can deliver what normally takes a team of 5-10 at a big company.
                We&apos;re lean, focused, and motivated.
              </p>
            </div>

            <div className="rounded-xl bg-white p-6 shadow-lg dark:border dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 text-xl font-bold text-gray-900 dark:text-white">
                What if we need features you haven&apos;t built yet?
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                That&apos;s the beauty of open source with active development.
                Gold sponsors get custom feature development. Silver sponsors
                influence the roadmap. And since it&apos;s MIT licensed, you can
                always hire your own developers to add features. Try doing that
                with Apryse&apos;s closed source code.
              </p>
            </div>

            <div className="rounded-xl bg-white p-6 shadow-lg dark:border dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 text-xl font-bold text-gray-900 dark:text-white">
                How do I justify this to my CFO?
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                Simple ROI: If you&apos;re paying $150K+/year for a PDF SDK,
                sponsoring at $30K/year saves you $120K annually. Plus you
                eliminate vendor risk, gain code ownership, and can customize
                anything. It&apos;s a no-brainer financially. I&apos;m happy to
                jump on a call with your finance team to walk through the
                numbers.
              </p>
            </div>

            <div className="rounded-xl bg-white p-6 shadow-lg dark:border dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 text-xl font-bold text-gray-900 dark:text-white">
                Can we try it first?
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                Absolutely! Try it right now: &nbsp;
                <a
                  href="https://app.embedpdf.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Live demo →
                </a>{' '}
                or &nbsp;
                <a
                  href="https://github.com/embedpdf/embed-pdf-viewer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  browse the code →
                </a>{' '}
                Use it, test it, deploy it in production if you want. See for
                yourself how it performs before making any sponsorship
                decisions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20" id="contact">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-3xl border bg-gradient-to-br from-gray-900 to-blue-900 px-6 py-20 text-center text-white dark:border-gray-700 md:px-10">
            <h2 className="mb-6 text-4xl font-black md:text-5xl">
              Ready to Own Your PDF Technology?
            </h2>

            <p className="mb-8 text-xl leading-relaxed text-gray-200">
              Let&apos;s have a real conversation about breaking free from
              vendor lock-in. I personally respond to every message.
            </p>

            <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur md:p-8">
              <h3 className="mb-6 text-2xl font-bold text-white">
                Direct Line to the Founder
              </h3>

              <div className="space-y-4 text-lg">
                <a
                  href="mailto:bob.singor@embedpdf.com"
                  className="flex items-center justify-center text-gray-200 transition-colors hover:text-white"
                >
                  <svg
                    className="mr-3 h-6 w-6"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"></path>
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"></path>
                  </svg>
                  bob.singor@embedpdf.com
                </a>

                <a
                  href="https://cal.com/embedpdf/30min"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center rounded-lg bg-blue-600 py-3 font-bold text-white transition-colors hover:bg-blue-700"
                >
                  <svg
                    className="mr-3 h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    ></path>
                  </svg>
                  Book a 30-min Call
                </a>

                <a
                  href="https://discord.gg/mHHABmmuVU"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center text-purple-300 transition-colors hover:text-purple-200"
                >
                  <svg
                    className="mr-3 h-6 w-6"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                  Join our Discord
                </a>
              </div>

              <p className="mt-6 text-sm text-gray-300">
                Or find me on LinkedIn, Twitter (@bobsingor), or wherever you
                prefer. Let&apos;s discuss how to save your company hundreds of
                thousands per year.
              </p>
            </div>

            <div className="mt-12">
              <p className="mb-4 text-2xl font-bold">
                Join the open-source PDF revolution.
              </p>
              <p className="text-xl text-gray-200">
                Let&apos;s build technology that nobody can take away.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
export default Sponsorship2
