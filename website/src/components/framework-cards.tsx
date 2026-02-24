import { ReactIcon, VueIcon, SvelteIcon } from '@/components/framework-icons'
import Link from 'next/link'

export const FrameworkCards = () => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
    <Link
      href="/docs/react/viewer/introduction"
      className="group flex flex-col items-center rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-cyan-200 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-cyan-800"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-cyan-50 text-cyan-500 group-hover:bg-cyan-100 dark:bg-cyan-900/30 dark:text-cyan-400 dark:group-hover:bg-cyan-900/50">
        <ReactIcon className="h-6 w-6" />
      </div>
      <h3 className="font-semibold text-gray-900 dark:text-white">React</h3>
      <code className="mt-2 rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
        @embedpdf/react-pdf-viewer
      </code>
    </Link>

    <Link
      href="/docs/vue/viewer/introduction"
      className="group flex flex-col items-center rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-emerald-200 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-emerald-800"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 group-hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:group-hover:bg-emerald-900/50">
        <VueIcon className="h-6 w-6" />
      </div>
      <h3 className="font-semibold text-gray-900 dark:text-white">Vue.js</h3>
      <code className="mt-2 rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
        @embedpdf/vue-pdf-viewer
      </code>
    </Link>

    <Link
      href="/docs/svelte/viewer/introduction"
      className="group flex flex-col items-center rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-orange-200 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-orange-800"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-500 group-hover:bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400 dark:group-hover:bg-orange-900/50">
        <SvelteIcon className="h-6 w-6" />
      </div>
      <h3 className="font-semibold text-gray-900 dark:text-white">Svelte</h3>
      <code className="mt-2 rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
        @embedpdf/svelte-pdf-viewer
      </code>
    </Link>
  </div>
)
