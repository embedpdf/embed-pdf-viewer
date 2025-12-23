'use client'
import Link from 'next/link'
import { Github, Heart } from 'lucide-react'
import Logo from './logo'
import DiscordIcon from './icons/discord'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="relative bg-gray-50 text-gray-600 transition-colors duration-300 dark:bg-gray-950 dark:text-gray-400">
      {/* Decorative gradient line */}
      <div className="h-1 w-full bg-gradient-to-r from-purple-600 via-blue-500 to-orange-400"></div>

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand Section */}
          <div className="lg:col-span-1">
            <Link href="/" className="flex items-center gap-2">
              <div className="relative h-10 w-10">
                <Logo />
              </div>
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                EmbedPDF
              </span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              The open-source PDF viewer for modern web applications. Fast,
              customizable, and framework-agnostic.
            </p>
            <div className="mt-6 flex space-x-4">
              <a
                href="https://github.com/embedpdf/embed-pdf-viewer"
                target="_blank"
                rel="noreferrer"
                className="group rounded-lg border border-gray-200 bg-white p-2 text-gray-500 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                aria-label="GitHub"
              >
                <Github className="h-5 w-5" />
              </a>
              <a
                href="https://discord.gg/mHHABmmuVU"
                target="_blank"
                rel="noreferrer"
                className="group rounded-lg border border-gray-200 bg-white p-2 text-gray-500 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400"
                aria-label="Discord"
              >
                {/* Using current color to inherit text color from parent for hover states */}
                <DiscordIcon
                  size={20}
                  strokeColor="currentColor"
                  className="transition-colors"
                />
              </a>
            </div>
          </div>

          {/* Frameworks Section */}
          <div>
            <h3 className="tracking-wider mb-4 text-sm font-bold uppercase text-gray-900 dark:text-white">
              Frameworks
            </h3>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/react-pdf-viewer"
                  className="group inline-flex items-center text-sm transition-colors hover:text-purple-600 dark:hover:text-purple-400"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-500 transition-transform group-hover:scale-150"></span>
                  <span className="ml-2">React PDF Viewer</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/vue-pdf-viewer"
                  className="group inline-flex items-center text-sm transition-colors hover:text-green-600 dark:hover:text-green-400"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 transition-transform group-hover:scale-150"></span>
                  <span className="ml-2">Vue PDF Viewer</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/svelte-pdf-viewer"
                  className="group inline-flex items-center text-sm transition-colors hover:text-orange-600 dark:hover:text-orange-400"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-500 transition-transform group-hover:scale-150"></span>
                  <span className="ml-2">Svelte PDF Viewer</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources Section */}
          <div>
            <h3 className="tracking-wider mb-4 text-sm font-bold uppercase text-gray-900 dark:text-white">
              Resources
            </h3>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/docs"
                  className="group inline-flex items-center text-sm transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500 transition-transform group-hover:scale-150"></span>
                  <span className="ml-2">Documentation</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/tools"
                  className="group inline-flex items-center text-sm transition-colors hover:text-orange-600 dark:hover:text-orange-400"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-400 transition-transform group-hover:scale-150"></span>
                  <span className="ml-2">Tools</span>
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/embedpdf/embed-pdf-viewer"
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex items-center text-sm transition-colors hover:text-gray-900 dark:hover:text-white"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-500 transition-transform group-hover:scale-150"></span>
                  <span className="ml-2">GitHub Repository</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Community Section */}
          <div>
            <h3 className="tracking-wider mb-4 text-sm font-bold uppercase text-gray-900 dark:text-white">
              Community
            </h3>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/sponsorship"
                  className="group inline-flex items-center text-sm transition-colors hover:text-pink-600 dark:hover:text-pink-400"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-pink-500 transition-transform group-hover:scale-150"></span>
                  <span className="ml-2">Sponsorship</span>
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/embedpdf/embed-pdf-viewer/issues"
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex items-center text-sm transition-colors hover:text-red-600 dark:hover:text-red-400"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 transition-transform group-hover:scale-150"></span>
                  <span className="ml-2">Report Issues</span>
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/embedpdf/embed-pdf-viewer/discussions"
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex items-center text-sm transition-colors hover:text-yellow-600 dark:hover:text-yellow-400"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 transition-transform group-hover:scale-150"></span>
                  <span className="ml-2">Discussions</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 border-t border-gray-200 pt-8 dark:border-gray-800">
          <div className="flex flex-col items-center justify-between space-y-4 md:flex-row md:space-y-0">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              © {currentYear} EmbedPDF. Released under the MIT License.
            </p>
            <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
              <span>Made with</span>
              <Heart className="h-4 w-4 fill-red-500 text-red-500" />
              <span>by the open-source community</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
