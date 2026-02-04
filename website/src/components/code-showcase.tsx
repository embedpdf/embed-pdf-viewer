'use client'

import React, { useState } from 'react'
import { ReactIcon, VueIcon, SvelteIcon } from './framework-icons'
import { EMBEDPDF_JS_URL, DEMO_PDF_URL } from './cdn-snippet'

export type Framework = 'snippet' | 'react' | 'vue' | 'svelte'

interface Tab {
  id: Framework
  label: string
  filename: string
  icon: React.ReactNode
  color: string
  hoverColor: string
}

interface CodeShowcaseProps {
  /** If provided, only shows this specific framework without tabs */
  framework?: Framework
  /** Callback to notify parent of active tab changes */
  onTabChange?: (framework: Framework) => void
}

const tabs: Tab[] = [
  {
    id: 'snippet',
    label: 'Snippet',
    filename: 'index.html',
    icon: (
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <polyline points="13 2 13 9 20 9" />
      </svg>
    ),
    color: 'text-orange-400',
    hoverColor: 'group-hover:text-orange-300',
  },
  {
    id: 'react',
    label: 'React',
    filename: 'App.tsx',
    icon: <ReactIcon className="h-4 w-4" />,
    color: 'text-cyan-400',
    hoverColor: 'group-hover:text-cyan-300',
  },
  {
    id: 'vue',
    label: 'Vue',
    filename: 'App.vue',
    icon: <VueIcon className="h-4 w-4" />,
    color: 'text-emerald-400',
    hoverColor: 'group-hover:text-emerald-300',
  },
  {
    id: 'svelte',
    label: 'Svelte',
    filename: 'App.svelte',
    icon: <SvelteIcon className="h-4 w-4" />,
    color: 'text-orange-500',
    hoverColor: 'group-hover:text-orange-400',
  },
]

const codeSnippets: Record<Framework, string> = {
  snippet: `<div id="pdf-viewer" style="height: 500px"></div>
<script async type="module">
  import EmbedPDF from '${EMBEDPDF_JS_URL}';

  const viewer = EmbedPDF.init({
    type: 'container',
    target: document.getElementById('pdf-viewer'),
    src: '${DEMO_PDF_URL}'
  }) 
</script>`,
  react: `import { PDFViewer } from '@embedpdf/react-pdf-viewer';

export default function App() {
  return (
    <PDFViewer
      config={{ src: '${DEMO_PDF_URL}' }}
      style={{ height: '500px' }}
      onReady={(registry) => {
        console.log('PDF viewer ready!', registry);
      }}
    />
  );
}`,
  vue: `<template>
  <PDFViewer
    :config="{ src: '${DEMO_PDF_URL}' }"
    :style="{ height: '500px' }"
    @ready="onReady"
  />
</template>

<script setup lang="ts">
import { PDFViewer } from '@embedpdf/vue-pdf-viewer';

function onReady(registry) {
  console.log('PDF viewer ready!', registry);
}
</script>`,
  svelte: `<script lang="ts">
  import { PDFViewer } from '@embedpdf/svelte-pdf-viewer';

  function onready(registry) {
    console.log('PDF viewer ready!', registry);
  }
</script>

<PDFViewer
  config={{ src: '${DEMO_PDF_URL}' }}
  style="height: 500px"
  {onready}
/>`,
}

// Syntax highlighting components for each framework
const SnippetCode = () => (
  <code className="text-gray-300">
    <span className="text-gray-500">&lt;!-- Add the PDF container --&gt;</span>
    {'\n'}
    <span className="text-blue-400">&lt;div</span>{' '}
    <span className="text-green-400">id</span>=
    <span className="text-yellow-300">&quot;pdf-viewer&quot;</span>{' '}
    <span className="text-green-400">style</span>=
    <span className="text-yellow-300">&quot;height: 500px&quot;</span>
    <span className="text-blue-400">&gt;&lt;/div&gt;</span>
    {'\n\n'}
    <span className="text-gray-500">&lt;!-- Initialize EmbedPDF --&gt;</span>
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
    <span className="text-yellow-300">&apos;{EMBEDPDF_JS_URL}&apos;</span>;
    {'\n\n'}
    {'  '}
    <span className="text-purple-400">const</span>{' '}
    <span className="text-white">viewer</span>{' '}
    <span className="text-purple-400">=</span>{' '}
    <span className="text-white">EmbedPDF</span>.
    <span className="text-blue-300">init</span>({'{'}
    {'\n'}
    {'    '}
    <span className="text-red-300">type</span>:{' '}
    <span className="text-yellow-300">&apos;container&apos;</span>,{'\n'}
    {'    '}
    <span className="text-red-300">target</span>:{' '}
    <span className="text-white">document</span>.
    <span className="text-blue-300">getElementById</span>(
    <span className="text-yellow-300">&apos;pdf-viewer&apos;</span>),{'\n'}
    {'    '}
    <span className="text-red-300">src</span>:{' '}
    <span className="text-yellow-300">&apos;{DEMO_PDF_URL}&apos;</span>
    {'\n'}
    {'  '}
    {'}'}) {'\n'}
    <span className="text-blue-400">&lt;/script&gt;</span>
  </code>
)

