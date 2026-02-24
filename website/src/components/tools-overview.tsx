'use client'

import React from 'react'
import {
  ArrowRight,
  MergeIcon,
  EditIcon,
  FileText,
  Paperclip,
} from 'lucide-react'
import { Scribble3 } from './icons/scribble3'
import { PrivacyStatement } from './tools/shared/privacy-statement'
import Link from 'next/link'

const tools = [
  {
    title: 'PDF Merge Tool',
    description:
      'Combine multiple PDFs into a single document with custom page ordering',
    icon: <MergeIcon className="h-6 w-6 text-white" />,
    href: '/tools/pdf-merge',
    color: 'from-purple-600 to-blue-700',
  },
  {
    title: 'PDF Metadata Editor',
    description:
      'Edit PDF document properties, title, author, and other metadata fields',
    icon: <EditIcon className="h-6 w-6 text-white" />,
    href: '/tools/pdf-metadata-editor',
    color: 'from-purple-600 to-pink-700',
  },
  {
    title: 'PDF Outline Editor',
    description: 'Create and edit PDF bookmarks and navigation structure',
    icon: <FileText className="h-6 w-6 text-white" />,
    href: '/tools/pdf-outline-editor',
    color: 'from-teal-600 to-green-700',
  },
  {
    title: 'PDF Attachment Editor',
    description: 'Add, remove, and manage file attachments embedded in PDFs',
    icon: <Paperclip className="h-6 w-6 text-white" />,
    href: '/tools/pdf-attachment-editor',
    color: 'from-orange-600 to-amber-600',
  },
]

// Animated background component
const AnimatedBackground = () => {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="animate-blob absolute left-10 top-20 h-64 w-64 rounded-full bg-purple-500 opacity-10 mix-blend-multiply blur-3xl filter dark:opacity-20 dark:mix-blend-normal"></div>
      <div className="animate-blob animation-delay-2000 absolute right-10 top-40 h-72 w-72 rounded-full bg-blue-500 opacity-10 mix-blend-multiply blur-3xl filter dark:opacity-20 dark:mix-blend-normal"></div>
      <div className="animate-blob animation-delay-4000 absolute bottom-32 left-20 h-80 w-80 rounded-full bg-teal-500 opacity-10 mix-blend-multiply blur-3xl filter dark:opacity-20 dark:mix-blend-normal"></div>
      <div className="bg-grid-pattern opacity-3 absolute inset-0 dark:opacity-[0.03]"></div>
    </div>
  )
}

export default function ToolsOverview() {
  return (
    <div className="relative min-h-screen">
      <AnimatedBackground />

      <div className="pb-16 pt-20 sm:pt-24 lg:pt-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header Section */}
          <div className="mb-16 text-center">
            <div className="mb-6 inline-block rounded-full border border-blue-200 bg-blue-50 px-6 py-2 text-sm font-medium text-blue-800 dark:border-blue-800/30 dark:bg-blue-900/20 dark:text-blue-300">
              PDF Tools
            </div>
            <h1 className="mb-6 text-4xl font-black leading-tight tracking-tight text-gray-900 dark:text-white md:text-5xl">
              <span className="relative inline-block">
                <span className="relative z-10">Free browser-based tools</span>
                <div className="absolute bottom-1 left-0 right-0 -z-10 h-4 -rotate-1 transform text-[#bedbff] opacity-50 dark:text-blue-800">
                  <Scribble3 color="currentColor" />
                </div>
              </span>
              <span className="block bg-gradient-to-r from-blue-600 to-teal-500 bg-clip-text text-transparent">
                for your PDF documents
              </span>
            </h1>
            <div className="mx-auto max-w-4xl">
              <p className="mb-4 text-xl text-gray-600 dark:text-gray-400">
                Simple and powerful tools to help you work with PDF files
                directly in your browser
              </p>
              <PrivacyStatement className="mt-6" />
            </div>
          </div>

          {/* Tools Grid */}
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool, index) => (
              <div key={index} className="group relative">
                <div
                  className={`absolute -inset-0.5 bg-gradient-to-r ${tool.color} rounded-2xl opacity-10 blur transition duration-300 group-hover:opacity-30 dark:opacity-20 dark:group-hover:opacity-40`}
                ></div>
                <Link href={tool.href} className="relative block">
                  <div className="relative flex h-full flex-col overflow-hidden rounded-2xl bg-white p-6 shadow-md dark:border dark:border-gray-800 dark:bg-gray-900">
                    <div
                      className={`h-12 w-12 rounded-lg bg-gradient-to-br ${tool.color} mb-4 flex items-center justify-center text-2xl shadow-sm`}
                    >
                      {tool.icon}
                    </div>
                    <h3 className="mb-2 text-xl font-bold text-gray-900 transition-colors group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
                      {tool.title}
                    </h3>
                    <p className="mb-6 text-gray-600 dark:text-gray-400">
                      {tool.description}
                    </p>
                    <div className="mt-auto">
                      <div
                        className={`inline-flex items-center rounded-full bg-gradient-to-r px-4 py-2 ${tool.color} text-sm font-medium text-white transition-shadow hover:shadow-md`}
                      >
                        Try Tool
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
