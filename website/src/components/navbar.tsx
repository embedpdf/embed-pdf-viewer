'use client'

import Link from 'next/link'
import { Menu, X, Github, ChevronDown, Heart, Users } from 'lucide-react'
import Logo from './logo'
import { useEffect, useState, Fragment } from 'react'
import { MobileNav } from './sidebar'
import { setMenu, useMenu } from './stores/menu'
import { ThemeToggle } from './theme-toggle'
import { Search } from './search'
import {
  Popover,
  PopoverButton,
  PopoverPanel,
  Transition,
} from '@headlessui/react'

// --- Configuration ---

type NavColor = 'blue' | 'orange' | 'purple'

interface DropdownItem {
  label: string
  href: string
  description: string
  Icon: React.ElementType
}

interface NavItem {
  label: string
  href?: string // Optional if it has a dropdown
  color: NavColor
  hasSidebar?: boolean // For mobile sidebar injection
  dropdown?: DropdownItem[]
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Documentation',
    href: '/docs',
    color: 'blue',
    hasSidebar: true,
  },
  {
    label: 'Tools',
    href: '/tools',
    color: 'orange',
  },
  {
    label: 'Sponsorship',
    color: 'purple',
    dropdown: [
      {
        label: 'Our Sponsors',
        href: '/sponsors',
        description: 'Meet the backers',
        Icon: Users,
      },
      {
        label: 'Become a Sponsor',
        href: '/sponsorship',
        description: 'Support the project',
        Icon: Heart,
      },
    ],
  },
]

// Helper for color styles
const getNavStyles = (color: NavColor) => {
  switch (color) {
    case 'blue':
      return {
        desktopTextHover: 'hover:text-blue-600 dark:hover:text-blue-400',
        desktopBgHover: 'bg-blue-50 dark:bg-blue-500/10',
        mobilePill: 'bg-blue-500',
        mobileItemHover:
          'hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/10 dark:hover:text-blue-400',
      }
    case 'orange':
      return {
        desktopTextHover: 'hover:text-orange-600 dark:hover:text-orange-400',
        desktopBgHover: 'bg-orange-50 dark:bg-orange-500/10',
        mobilePill: 'bg-orange-500',
        mobileItemHover:
          'hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-500/10 dark:hover:text-orange-400',
      }
    case 'purple':
      return {
        desktopTextHover: 'hover:text-purple-600 dark:hover:text-purple-400',
        desktopBgHover: 'bg-purple-50 dark:bg-purple-500/10',
        desktopTextActive: 'text-purple-600 dark:text-purple-400', // For dropdown trigger state
        mobilePill: 'bg-purple-500',
        mobileItemHover:
          'hover:bg-purple-50 hover:text-purple-600 dark:hover:bg-purple-500/10 dark:hover:text-purple-400',
        dropdownIcon: 'text-purple-600 dark:text-purple-400',
        dropdownItemHover: 'hover:bg-purple-50 dark:hover:bg-purple-900/20',
      }
  }
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const menu = useMenu()

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10)
    }

    // Check initial scroll position on mount
    handleScroll()

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
          scrolled || menu
            ? 'bg-white/95 shadow-sm backdrop-blur-md dark:border-b dark:border-gray-800 dark:bg-gray-950/95'
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
              {NAV_ITEMS.map((item) => {
                const styles = getNavStyles(item.color)

                if (item.dropdown) {
                  return (
                    <Popover key={item.label} className="relative">
                      {({ open }) => (
                        <>
                          <PopoverButton
                            className={`group relative flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium outline-none transition-colors ${
                              open
                                ? styles.desktopTextActive
                                : `text-gray-600 dark:text-gray-400 ${styles.desktopTextHover}`
                            }`}
                          >
                            <span
                              className={`absolute inset-0 scale-0 rounded-full transition-transform ${styles.desktopBgHover} ${
                                open ? 'scale-100' : 'group-hover:scale-100'
                              }`}
                            ></span>
                            <span className="relative z-10">{item.label}</span>
                            <ChevronDown
                              className={`relative z-10 h-3 w-3 transition-transform duration-200 ${
                                open ? 'rotate-180' : ''
                              }`}
                            />
                          </PopoverButton>

                          <Transition
                            as={Fragment}
                            enter="transition ease-out duration-200"
                            enterFrom="opacity-0 translate-y-1"
                            enterTo="opacity-100 translate-y-0"
                            leave="transition ease-in duration-150"
                            leaveFrom="opacity-100 translate-y-0"
                            leaveTo="opacity-0 translate-y-1"
                          >
                            <PopoverPanel className="absolute left-1/2 z-30 mt-3 w-60 -translate-x-1/2 transform px-4 sm:px-0">
                              <div className="overflow-hidden rounded-xl shadow-lg ring-1 ring-black/5 dark:ring-white/10">
                                <div className="relative grid gap-1 bg-white p-2 dark:bg-gray-900">
                                  {item.dropdown?.map((subItem) => (
                                    <Link
                                      key={subItem.href}
                                      href={subItem.href}
                                      className={`flex items-start gap-3 rounded-lg p-3 transition duration-150 ease-in-out ${styles.dropdownItemHover}`}
                                    >
                                      <subItem.Icon
                                        className={`mt-0.5 h-5 w-5 ${styles.dropdownIcon}`}
                                      />
                                      <div className="ml-0">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                                          {subItem.label}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                          {subItem.description}
                                        </p>
                                      </div>
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            </PopoverPanel>
                          </Transition>
                        </>
                      )}
                    </Popover>
                  )
                }

                return (
                  <Link
                    key={item.label}
                    href={item.href!}
                    className={`group relative rounded-full px-4 py-2 text-sm font-medium text-gray-600 transition-colors dark:text-gray-400 ${styles.desktopTextHover}`}
                  >
                    <span className="relative z-10">{item.label}</span>
                    <span
                      className={`absolute inset-0 scale-0 rounded-full transition-transform group-hover:scale-100 ${styles.desktopBgHover}`}
                    ></span>
                  </Link>
                )
              })}

              <div className="ml-4 flex items-center gap-3 border-l border-gray-200 pl-4 dark:border-gray-800">
                <Search />
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
            <div className="flex items-center gap-3 md:hidden">
              <Search />
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
                {NAV_ITEMS.map((item) => {
                  const styles = getNavStyles(item.color)

                  if (item.dropdown) {
                    return (
                      <div
                        key={item.label}
                        className="mt-2 border-t border-gray-100 pt-2 dark:border-gray-800"
                      >
                        <div className="px-4 py-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                          {item.label}
                        </div>
                        {item.dropdown.map((subItem) => (
                          <Link
                            key={subItem.href}
                            href={subItem.href}
                            className={`flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-gray-700 dark:text-gray-200 ${styles.mobileItemHover}`}
                            onClick={() => setMenu(false)}
                          >
                            <div
                              className={`h-6 w-1 rounded-full ${styles.mobilePill}`}
                            ></div>
                            {subItem.label}
                          </Link>
                        ))}
                      </div>
                    )
                  }

                  return (
                    <Fragment key={item.label}>
                      <Link
                        href={item.href!}
                        className={`flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-gray-700 dark:text-gray-200 ${styles.mobileItemHover}`}
                        onClick={() => setMenu(false)}
                      >
                        <div
                          className={`h-6 w-1 rounded-full ${styles.mobilePill}`}
                        ></div>
                        {item.label}
                      </Link>

                      {/* Inject Mobile Sidebar if configured */}
                      {item.hasSidebar && (
                        <div className="pl-4">
                          <MobileNav route={item.href!} />
                        </div>
                      )}
                    </Fragment>
                  )
                })}

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
