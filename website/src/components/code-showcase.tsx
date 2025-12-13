'use client'

import React, { useState } from 'react'

// Version is injected at build time from the snippet's package.json via next.config.ts
const EMBEDPDF_VERSION = process.env.NEXT_PUBLIC_SNIPPET_VERSION ?? '0.0.0'

const EMBEDPDF_JS_URL = `https://cdn.jsdelivr.net/npm/@embedpdf/snippet@${EMBEDPDF_VERSION}/dist/embedpdf.js`
const DEMO_PDF_URL = 'https://snippet.embedpdf.com/ebook.pdf'

const codeSnippet = `<div id="pdf-viewer" style="height: 500px"></div>
<script async type="module">
  import EmbedPDF from '${EMBEDPDF_JS_URL}';

  const EPDFinstance = EmbedPDF.init({
    type: 'container',
    target: document.getElementById('pdf-viewer'),
    src: '${DEMO_PDF_URL}'
  }) 
</script>`

export const CodeShowcase = () => {
  const [isCopied, setIsCopied] = useState(false)

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(codeSnippet)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className="group relative">
      {/* Gradient border effect */}
      <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-purple-600 via-blue-500 to-orange-400 opacity-20 blur transition duration-200 group-hover:opacity-30"></div>

      {/* Main code container */}
      <div className="relative overflow-hidden rounded-2xl bg-gray-900 shadow-2xl">
        {/* Header with copy button */}
        <div className="flex items-center justify-between border-b border-gray-700 px-6 py-4">
          <div className="flex items-center space-x-2">
            <div className="h-3 w-3 rounded-full bg-red-500"></div>
            <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
            <div className="h-3 w-3 rounded-full bg-green-500"></div>
            <span className="ml-4 text-sm text-gray-400">index.html</span>
          </div>
          <button
            onClick={copyToClipboard}
            className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
          >
            {isCopied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        {/* Code content */}
        <div className="p-6">
          <pre className="overflow-x-auto text-sm leading-relaxed">
            <code className="text-gray-300">
              <span className="text-gray-500">
                &lt;!-- Add the PDF container --&gt;
              </span>
              {'\n'}
              <span className="text-blue-400">&lt;div</span>{' '}
              <span className="text-green-400">id</span>=
              <span className="text-yellow-300">&quot;pdf-viewer&quot;</span>{' '}
              <span className="text-green-400">style</span>=
              <span className="text-yellow-300">&quot;height: 500px&quot;</span>
              <span className="text-blue-400">&gt;&lt;/div&gt;</span>
              {'\n\n'}
              <span className="text-gray-500">
                &lt;!-- Initialize EmbedPDF --&gt;
              </span>
              {'\n'}
              <span className="text-blue-400">&lt;script</span>{' '}
              <span className="text-green-400">async</span>{' '}
              <span className="text-green-400">type</span>=
              <span className="text-yellow-300">&quot;module&quot;</span>
              <span className="text-blue-400">&gt;</span>
              {'\n'}
              {'  '}
              <span className="text-purple-400">import</span>{' '}
              <span className="text-white">EmbedPDF</span>{' '}
              <span className="text-purple-400">from</span>{' '}
              <span className="text-yellow-300">
                &apos;{EMBEDPDF_JS_URL}&apos;
              </span>
              ;{'\n\n'}
              {'  '}
              <span className="text-purple-400">const</span>{' '}
              <span className="text-white">EPDFinstance</span>{' '}
              <span className="text-purple-400">=</span>{' '}
              <span className="text-white">EmbedPDF</span>.
              <span className="text-blue-300">init</span>({'{'}
              {'\n'}
              {'    '}
              <span className="text-red-300">type</span>:
              <span className="text-yellow-300">&apos;container&apos;</span>,
              {'\n'}
              {'    '}
              <span className="text-red-300">target</span>:
              <span className="text-white">document</span>.
              <span className="text-blue-300">getElementById</span>(
              <span className="text-yellow-300">&apos;pdf-viewer&apos;</span>),
              {'\n'}
              {'    '}
              <span className="text-red-300">src</span>:
              <span className="text-yellow-300">
                &apos;{DEMO_PDF_URL}&apos;
              </span>
              {'\n'}
              {'  '}
              {'}'}) {'\n'}
              <span className="text-blue-400">&lt;/script&gt;</span>
            </code>
          </pre>
        </div>
      </div>
    </div>
  )
}

export default CodeShowcase
