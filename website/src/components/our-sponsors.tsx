'use client'
import React from 'react'
import {
  Heart,
  Star,
  Shield,
  Zap,
  ArrowRight,
  Plus,
  ExternalLink,
} from 'lucide-react'
import Link from 'next/link'

// Define interfaces for Sponsor data
interface Sponsor {
  name: string
  logo: string
  url: string
  description?: string
}

// Data for sponsors - easily adjustable
const goldSponsors: Sponsor[] = []

const silverSponsors: Sponsor[] = [
  {
    name: 'With Love Internet',
    logo: '/sponsors/sponsor-wli.png',
    url: 'https://www.withloveinternet.com?utm_source=embedpdf&utm_campaign=oss',
    description: 'The digital agency for growth-oriented companies.',
  },
]

const bronzeSponsors: Sponsor[] = [
  {
    name: 'Accrual',
    logo: '/sponsors/sponsor-accrual.jpg',
    url: 'https://www.accrual.com?utm_source=embedpdf&utm_campaign=oss',
  },
  {
    name: 'Lefebvre',
    logo: '/sponsors/sponsor-lefebvre.png',
    url: 'https://www.lefebvre-group.com?utm_source=embedpdf&utm_campaign=oss',
  },
  {
    name: 'forml',
    logo: '/sponsors/sponsor-forml.png',
    url: 'https://forml.eu?utm_source=embedpdf&utm_campaign=oss',
  },
]

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

