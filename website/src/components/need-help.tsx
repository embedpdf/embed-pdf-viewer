import React from 'react'
import { Github, Heart } from 'lucide-react'
import Link from 'next/link'
import DiscordIcon from './icons/discord'

export const NeedHelp: React.FC = () => {
  return (
    <div className="relative mb-16 overflow-hidden rounded-2xl border border-gray-100 bg-white p-8 shadow-lg dark:border-gray-800 dark:bg-gray-900">
      {/* Decorative background blob - increased opacity for dark mode */}
      <div className="absolute right-0 top-0 h-64 w-64 -translate-y-1/3 translate-x-1/3 transform rounded-full bg-gradient-to-br from-blue-500/10 to-purple-500/10 dark:from-blue-500/20 dark:to-purple-500/20"></div>

      <div className="relative flex flex-col gap-8 md:flex-row md:items-center">
        <div className="md:flex-1">
          <h2 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">
            Need Help?
          </h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">
            Join our community for support, discussions, and to contribute to
            EmbedPDF&apos;s development.
          </p>
          <div className="flex flex-wrap gap-4">
            <a
              href="https://github.com/embedpdf/embed-pdf-viewer/issues"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-2 rounded-full bg-gray-900 px-5 py-2 font-medium text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            >
              <Github className="h-4 w-4" />
              <span>GitHub Discussions</span>
            </a>
            <a
              href="https://discord.gg/mHHABmmuVU"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-2 rounded-full bg-indigo-600 px-5 py-2 font-medium text-white transition-colors hover:bg-indigo-700 dark:hover:bg-indigo-500"
            >
              <DiscordIcon size={22} strokeColor="white" />
              <span>Discord Community</span>
            </a>
            <Link
              href="/sponsorship"
              className="inline-flex items-center space-x-2 rounded-full bg-purple-600 px-5 py-2 font-medium text-white transition-colors hover:bg-purple-700 dark:hover:bg-purple-500"
            >
              <Heart className="h-4 w-4" />
              <span>Support Development</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default NeedHelp