const ReactCode = () => (
  <code className="text-gray-300">
    <span className="text-purple-400">import</span> {'{ '}
    <span className="text-white">PDFViewer</span>
    {' }'} <span className="text-purple-400">from</span>{' '}
    <span className="text-yellow-300">
      &apos;@embedpdf/react-pdf-viewer&apos;
    </span>
    ;{'\n\n'}
    <span className="text-purple-400">export default function</span>{' '}
    <span className="text-blue-300">App</span>() {'{'}
    {'\n'}
    {'  '}
    <span className="text-purple-400">return</span> ({'\n'}
    {'    '}
    <span className="text-blue-400">&lt;PDFViewer</span>
    {'\n'}
    {'      '}
    <span className="text-green-400">config</span>=
    <span className="text-cyan-300">
      {'{'}
      {'{ '}
    </span>
    <span className="text-red-300">src</span>:{' '}
    <span className="text-yellow-300">&apos;{DEMO_PDF_URL}&apos;</span>
    <span className="text-cyan-300">
      {' }'}
      {'}'}
    </span>
    {'\n'}
    {'      '}
    <span className="text-green-400">style</span>=
    <span className="text-cyan-300">
      {'{'}
      {'{ '}
    </span>
    <span className="text-red-300">height</span>:{' '}
    <span className="text-yellow-300">&apos;500px&apos;</span>
    <span className="text-cyan-300">
      {' }'}
      {'}'}
    </span>
    {'\n'}
    {'      '}
    <span className="text-green-400">onReady</span>=
    <span className="text-cyan-300">{'{'}(</span>
    <span className="text-orange-300">registry</span>
    <span className="text-cyan-300">) =&gt; {'{'}</span>
    {'\n'}
    {'        '}
    <span className="text-white">console</span>.
    <span className="text-blue-300">log</span>(
    <span className="text-yellow-300">&apos;PDF viewer ready!&apos;</span>,{' '}
    <span className="text-orange-300">registry</span>);{'\n'}
    {'      '}
    <span className="text-cyan-300">
      {'}'}
      {'}'}
    </span>
    {'\n'}
    {'    '}
    <span className="text-blue-400">/&gt;</span>
    {'\n'}
    {'  '});{'\n'}
    {'}'}
  </code>
)

const VueCode = () => (
  <code className="text-gray-300">
    <span className="text-blue-400">&lt;template&gt;</span>
    {'\n'}
    {'  '}
    <span className="text-blue-400">&lt;PDFViewer</span>
    {'\n'}
    {'    '}
    <span className="text-green-400">:config</span>=
    <span className="text-yellow-300">
      &quot;{'{ '}src: &apos;{DEMO_PDF_URL}&apos;{' }'}&quot;
    </span>
    {'\n'}
    {'    '}
    <span className="text-green-400">:style</span>=
    <span className="text-yellow-300">
      &quot;{'{ '}height: &apos;500px&apos;{' }'}&quot;
    </span>
    {'\n'}
    {'    '}
    <span className="text-green-400">@ready</span>=
    <span className="text-yellow-300">&quot;onReady&quot;</span>
    {'\n'}
    {'  '}
    <span className="text-blue-400">/&gt;</span>
    {'\n'}
    <span className="text-blue-400">&lt;/template&gt;</span>
    {'\n\n'}
    <span className="text-blue-400">&lt;script</span>{' '}
    <span className="text-green-400">setup</span>{' '}
    <span className="text-green-400">lang</span>=
    <span className="text-yellow-300">&quot;ts&quot;</span>
    <span className="text-blue-400">&gt;</span>
    {'\n'}
    <span className="text-purple-400">import</span> {'{ '}
    <span className="text-white">PDFViewer</span>
    {' }'} <span className="text-purple-400">from</span>{' '}
    <span className="text-yellow-300">
      &apos;@embedpdf/vue-pdf-viewer&apos;
    </span>
    ;{'\n\n'}
    <span className="text-purple-400">function</span>{' '}
    <span className="text-blue-300">onReady</span>(
    <span className="text-orange-300">registry</span>) {'{'}
    {'\n'}
    {'  '}
    <span className="text-white">console</span>.
    <span className="text-blue-300">log</span>(
    <span className="text-yellow-300">&apos;PDF viewer ready!&apos;</span>,{' '}
    <span className="text-orange-300">registry</span>);{'\n'}
    {'}'}
    {'\n'}
    <span className="text-blue-400">&lt;/script&gt;</span>
  </code>
)

