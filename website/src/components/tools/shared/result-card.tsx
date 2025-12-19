'use client'

import React from 'react'
import { CheckCircle } from 'lucide-react'

// Accept any lucide icon (or custom SVG component)
type IconType = React.ComponentType<React.SVGProps<SVGSVGElement>>

type Accent =
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'teal'
  | 'indigo'
  | 'orange'
  | 'red'

const THEME: Record<Accent, { icon: string; primary: string }> = {
  green: {
    icon: 'text-green-500 dark:text-green-400',
    primary:
      'bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600',
  },
  blue: {
    icon: 'text-blue-500 dark:text-blue-400',
    primary:
      'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600',
  },
  purple: {
    icon: 'text-purple-500 dark:text-purple-400',
    primary:
      'bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600',
  },
  pink: {
    icon: 'text-pink-500 dark:text-pink-400',
    primary:
      'bg-pink-600 hover:bg-pink-700 dark:bg-pink-500 dark:hover:bg-pink-600',
  },
  teal: {
    icon: 'text-teal-500 dark:text-teal-400',
    primary:
      'bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600',
  },
  indigo: {
    icon: 'text-indigo-500 dark:text-indigo-400',
    primary:
      'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600',
  },
  orange: {
    icon: 'text-orange-500 dark:text-orange-400',
    primary:
      'bg-orange-600 hover:bg-orange-700 dark:bg-orange-500 dark:hover:bg-orange-600',
  },
  red: {
    icon: 'text-red-500 dark:text-red-400',
    primary:
      'bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600',
  },
}

export interface ResultCardProps {
  /** Heading, e.g. "Metadata Updated Successfully!" */
  title: React.ReactNode
  /** Supporting text */
  message?: React.ReactNode
  /** Icon to render at the top (defaults to CheckCircle) */
  icon?: IconType
  /** Accent color theme for icon and primary button */
  accent?: Accent
  /** Additional classes for the outer wrapper */
  className?: string
  /** Download configuration */
  download: {
    /** blob/data URL */
    url: string
    /** Override the final filename (easiest). */
    fileName?: string
    /** Or derive from an original name + suffix. */
    originalFileName?: string
    /** Suffix to append before .pdf, e.g. "_metadata_updated" */
    suffix?: string
    /** Primary button label (defaults to "Download PDF") */
    label?: string
  }
  /** Secondary action (usually "Start Over" / "Edit Another") */
  secondary?: {
    label: string
    onClick: () => void
    icon?: IconType
  }
  /** Optional extra content under the buttons (e.g., tips/links). */
  footerSlot?: React.ReactNode
}

export const ResultCard: React.FC<ResultCardProps> = ({
  title,
  message,
  icon: Icon = CheckCircle,
  accent = 'green',
  className,
  download,
  secondary,
  footerSlot,
}) => {
  const theme = THEME[accent]

  const resolvedFileName = React.useMemo(() => {
    if (download.fileName) return ensurePdf(download.fileName)
    if (download.originalFileName) {
      const base = download.originalFileName
      const suffix = download.suffix ?? ''
      if (/\.pdf$/i.test(base)) return base.replace(/\.pdf$/i, `${suffix}.pdf`)
      return `${base}${suffix}.pdf`
    }
    return 'document.pdf'
  }, [download.fileName, download.originalFileName, download.suffix])

  return (
    <div className={`mx-auto max-w-2xl text-center ${className ?? ''}`}>
      <div className="mb-6 flex justify-center">
        <Icon className={`h-16 w-16 ${theme.icon}`} />
      </div>

      <h2 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">
        {title}
      </h2>

      {message ? (
        <p className="mb-8 text-gray-600 dark:text-gray-300">{message}</p>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
        <a
          href={download.url}
          download={resolvedFileName}
          className={`inline-flex items-center justify-center rounded-md px-6 py-3 text-white transition-colors ${theme.primary}`}
        >
          {/* Consumers can pass an icon inside the label if desired; keep simple here */}
          {download.label ?? 'Download PDF'}
        </a>

        {secondary ? (
          <button
            onClick={secondary.onClick}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 px-6 py-3 text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            {secondary.icon ? (
              <secondary.icon className="mr-2 h-4 w-4" />
            ) : null}
            {secondary.label}
          </button>
        ) : null}
      </div>

      {footerSlot ? (
        <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">
          {footerSlot}
        </div>
      ) : null}
    </div>
  )
}

function ensurePdf(name: string) {
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`
}
