'use client'

import React from 'react'
import { Shield } from 'lucide-react'

interface PrivacyStatementProps {
  className?: string
  size?: 'small' | 'medium' | 'large'
  gradientColor?: string
}

export const PrivacyStatement = ({
  className = '',
  size = 'medium',
  gradientColor = 'from-blue-600 to-teal-500',
}: PrivacyStatementProps) => {
  const sizeClasses = {
    small: 'text-sm px-4 py-3',
    medium: 'text-lg px-6 py-4',
    large: 'text-xl px-8 py-6',
  }

  const iconSizes = {
    small: 'h-4 w-4',
    medium: 'h-5 w-5',
    large: 'h-6 w-6',
  }

  return (
    <div
      className={`rounded-2xl border border-green-200 bg-green-50/50 backdrop-blur-sm ${sizeClasses[size]} ${className} dark:border-green-900/30 dark:bg-green-900/10`}
    >
      <p className={`font-medium text-gray-800 dark:text-gray-200`}>
        <Shield
          className={`inline ${iconSizes[size]} mr-1 text-green-600 dark:text-green-400`}
        />
        <span className="font-semibold">100% Private:</span> Your files never
        leave your device. No uploads, no tracking, no cookies. All processing
        happens locally in your browser with{' '}
        <a
          href="https://github.com/embedpdf/embed-pdf-viewer"
          target="_blank"
          rel="noreferrer"
          className={`bg-gradient-to-r font-semibold ${gradientColor} bg-clip-text text-transparent transition-all hover:underline`}
        >
          open-source code
        </a>{' '}
        you can verify yourself.
      </p>
    </div>
  )
}
