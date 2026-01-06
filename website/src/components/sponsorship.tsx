'use client'
import React from 'react'
import {
  Heart,
  ArrowRight,
  Check,
  Zap,
  Star,
  Shield,
  Code,
  Users,
  MessageCircle,
  TrendingUp,
  Mail,
  Calendar,
  Github,
  Building2,
} from 'lucide-react'
import Link from 'next/link'
import { Scribble2 } from '@/components/icons/scribble2'

// Animated background component (shared style)
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

const SponsorshipPage = () => {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <AnimatedBackground />

      {/* Inline styles for animations that might not be in global css */}
      <style jsx global>{`
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
        .animate-blob {
          animation: blob 7s infinite;
        }
        .gradient-text {
          background: linear-gradient(to right, #3b82f6, #8b5cf6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
          100% {
            transform: translate(0px, 0px) scale(1);
          }
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        .bg-grid-pattern {
          background-image:
            linear-gradient(to right, rgba(0, 0, 0, 0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0, 0, 0, 0.1) 1px, transparent 1px);
          background-size: 40px 40px;
        }
        .dark .bg-grid-pattern {
          background-image:
            linear-gradient(
              to right,
              rgba(255, 255, 255, 0.1) 1px,
              transparent 1px
            ),
            linear-gradient(
              to bottom,
              rgba(255, 255, 255, 0.1) 1px,
              transparent 1px
            );
        }
      `}</style>

      {/* Hero Section */}
      <div className="pb-16 pt-20 sm:pt-24 lg:pt-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative">
            <div className="mx-auto max-w-4xl">
              <div className="mb-6 text-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-6 py-2 text-sm font-medium text-purple-800 dark:border-purple-800/30 dark:bg-purple-900/20 dark:text-purple-300">
                  <Heart className="h-4 w-4 fill-current" />
                  <span>A message from Bob Singor, Founder</span>
                </span>
              </div>

              <h1 className="lg:text-7xl text-center text-4xl font-black leading-tight tracking-tight text-gray-900 dark:text-white md:text-6xl">
                I Did Not Want to Pay{' '}
                <span className="relative whitespace-nowrap text-red-600 dark:text-red-500">
                  <span className="relative z-10">$180,000/year</span>
                  <div className="absolute -bottom-2 left-0 right-0 -z-10 h-6 -rotate-1 transform text-red-200 opacity-50 dark:text-red-900/50">
                    <Scribble2 color="currentColor" />
                  </div>
                </span>
                <br /> For a PDF SDK. <br />
                <span className="gradient-text">So I Built My Own.</span>
              </h1>

              {/* Story Section - Left Aligned for Readability */}
              <div className="mx-auto mt-16 max-w-4xl text-left">
                <p className="mb-8 text-xl leading-relaxed text-gray-600 dark:text-gray-300">
                  When I needed a PDF SDK for my project, what I discovered
                  about the industry shocked me:
                </p>

                {/* Unified Context Card */}
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

                <p className="text-xl leading-relaxed text-gray-600 dark:text-gray-300">
                  These weren&apos;t just expensive licenses. They were{' '}
                  <strong className="text-gray-900 dark:text-white">
                    &quot;black boxes&quot;
                  </strong>{' '}
                  — closed source code you can&apos;t inspect, modify, or truly
                  own. Your entire product depends on software you can&apos;t
                  see, from vendors who can change pricing at any time.
                </p>

                <p className="mt-8 text-xl font-medium leading-relaxed text-gray-900 dark:text-white">
                  <span className="font-bold text-blue-600 dark:text-blue-400">
                    So I started building an open-source alternative.
                  </span>{' '}
                  No vendor lock-in. No black boxes. Just great PDF technology
                  developers can trust.
                </p>
              </div>

              <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <a
                  href="#sponsorship-tiers"
                  className="group relative inline-flex w-full items-center justify-center overflow-hidden rounded-full bg-gray-900 px-8 py-4 text-base font-medium text-white shadow-xl transition-all hover:scale-105 hover:shadow-2xl dark:bg-white dark:text-gray-900 sm:w-auto"
                >
                  <span className="absolute left-0 top-0 h-full w-full bg-gradient-to-r from-purple-600 via-blue-500 to-orange-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></span>
                  <span className="relative z-10 flex items-center">
                    Become a Founding Sponsor
                    <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </span>
                </a>
                <a
                  href="https://app.embedpdf.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex w-full items-center justify-center rounded-full bg-white px-8 py-4 text-base font-medium text-gray-700 shadow-md transition-all hover:bg-gray-50 hover:text-gray-900 hover:shadow-lg dark:bg-gray-800 dark:text-gray-200 dark:hover:text-white sm:w-auto"
                >
                  <Zap className="mr-2 h-4 w-4 fill-current text-purple-600 transition-transform group-hover:scale-110 dark:text-purple-400" />
                  Try Live Demo
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Section */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-8 shadow-xl dark:border-gray-800 dark:bg-gray-900 sm:p-12">
            <div className="absolute right-0 top-0 h-64 w-64 translate-x-1/3 translate-y-[-10%] rounded-full bg-green-500/10 blur-3xl"></div>

            <div className="relative z-10 text-center">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
                What We Built in 8 Months{' '}
                <span className="text-gray-400">(With Zero Funding)</span>
              </h2>

              <div className="mt-12 grid gap-8 sm:grid-cols-3">
                <div className="flex flex-col items-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    <Github className="h-8 w-8" />
                  </div>
                  <div className="mt-4 text-3xl font-black text-gray-900 dark:text-white">
                    2,000+
                  </div>
                  <div className="text-sm font-medium text-gray-500">
                    GitHub Stars
                  </div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                    <Check className="h-8 w-8" />
                  </div>
                  <div className="mt-4 text-3xl font-black text-gray-900 dark:text-white">
                    Prod Ready
                  </div>
                  <div className="text-sm font-medium text-gray-500">
                    Web SDK
                  </div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                    <Shield className="h-8 w-8" />
                  </div>
                  <div className="mt-4 text-3xl font-black text-gray-900 dark:text-white">
                    100%
                  </div>
                  <div className="text-sm font-medium text-gray-500">
                    Open Source (MIT)
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Problem / Conversations */}
      <section className="py-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
              Real Conversations
            </h2>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
              Why companies are switching to EmbedPDF
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                role: 'SaaS Founder',
                quote:
                  "We're using Nutrient and I'm terrified they might double the price. We couldn't afford it and our whole business depends on their software.",
                color: 'text-red-600 dark:text-red-400',
                bg: 'bg-red-50 dark:bg-red-900/10',
              },
              {
                role: 'Small Startup',
                quote:
                  "They told us $25,000/year is their minimum. That's our entire tools budget for the year.",
                color: 'text-orange-600 dark:text-orange-400',
                bg: 'bg-orange-50 dark:bg-orange-900/10',
              },
              {
                role: 'Enterprise CTO',
                quote:
                  'We need multi-platform support and would much rather invest in open-source than pay tens of thousands for a black box.',
                color: 'text-blue-600 dark:text-blue-400',
                bg: 'bg-blue-50 dark:bg-blue-900/10',
              },
            ].map((item, i) => (
              <div
                key={i}
                className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm transition-all hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
              >
                <div
                  className={`tracking-wide mb-4 inline-flex rounded-lg px-3 py-1 text-xs font-bold uppercase ${item.color} ${item.bg}`}
                >
                  {item.role}
                </div>
                <p className="text-lg leading-relaxed text-gray-700 dark:text-gray-300">
                  &quot;{item.quote}&quot;
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The Ask / Funding Goal */}
      <section className="py-20" id="join-movement">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gray-900 px-6 py-16 text-white shadow-2xl sm:px-12 sm:py-20">
            {/* Background effects */}
            <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-purple-500/20 blur-3xl"></div>
            <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl"></div>

            <div className="relative z-10 text-center">
              <h2 className="mb-6 text-3xl font-black md:text-5xl">
                Let&apos;s Build the Alternative Together
              </h2>
              <p className="mx-auto mb-12 max-w-2xl text-xl text-gray-300">
                Instead of paying $50K/year to vendors, invest a fraction of
                that to build an{' '}
                <strong>open-source SDK you&apos;ll own forever.</strong>
              </p>

              <div className="mx-auto max-w-3xl rounded-2xl bg-white/10 p-8 backdrop-blur-md">
                <div className="mb-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
                  <div className="text-left">
                    <div className="text-sm font-medium text-gray-400">
                      Monthly Funding Goal
                    </div>
                    <div className="text-3xl font-bold">$30,000</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-400">
                      Current Progress
                    </div>
                    <div className="text-2xl font-bold text-green-400">
                      $5,650 <span className="text-lg text-gray-500">/ mo</span>
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="relative h-6 w-full overflow-hidden rounded-full bg-gray-800">
                  <div
                    className="absolute left-0 top-0 h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-1000 ease-out"
                    style={{ width: '18.83%' }}
                  ></div>
                  <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow-md">
                    18.83% Funded
                  </div>
                </div>

                <div className="mt-8 grid gap-6 text-left sm:grid-cols-2">
                  <div>
                    <h4 className="mb-3 flex items-center gap-2 font-bold text-yellow-300">
                      <TrendingUp size={16} /> This Enables:
                    </h4>
                    <ul className="space-y-2 text-sm text-gray-300">
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 text-green-400" />{' '}
                        Full-time lead developer
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 text-green-400" />{' '}
                        Hiring senior mobile dev
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 text-green-400" />{' '}
                        Accelerated roadmap
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="mb-3 flex items-center gap-2 font-bold text-yellow-300">
                      <Heart size={16} /> You Get:
                    </h4>
                    <ul className="space-y-2 text-sm text-gray-300">
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 text-green-400" />{' '}
                        Multi-platform SDKs
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 text-green-400" />{' '}
                        Roadmap influence
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 text-green-400" />{' '}
                        80-95% cost savings
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sponsorship Tiers */}
      <section className="py-20" id="sponsorship-tiers">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
              Become a Founding Sponsor
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
              The first 10 sponsors will be permanently recognized as founding
              partners.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {/* Bronze */}
            <div className="group relative flex flex-col rounded-3xl border border-gray-200 bg-white p-8 shadow-sm transition-all hover:scale-105 hover:shadow-xl dark:border-gray-800 dark:bg-gray-900">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                <Star size={24} />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                Bronze
              </h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-black text-gray-900 dark:text-white">
                  $500-1,500
                </span>
                <span className="text-gray-500">/mo</span>
              </div>
              <ul className="mb-8 mt-8 space-y-4 text-gray-600 dark:text-gray-400">
                {[
                  'Logo on website & README',
                  'Monthly roadmap calls',
                  'Private Discord channel',
                  'Priority GitHub support',
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto">
                <a
                  href="#contact"
                  className="block w-full rounded-full bg-gray-100 py-3 text-center font-semibold text-gray-900 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
                >
                  Get Started
                </a>
              </div>
            </div>

            {/* Silver */}
            <div className="group relative flex flex-col rounded-3xl border-2 border-blue-500 bg-white p-8 shadow-2xl ring-4 ring-blue-500/10 dark:bg-gray-900">
              <div className="tracking-wide absolute -top-5 left-0 right-0 mx-auto w-fit rounded-full bg-blue-500 px-4 py-1 text-xs font-bold uppercase text-white">
                Sweet Spot
              </div>
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <Shield size={24} />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                Silver
              </h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-black text-gray-900 dark:text-white">
                  $2,500
                </span>
                <span className="text-gray-500">/mo</span>
              </div>
              <ul className="mb-8 mt-8 space-y-4 text-gray-600 dark:text-gray-400">
                {[
                  'Everything in Bronze',
                  'Prominent logo placement',
                  'Bi-weekly founder calls',
                  'Feature request priority',
                  'Integration support',
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto">
                <a
                  href="#contact"
                  className="block w-full rounded-full bg-blue-600 py-3 text-center font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  Become a Silver Sponsor
                </a>
              </div>
            </div>

            {/* Gold */}
            <div className="group relative flex flex-col rounded-3xl border border-gray-200 bg-white p-8 shadow-sm transition-all hover:scale-105 hover:shadow-xl dark:border-gray-800 dark:bg-gray-900">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400">
                <Zap size={24} />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                Gold
              </h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-black text-gray-900 dark:text-white">
                  $5,000+
                </span>
                <span className="text-gray-500">/mo</span>
              </div>
              <ul className="mb-8 mt-8 space-y-4 text-gray-600 dark:text-gray-400">
                {[
                  'Everything in Silver',
                  'Weekly direct access',
                  'Custom feature development',
                  'Migration consulting',
                  'Co-marketing',
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-500" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto">
                <a
                  href="#contact"
                  className="block w-full rounded-full bg-yellow-50 py-3 text-center font-semibold text-yellow-900 transition-colors hover:bg-yellow-100 dark:bg-yellow-500/20 dark:text-yellow-300 dark:hover:bg-yellow-500/30"
                >
                  Contact Us
                </a>
              </div>
            </div>
          </div>

          {/* Micro Sponsorship */}
          <div className="mt-12 rounded-2xl bg-gray-50 p-8 text-center dark:bg-gray-800/50">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Individual Developer?
            </h3>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              You can support the project with as little as $5/month on GitHub
              Sponsors.
            </p>
            <a
              href="https://github.com/sponsors/embedpdf"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-white dark:ring-gray-700 dark:hover:bg-gray-700"
            >
              <Heart className="h-4 w-4 text-red-500" /> Sponsor on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="bg-gray-50 py-20 dark:bg-black/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
              Questions I&apos;m Hearing
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                q: 'Why should I trust this will succeed?',
                a: 'Look at our track record: 2,000+ GitHub stars and a working Web SDK in just 8 months with zero funding. The project has real momentum.',
              },
              {
                q: 'What happens if you get acquired?',
                a: "The code is MIT licensed forever. The community owns the code. That's the beauty of open source—no single entity can take it away.",
              },
              {
                q: 'Why $30,000/month?',
                a: 'Transparency: This covers my salary as lead developer and hiring a senior mobile developer. Two experienced devs can output what 10 corporate devs can.',
              },
              {
                q: "What if we need features you haven't built?",
                a: "Gold sponsors get custom feature development. Silver sponsors influence the roadmap. Or hire your own devs to add it—it's open source!",
              },
              {
                q: 'ROI for my CFO?',
                a: "If you're paying $150K+/year now, sponsoring at $30K saves you $120K annually. Plus you eliminate vendor risk and gain code ownership.",
              },
              {
                q: 'Can we try it first?',
                a: 'Yes! The Web SDK is production ready. Try the live demo or browse the code on GitHub before you spend a dime.',
              },
            ].map((faq, i) => (
              <div
                key={i}
                className="rounded-2xl border border-gray-200 bg-white p-6 transition-all hover:border-purple-200 hover:shadow-lg dark:border-gray-800 dark:bg-gray-900 dark:hover:border-purple-900"
              >
                <h3 className="mb-3 text-lg font-bold text-gray-900 dark:text-white">
                  {faq.q}
                </h3>
                <p className="text-gray-600 dark:text-gray-400">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Contact */}
      <section className="py-20" id="contact">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-8 shadow-2xl dark:border-gray-800 dark:bg-gray-900 md:p-16">
            <div className="bg-grid-pattern absolute inset-0 opacity-[0.03]"></div>
            <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl"></div>

            <div className="relative z-10 text-center">
              <h2 className="mb-6 text-4xl font-black text-gray-900 dark:text-white md:text-5xl">
                Ready to Own Your PDF Tech?
              </h2>
              <p className="mx-auto mb-10 max-w-2xl text-xl text-gray-600 dark:text-gray-300">
                Let&apos;s have a real conversation about breaking free from
                vendor lock-in. I personally respond to every message.
              </p>

              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <a
                  href="mailto:bob.singor@embedpdf.com"
                  className="group relative inline-flex w-full items-center justify-center overflow-hidden rounded-full bg-gray-900 px-8 py-4 text-base font-medium text-white shadow-xl transition-all hover:scale-105 hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 sm:w-auto"
                >
                  <Mail className="mr-2 h-5 w-5" />
                  Email Bob
                </a>
                <a
                  href="https://cal.com/embedpdf/30min"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-full border-2 border-transparent bg-blue-600 px-8 py-4 text-base font-medium text-white transition-all hover:bg-blue-700 sm:w-auto"
                >
                  <Calendar className="mr-2 h-5 w-5" />
                  Book 30-min Call
                </a>
                <a
                  href="https://discord.gg/mHHABmmuVU"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-full border-2 border-gray-200 bg-transparent px-8 py-4 text-base font-medium text-gray-900 transition-all hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:text-white dark:hover:bg-gray-800 sm:w-auto"
                >
                  <MessageCircle className="mr-2 h-5 w-5" />
                  Join Discord
                </a>
              </div>

              <div className="mt-8 text-sm text-gray-500">
                Or find me on{' '}
                <a
                  href="https://twitter.com/bobsingor"
                  className="underline hover:text-blue-500"
                >
                  Twitter
                </a>{' '}
                and{' '}
                <a
                  href="https://linkedin.com/in/bobsingor"
                  className="underline hover:text-blue-500"
                >
                  LinkedIn
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default SponsorshipPage
