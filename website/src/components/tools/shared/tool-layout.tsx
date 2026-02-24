'use client'

import React, { ReactNode } from 'react'
import { PrivacyStatement } from './privacy-statement'

interface ToolLayoutProps {
  title: string
  subtitle: string
  description: string
  badgeText: string
  badgeColor?: string
  gradientColor?: string // New prop for gradient colors
  showPrivacyStatement?: boolean
  children: ReactNode
}

export const ToolLayout = ({
  title,
  subtitle,
  description,
  badgeText,
  // Updated default to include dark mode variants
  badgeColor = 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800/30 dark:bg-blue-900/20 dark:text-blue-300',
  gradientColor = 'from-blue-600 to-teal-500', // Default gradient
  showPrivacyStatement = true,
  children,
}: ToolLayoutProps) => {
  return (
    <div className="py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header Section - Always visible */}
        <div className="mb-12 text-center">
          <div
            className={`mb-6 inline-block rounded-full border px-6 py-2 text-sm font-medium ${badgeColor}`}
          >
            {badgeText}
          </div>
          <h1 className="mb-6 text-4xl font-black leading-tight tracking-tight text-gray-900 dark:text-white md:text-5xl">
            {title}
            <span
              className={`block bg-gradient-to-r ${gradientColor} bg-clip-text text-transparent`}
            >
              {subtitle}
            </span>
          </h1>
          <div className="mx-auto max-w-4xl">
            <p className="mb-4 text-xl text-gray-600 dark:text-gray-400">
              {description}
            </p>
            {showPrivacyStatement && (
              <PrivacyStatement
                className="mt-6"
                gradientColor={gradientColor}
              />
            )}
          </div>
        </div>

        {children}
      </div>
    </div>
  )
}
