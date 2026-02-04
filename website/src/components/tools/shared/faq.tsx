'use client'

import React, { useState } from 'react'
import { ChevronDown } from 'lucide-react'

export interface FAQItem {
  id: string
  question: string
  answer: string | React.ReactNode
  category?: string
}

interface FAQProps {
  items: FAQItem[]
  title?: string
  subtitle?: string
  className?: string
  gradientColor?: string
  showSearch?: boolean
  showCategories?: boolean
  categories?: string[]
}

export const FAQ = ({
  items,
  title = 'Frequently Asked Questions',
  subtitle = 'Find answers to common questions about our PDF tools',
  className = '',
  gradientColor = 'from-blue-600 to-teal-500',
  showSearch = false,
  showCategories = false,
  categories = [],
}: FAQProps) => {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  const toggleItem = (id: string) => {
    const newOpenItems = new Set(openItems)
    if (newOpenItems.has(id)) {
      newOpenItems.delete(id)
    } else {
      newOpenItems.add(id)
    }
    setOpenItems(newOpenItems)
  }

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      searchTerm === '' ||
      item.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (typeof item.answer === 'string' &&
        item.answer.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesCategory =
      selectedCategory === 'all' ||
      item.category === selectedCategory ||
      !item.category

    return matchesSearch && matchesCategory
  })

  return (
    <div className={`w-full ${className}`}>
      {/* FAQ Section Container with distinct styling */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-slate-50 to-gray-100 shadow-lg dark:border-gray-800 dark:from-gray-900 dark:to-gray-800">
        {/* Decorative background pattern */}
        <div className="absolute inset-0 opacity-5 dark:opacity-[0.02]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          ></div>
        </div>

        <div className="relative px-6 py-12 sm:px-8 lg:px-12">
          {/* Header with enhanced styling */}
          <div className="mb-10 text-center">
            <div className="mb-4 flex items-center justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-slate-600 to-gray-700 dark:from-slate-700 dark:to-gray-800">
                <svg
                  className="h-6 w-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            </div>
            <h2 className="mb-4 text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
              {title}
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-gray-600 dark:text-gray-400">
              {subtitle}
            </p>
          </div>

          {/* Search and Filters with updated styling */}
          {(showSearch || categories.length > 0) && (
            <div className="mb-10 space-y-4">
              {showSearch && (
                <div className="mx-auto max-w-md">
                  <input
                    type="text"
                    placeholder="Search questions..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 shadow-sm focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 dark:focus:border-gray-400"
                  />
                </div>
              )}

              {showCategories && categories.length > 0 && (
                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className={`rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-200 ${
                      selectedCategory === 'all'
                        ? `bg-gradient-to-r ${gradientColor} text-white shadow-lg`
                        : 'border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                  >
                    All
                  </button>
                  {categories.map((category) => (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={`rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-200 ${
                        selectedCategory === category
                          ? `bg-gradient-to-r ${gradientColor} text-white shadow-lg`
                          : 'border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* FAQ Items with enhanced styling */}
          <div className="space-y-3">
            {filteredItems.length === 0 ? (
              <div className="py-12 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-800">
                  <svg
                    className="h-8 w-8 text-gray-400 dark:text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.467-.881-6.08-2.33m0 0l-.431.431a2 2 0 01-2.828-2.828L3.1 10.1a2 2 0 012.828 0L7.051 11.2M9 12l2 2 4-4M6 12V9a6 6 0 1112 0v3"
                    />
                  </svg>
                </div>
                <p className="text-lg text-gray-500 dark:text-gray-400">
                  No questions found matching your criteria.
                </p>
              </div>
            ) : (
              filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600"
                >
                  <button
                    onClick={() => toggleItem(item.id)}
                    className="flex w-full items-center justify-between p-6 text-left transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-700/50"
                    aria-expanded={openItems.has(item.id)}
                    aria-controls={`faq-answer-${item.id}`}
                  >
                    <h3 className="pr-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {item.question}
                    </h3>
                    <div className="flex-shrink-0">
                      <div
                        className={`transition-transform duration-200 ${openItems.has(item.id) ? 'rotate-180' : ''}`}
                      >
                        <ChevronDown className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                      </div>
                    </div>
                  </button>

                  {openItems.has(item.id) && (
                    <div
                      id={`faq-answer-${item.id}`}
                      className="border-t border-gray-100 bg-gray-50/30 px-6 pb-6 pt-4 dark:border-gray-700 dark:bg-gray-900/30"
                    >
                      <div className="prose prose-gray max-w-none text-gray-700 dark:text-gray-300">
                        {typeof item.answer === 'string' ? (
                          <p>{item.answer}</p>
                        ) : (
                          item.answer
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer Note with enhanced styling */}
          <div className="mt-10 text-center">
            <div className="mx-auto max-w-md rounded-xl border border-gray-200 bg-white/60 px-6 py-4 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/60">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Can&apos;t find what you&apos;re looking for?{' '}
                <a
                  href="https://github.com/embedpdf/embed-pdf-viewer/discussions"
                  target="_blank"
                  rel="noreferrer"
                  className={`bg-gradient-to-r font-semibold ${gradientColor} bg-clip-text text-transparent transition-all duration-200 hover:underline`}
                >
                  Ask on GitHub Discussions
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
