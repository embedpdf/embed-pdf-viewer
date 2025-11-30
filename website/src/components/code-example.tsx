'use client'

import React, { useState, useRef, useEffect } from 'react'
import {
  Code,
  Github,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react'
import { ReactIcon, VueIcon, SvelteIcon } from './framework-icons'

interface CodeFile {
  filename: string
  code: string
  language: string
  githubUrl?: string
  highlightedCode?: string
}

interface CodeExampleProps {
  children: React.ReactNode
  files?: CodeFile[]
  /** Add a border frame around the demo content */
  framed?: boolean
  /** Background variant for the preview area */
  background?: 'grid' | 'dots' | 'gradient' | 'solid' | 'none'
  // Legacy single-file props (for backward compatibility)
  code?: string
  language?: string
  highlightedCode?: string
  githubUrl?: string
}

export const CodeExample = ({
  children,
  files = [],
  framed = false,
  background = 'dots',
  // Legacy props
  code,
  language = 'tsx',
  highlightedCode,
  githubUrl: legacyGithubUrl,
}: CodeExampleProps) => {
  const [showCode, setShowCode] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const [copied, setCopied] = useState(false)
  const [showGithubMenu, setShowGithubMenu] = useState(false)
  const githubMenuRef = useRef<HTMLDivElement>(null)

  // Handle legacy single-file format
  const allFiles: CodeFile[] =
    files.length > 0
      ? files
      : code
        ? [
            {
              filename: 'Example.tsx',
              code,
              language,
              highlightedCode,
              githubUrl: legacyGithubUrl,
            },
          ]
        : []

  const activeFile = allFiles[activeTab]
  const hasMultipleFiles = allFiles.length > 1

  const totalLines = allFiles.reduce(
    (sum, f) => sum + f.code.trim().split('\n').length,
    0,
  )

  // Get files with GitHub URLs
  const filesWithGithub = allFiles.filter((f) => f.githubUrl)
  const hasGithubUrls = filesWithGithub.length > 0

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        githubMenuRef.current &&
        !githubMenuRef.current.contains(event.target as Node)
      ) {
        setShowGithubMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const copyToClipboard = async () => {
    if (!activeFile) return
    await navigator.clipboard.writeText(activeFile.code.trim())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const backgroundStyles = {
    grid: 'bg-[linear-gradient(to_right,#8881_1px,transparent_1px),linear-gradient(to_bottom,#8881_1px,transparent_1px)] bg-[size:14px_14px] bg-gray-50 dark:bg-gray-900',
    dots: 'bg-[radial-gradient(#d1d5db_1px,transparent_1px)] dark:bg-[radial-gradient(#374151_1px,transparent_1px)] bg-[size:16px_16px] bg-white dark:bg-gray-950',
    gradient:
      'bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900',
    solid: 'bg-gray-100 dark:bg-gray-900',
    none: 'bg-white dark:bg-gray-950',
  }

  return (
    <div className="not-prose my-8 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
      {/* Live Preview - overflow-hidden here for rounded corners */}
      <div
        className={`relative overflow-hidden rounded-t-xl p-4 sm:p-8 ${backgroundStyles[background]}`}
      >
        {/* Demo content wrapper */}
        <div
          className={`relative w-full ${framed ? 'overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-950' : ''} `}
        >
          {children}
        </div>
      </div>

      {/* Toolbar - overflow-visible to allow dropdown to escape */}
      <div
        className={`relative flex items-center justify-between overflow-visible border-t border-gray-200 bg-gray-50/80 px-4 py-2 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/80 ${!showCode ? 'rounded-b-xl' : ''}`}
      >
        <button
          onClick={() => setShowCode(!showCode)}
          className="-ml-2.5 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-200/60 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700/60 dark:hover:text-gray-100"
        >
          <Code size={14} />
          <span>{showCode ? 'Hide Code' : 'View Code'}</span>
          {showCode ? (
            <ChevronUp size={14} className="ml-0.5" />
          ) : (
            <ChevronDown size={14} className="ml-0.5" />
          )}
          {!showCode && (
            <span className="ml-1.5 hidden text-gray-400 sm:inline dark:text-gray-500">
              {totalLines} lines
              {hasMultipleFiles && ` · ${allFiles.length} files`}
            </span>
          )}
        </button>

        <div className="flex items-center gap-0.5">
          {/* Copy button - only when code is shown */}
          {showCode && (
            <button
              onClick={copyToClipboard}
              className="inline-flex items-center gap-1.5 rounded-md p-2 text-[13px] font-medium text-gray-500 transition-colors hover:bg-gray-200/60 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700/60 dark:hover:text-gray-100"
              title="Copy code"
            >
              {copied ? (
                <Check size={15} className="text-green-500" />
              ) : (
                <Copy size={15} />
              )}
            </button>
          )}

          {/* GitHub button/dropdown */}
          {hasGithubUrls && (
            <div className="relative" ref={githubMenuRef}>
              {filesWithGithub.length === 1 ? (
                // Single file with GitHub - direct link
                <a
                  href={filesWithGithub[0].githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md p-2 text-[13px] font-medium text-gray-500 transition-colors hover:bg-gray-200/60 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700/60 dark:hover:text-gray-100"
                  title="View on GitHub"
                >
                  <Github size={15} />
                  <ExternalLink size={11} className="opacity-50" />
                </a>
              ) : (
                // Multiple files - dropdown
                <>
                  <button
                    onClick={() => setShowGithubMenu(!showGithubMenu)}
                    className={`inline-flex items-center gap-1 rounded-md p-2 text-[13px] font-medium transition-colors ${
                      showGithubMenu
                        ? 'bg-gray-200/60 text-gray-900 dark:bg-gray-700/60 dark:text-gray-100'
                        : 'text-gray-500 hover:bg-gray-200/60 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700/60 dark:hover:text-gray-100'
                    }`}
                    title="View on GitHub"
                  >
                    <Github size={15} />
                    <ChevronDown
                      size={12}
                      className={`transition-transform ${showGithubMenu ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {/* Dropdown menu */}
                  {showGithubMenu && (
                    <div className="absolute right-0 top-full z-50 mt-1 min-w-[220px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                      <div className="border-b border-gray-100 px-3 py-2 dark:border-gray-800">
                        <span className="tracking-wider text-[11px] font-medium uppercase text-gray-400 dark:text-gray-500">
                          View on GitHub
                        </span>
                      </div>
                      {filesWithGithub.map((file) => (
                        <a
                          key={file.filename}
                          href={file.githubUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                          onClick={() => setShowGithubMenu(false)}
                        >
                          {getFrameworkIcon(file.language) || (
                            <FileIcon language={file.language} />
                          )}
                          <span className="flex-1 truncate">
                            {file.filename}
                          </span>
                          <ExternalLink
                            size={12}
                            className="flex-shrink-0 text-gray-400"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Code Panel */}
      {showCode && activeFile && (
        <div className="animate-in fade-in slide-in-from-top-1 border-t border-gray-200 duration-200 dark:border-gray-800">
          {/* File Tabs */}
          {hasMultipleFiles && (
            <div className="flex overflow-x-auto border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
              {allFiles.map((file, index) => (
                <button
                  key={file.filename}
                  onClick={() => setActiveTab(index)}
                  className={`relative whitespace-nowrap px-4 py-2.5 text-[13px] font-medium transition-colors ${
                    activeTab === index
                      ? 'bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-300'
                  } `}
                >
                  {activeTab === index && (
                    <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-blue-500" />
                  )}
                  <span className="flex items-center gap-2">
                    {getFrameworkIcon(file.language) || (
                      <FileIcon language={file.language} />
                    )}
                    {file.filename}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Single file header (when only one file) */}
          {!hasMultipleFiles && (
            <div className="flex items-center justify-between bg-gray-50 px-4 py-2 dark:bg-gray-900/50">
              <span className="flex items-center gap-2 text-[13px] font-medium text-gray-500 dark:text-gray-400">
                {getFrameworkIcon(activeFile.language) || (
                  <FileIcon language={activeFile.language} />
                )}
                {activeFile.filename}
              </span>
              <span className="text-[12px] text-gray-400 dark:text-gray-500">
                {activeFile.code.trim().split('\n').length} lines
              </span>
            </div>
          )}

          {/* Code Content */}
          <div className="overflow-x-auto rounded-b-xl bg-white dark:bg-gray-950">
            {activeFile.highlightedCode ? (
              <pre className="p-4 text-[13px] leading-[1.7]">
                <code
                  className="shiki-code"
                  dangerouslySetInnerHTML={{
                    __html: activeFile.highlightedCode,
                  }}
                />
              </pre>
            ) : (
              <pre className="p-4 text-[13px] leading-[1.7]">
                <code className="text-gray-800 dark:text-gray-200">
                  {activeFile.code.trim()}
                </code>
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Get framework icon based on language, or null if not a framework
function getFrameworkIcon(language: string) {
  const normalizedLang = language.toLowerCase()

  // React (tsx, jsx)
  if (normalizedLang === 'tsx' || normalizedLang === 'jsx') {
    return <ReactIcon className="h-4 w-4 flex-shrink-0 text-blue-500" />
  }

  // Vue
  if (normalizedLang === 'vue') {
    return <VueIcon className="h-4 w-4 flex-shrink-0 text-emerald-500" />
  }

  // Svelte
  if (normalizedLang === 'svelte') {
    return <SvelteIcon className="h-4 w-4 flex-shrink-0 text-orange-600" />
  }

  return null
}

// File icon with language-specific colors (fallback)
function FileIcon({ language }: { language: string }) {
  const colors: Record<string, string> = {
    tsx: 'text-blue-500',
    typescript: 'text-blue-500',
    ts: 'text-blue-500',
    jsx: 'text-amber-500',
    javascript: 'text-amber-500',
    js: 'text-amber-500',
    css: 'text-purple-500',
    html: 'text-orange-500',
    vue: 'text-emerald-500',
    svelte: 'text-orange-600',
    json: 'text-gray-500',
  }

  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-4 w-4 flex-shrink-0 ${colors[language] || 'text-gray-400'}`}
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M4 1.75A1.75 1.75 0 0 1 5.75 0h5.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 14.25 16H5.75A1.75 1.75 0 0 1 4 14.25V1.75zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25V4.664a.25.25 0 0 0-.073-.177l-2.914-2.914a.25.25 0 0 0-.177-.073H5.75z"
      />
    </svg>
  )
}

export default CodeExample