const OurSponsors = () => {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <AnimatedBackground />

      {/* Inline styles for animations */}
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

      <div className="pb-16 pt-20 sm:pt-24 lg:pt-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h1 className="mb-6 text-4xl font-black text-gray-900 dark:text-white md:text-6xl">
              Our Sponsors
            </h1>
            <p className="mx-auto max-w-2xl text-xl text-gray-600 dark:text-gray-300">
              We are incredibly grateful to the companies and individuals who
              support EmbedPDF. You make this project happen!
            </p>

            {/* GitHub Sponsors Link + CTA */}
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a
                href="https://github.com/sponsors/embedpdf"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-pink-600 px-6 py-3 text-white shadow-lg transition-all hover:scale-105 hover:bg-pink-700"
              >
                <Heart className="h-5 w-5 fill-current" />
                Support on GitHub
              </a>
              <Link
                href="/sponsorship"
                className="inline-flex items-center gap-2 rounded-full border-2 border-gray-200 bg-white px-6 py-3 text-gray-900 shadow-md transition-all hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:hover:bg-gray-800"
              >
                Become a Sponsor <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </div>

          {/* Gold Sponsors */}
          <div className="mb-20">
            <div className="mb-8 flex items-center justify-center gap-3">
              <div className="rounded-lg bg-yellow-100 p-2 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400">
                <Zap size={24} />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                Gold Sponsors
              </h2>
            </div>

            <div className="flex flex-wrap justify-center gap-8">
              {goldSponsors.map((sponsor, idx) => (
                <div
                  key={idx}
                  className="group relative flex w-full max-w-sm flex-col items-center rounded-3xl border border-gray-200 bg-white p-8 text-center transition-all hover:border-yellow-200 hover:shadow-xl dark:border-gray-800 dark:bg-gray-900 dark:hover:border-yellow-800"
                >
                  <div className="mb-6 flex h-24 w-full items-center justify-center">
                    <img
                      src={sponsor.logo}
                      alt={sponsor.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-gray-900 dark:text-white">
                    {sponsor.name}
                  </h3>
                  {sponsor.description && (
                    <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                      {sponsor.description}
                    </p>
                  )}
                  <a
                    href={sponsor.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-yellow-600 transition-colors hover:text-yellow-700 dark:text-yellow-500 dark:hover:text-yellow-400"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Visit Website
                  </a>
                </div>
              ))}

              <Link
                href="/sponsorship"
                className="group relative flex w-full max-w-sm flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-gray-300 bg-gradient-to-br from-gray-50 to-white p-8 text-center transition-all hover:border-yellow-400 hover:shadow-xl dark:border-gray-700 dark:from-gray-900 dark:to-gray-800 dark:hover:border-yellow-500/50"
              >
                <div className="mb-4 rounded-full bg-yellow-50 p-4 transition-transform group-hover:scale-110 dark:bg-yellow-900/20">
                  <Plus className="h-8 w-8 text-yellow-500" />
                </div>
                <h3 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">
                  Become a Gold Sponsor
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  High visibility & direct team access
                </p>
              </Link>
            </div>
          </div>

          {/* Silver Sponsors */}
          <div className="mb-20">
            <div className="mb-8 flex items-center justify-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <Shield size={24} />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                Silver Sponsors
              </h2>
            </div>

            <div className="mx-auto flex max-w-5xl flex-wrap justify-center gap-6">
              {silverSponsors.map((sponsor, idx) => (
                <div
                  key={idx}
                  className="group relative flex w-full max-w-sm flex-col items-center rounded-2xl border border-gray-200 bg-white p-8 text-center transition-all hover:border-blue-200 hover:shadow-xl dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-800"
                >
                  <div className="mb-6 flex h-20 w-full items-center justify-center">
                    <img
                      src={sponsor.logo}
                      alt={sponsor.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-gray-900 dark:text-white">
                    {sponsor.name}
                  </h3>
                  {sponsor.description && (
                    <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                      {sponsor.description}
                    </p>
                  )}
                  <a
                    href={sponsor.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-500 dark:hover:text-blue-400"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Visit Website
                  </a>
                </div>
              ))}

              {/* Silver Placeholder */}
              <Link
                href="/sponsorship"
                className="group flex w-full max-w-sm flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-8 text-center transition-all hover:border-blue-300 hover:bg-blue-50/30 dark:border-gray-800 dark:bg-gray-900/50 dark:hover:border-blue-700 dark:hover:bg-blue-900/20"
              >
                <div className="mb-3 rounded-full bg-blue-50 p-3 transition-transform group-hover:scale-110 dark:bg-blue-900/20">
                  <Plus className="h-6 w-6 text-blue-500" />
                </div>
                <span className="font-medium text-gray-900 dark:text-white">
                  Your Logo Here
                </span>
                <span className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Join Silver Tier
                </span>
              </Link>
            </div>
          </div>

          {/* Bronze Sponsors */}
          <div className="mb-20">
            <div className="mb-8 flex items-center justify-center gap-3">
              <div className="rounded-lg bg-orange-100 p-2 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                <Star size={24} />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                Bronze Sponsors
              </h2>
            </div>

            <div className="flex flex-wrap justify-center gap-6">
              {bronzeSponsors.map((sponsor, idx) => (
                <a
                  key={idx}
                  href={sponsor.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex h-32 w-64 items-center justify-center rounded-2xl border border-gray-200 bg-white p-6 transition-all hover:border-orange-200 hover:shadow-lg dark:border-gray-800 dark:bg-gray-900 dark:hover:border-orange-800"
                >
                  <img
                    src={sponsor.logo}
                    alt={sponsor.name}
                    className="max-h-full max-w-full object-contain"
                  />
                </a>
              ))}

              {/* Bronze Placeholder */}
              <Link
                href="/sponsorship"
                className="group flex h-32 w-64 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-6 transition-all hover:border-orange-300 hover:bg-orange-50/30 dark:border-gray-800 dark:bg-gray-900/50 dark:hover:border-orange-700 dark:hover:bg-orange-900/20"
              >
                <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                  <Plus className="h-4 w-4 text-orange-500" />
                  <span>Join Bronze Tier</span>
                </div>
              </Link>
            </div>
          </div>

          {/* Final CTA */}
          <div className="mt-30 mb-12">
            <div className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-2xl dark:border-gray-800 dark:bg-gray-900 md:p-16">
              {/* Background Gradients */}
              <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-pink-500/10 blur-3xl"></div>
              <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl"></div>

              <div className="relative z-10 flex flex-col items-center">
                <div className="mb-6 rounded-full bg-pink-100 p-4 dark:bg-pink-900/30">
                  <Heart className="h-10 w-10 fill-pink-600/20 text-pink-600 dark:text-pink-400" />
                </div>
                <h2 className="mb-4 text-3xl font-black text-gray-900 dark:text-white md:text-4xl">
                  Help make EmbedPDF better
                </h2>
                <p className="mb-8 max-w-2xl text-lg text-gray-600 dark:text-gray-300">
                  Your support directly funds development time, server costs,
                  and the future roadmap. Join the community that makes this
                  project possible.
                </p>
                <Link
                  href="/sponsorship"
                  className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-8 py-4 text-base font-medium text-white shadow-xl transition-all hover:scale-105 hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                >
                  <Heart className="h-5 w-5 fill-current text-pink-500" />
                  Become a Sponsor
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OurSponsors
