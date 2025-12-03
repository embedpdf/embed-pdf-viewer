'use client'

import Link from 'next/link'
import { Menu, X, Github } from 'lucide-react'
import Logo from './logo'
import { useEffect, useState } from 'react'
import { MobileNav } from './sidebar'
import { setMenu, useMenu } from './stores/menu'
import { ThemeToggle } from './theme-toggle'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const menu = useMenu()

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Handle body scroll locking when mobile menu is open
  useEffect(() => {
    if (menu) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [menu])

  return (
    <>
      <header
        className={`nextra-navbar sticky top-0 z-20 w-full transition-all duration-300 ${
          scrolled && !menu
            ? 'bg-white/80 shadow-sm backdrop-blur-md dark:border-b dark:border-gray-800 dark:bg-gray-950/80'
            : 'border-b border-transparent bg-transparent'
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center">
              <div className="relative h-16 w-16">
                <Logo />
              </div>
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                EmbedPDF
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden items-center gap-1 md:flex">
              <Link
                href="/docs"
                className="group relative rounded-full px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
              >
                <span className="relative z-10">Documentation</span>
                <span className="absolute inset-0 scale-0 rounded-full bg-blue-50 transition-transform group-hover:scale-100 dark:bg-blue-500/10"></span>
              </Link>

              <Link
                href="/tools"
                className="group relative rounded-full px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:text-orange-600 dark:text-gray-400 dark:hover:text-orange-400"
              >
                <span className="relative z-10">Tools</span>
                <span className="absolute inset-0 scale-0 rounded-full bg-orange-50 transition-transform group-hover:scale-100 dark:bg-orange-500/10"></span>
              </Link>

              <Link
                href="/sponsorship"
                className="group relative rounded-full px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400"
              >
                <span className="relative z-10">Sponsorship</span>
                <span className="absolute inset-0 scale-0 rounded-full bg-purple-50 transition-transform group-hover:scale-100 dark:bg-purple-500/10"></span>
              </Link>

              <div className="ml-4 flex items-center gap-3 border-l border-gray-200 pl-4 dark:border-gray-800">
                <ThemeToggle />

                <a
                  href="https://github.com/embedpdf/embed-pdf-viewer"
                  className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-gray-900 px-4 py-2 text-white transition-transform hover:scale-105 dark:bg-white dark:text-gray-900"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Github className="h-4 w-4" />
                  <span className="text-sm font-bold">GitHub</span>
                </a>
              </div>
            </nav>

            {/* Mobile menu button */}
            <div className="flex items-center gap-4 md:hidden">
              <ThemeToggle />
              <button
                className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-900 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                onClick={() => setMenu(!menu)}
                aria-label="Toggle menu"
              >
                {menu ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {menu && (
          <div className="fixed inset-0 top-[4rem] z-50 md:hidden">
            <div
              className="absolute inset-0 bg-black/20 backdrop-blur-sm dark:bg-black/40"
              onClick={() => setMenu(false)}
            />

            <div className="absolute left-0 right-0 top-0 max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-gray-200 bg-white/95 p-4 shadow-xl backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/95">
              <div className="flex flex-col space-y-2">
                <Link
                  href="/docs"
                  className="flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-600 dark:text-gray-200 dark:hover:bg-blue-500/10 dark:hover:text-blue-400"
                  onClick={() => setMenu(false)}
                >
                  <div className="h-6 w-1 rounded-full bg-blue-500"></div>
                  Documentation
                </Link>

                {/* Mobile Sidebar content specific to docs route */}
                <div className="pl-4">
                  <MobileNav route="/docs" />
                </div>

                <Link
                  href="/tools"
                  className="flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-gray-700 hover:bg-orange-50 hover:text-orange-600 dark:text-gray-200 dark:hover:bg-orange-500/10 dark:hover:text-orange-400"
                  onClick={() => setMenu(false)}
                >
                  <div className="h-6 w-1 rounded-full bg-orange-500"></div>
                  Tools
                </Link>

                <Link
                  href="/sponsorship"
                  className="flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-gray-700 hover:bg-purple-50 hover:text-purple-600 dark:text-gray-200 dark:hover:bg-purple-500/10 dark:hover:text-purple-400"
                  onClick={() => setMenu(false)}
                >
                  <div className="h-6 w-1 rounded-full bg-purple-500"></div>
                  Sponsorship
                </Link>

                <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-800">
                  <a
                    href="https://github.com/embedpdf/embed-pdf-viewer"
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-3 text-white dark:bg-white dark:text-gray-900"
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setMenu(false)}
                  >
                    <Github className="h-5 w-5" />
                    <span className="font-semibold">Star on GitHub</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  )
}