const SvelteCode = () => (
  <code className="text-gray-300">
    <span className="text-blue-400">&lt;script</span>{' '}
    <span className="text-green-400">lang</span>=
    <span className="text-yellow-300">&quot;ts&quot;</span>
    <span className="text-blue-400">&gt;</span>
    {'\n'}
    {'  '}
    <span className="text-purple-400">import</span> {'{ '}
    <span className="text-white">PDFViewer</span>
    {' }'} <span className="text-purple-400">from</span>{' '}
    <span className="text-yellow-300">
      &apos;@embedpdf/svelte-pdf-viewer&apos;
    </span>
    ;{'\n\n'}
    {'  '}
    <span className="text-purple-400">function</span>{' '}
    <span className="text-blue-300">onready</span>(
    <span className="text-orange-300">registry</span>) {'{'}
    {'\n'}
    {'    '}
    <span className="text-white">console</span>.
    <span className="text-blue-300">log</span>(
    <span className="text-yellow-300">&apos;PDF viewer ready!&apos;</span>,{' '}
    <span className="text-orange-300">registry</span>);{'\n'}
    {'  '}
    {'}'}
    {'\n'}
    <span className="text-blue-400">&lt;/script&gt;</span>
    {'\n\n'}
    <span className="text-blue-400">&lt;PDFViewer</span>
    {'\n'}
    {'  '}
    <span className="text-green-400">config</span>=
    <span className="text-cyan-300">
      {'{'}
      {'{ '}
    </span>
    <span className="text-red-300">src</span>:{' '}
    <span className="text-yellow-300">&apos;{DEMO_PDF_URL}&apos;</span>
    <span className="text-cyan-300">
      {' }'}
      {'}'}
    </span>
    {'\n'}
    {'  '}
    <span className="text-green-400">style</span>=
    <span className="text-yellow-300">&quot;height: 500px&quot;</span>
    {'\n'}
    {'  '}
    <span className="text-green-400">{'{onready}'}</span>
    {'\n'}
    <span className="text-blue-400">/&gt;</span>
  </code>
)

const codeComponents: Record<Framework, React.FC> = {
  snippet: SnippetCode,
  react: ReactCode,
  vue: VueCode,
  svelte: SvelteCode,
}

export const CodeShowcase = ({ framework, onTabChange }: CodeShowcaseProps) => {
  const [activeTab, setActiveTab] = useState<Framework>(framework ?? 'snippet')
  const [isCopied, setIsCopied] = useState(false)

  // If a specific framework is provided, lock to that framework
  const displayedFramework = framework ?? activeTab
  const showTabs = !framework

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(codeSnippets[displayedFramework])
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleTabChange = (id: Framework) => {
    setActiveTab(id)
    onTabChange?.(id)
  }

  const currentTab = tabs.find((t) => t.id === displayedFramework)!
  const CodeComponent = codeComponents[displayedFramework]

  return (
    <div className="group relative">
      {/* Gradient border effect */}
      <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-purple-600 via-blue-500 to-orange-400 opacity-20 blur transition duration-200 group-hover:opacity-30"></div>

      {/* Main code container */}
      <div className="relative overflow-hidden rounded-2xl bg-gray-900 shadow-2xl">
        {/* Header with tabs */}
        <div className="border-b border-gray-700">
          {/* Top row: traffic lights + filename + copy button */}
          <div className="flex items-center justify-between px-6 py-3">
            <div className="flex items-center space-x-2">
              <div className="h-3 w-3 rounded-full bg-red-500"></div>
              <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
              <div className="h-3 w-3 rounded-full bg-green-500"></div>
              <span className="ml-4 text-sm text-gray-400">
                {currentTab.filename}
              </span>
            </div>
            <button
              onClick={copyToClipboard}
              className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
            >
              {isCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {/* Tabs row - only shown when no specific framework is set */}
          {showTabs && (
            <div className="-mb-px flex px-2 sm:px-4">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`group relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-all duration-200 sm:gap-2 sm:px-4 ${
                    activeTab === tab.id
                      ? `${tab.color} bg-gray-800/50`
                      : `text-gray-500 hover:text-gray-300`
                  }`}
                >
                  {/* Active tab indicator */}
                  {activeTab === tab.id && (
                    <div
                      className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r ${
                        tab.id === 'snippet'
                          ? 'from-orange-500 to-amber-400'
                          : tab.id === 'react'
                            ? 'from-cyan-500 to-blue-400'
                            : tab.id === 'vue'
                              ? 'from-emerald-500 to-green-400'
                              : 'from-orange-600 to-red-500'
                      }`}
                    />
                  )}
                  <span
                    className={
                      activeTab === tab.id ? tab.color : tab.hoverColor
                    }
                  >
                    {tab.icon}
                  </span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Code content */}
        <div className="p-6">
          <pre className="overflow-x-auto text-sm leading-relaxed">
            <CodeComponent />
          </pre>
        </div>
      </div>
    </div>
  )
}

export default CodeShowcase
