import React from 'react'

export const AnimatedBackground = () => {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Purple blob */}
      <div className="top-70 animate-blob absolute left-8 h-64 w-64 rounded-full bg-purple-500 opacity-10 mix-blend-multiply blur-3xl filter dark:opacity-20 dark:mix-blend-normal"></div>

      {/* Blue blob */}
      <div className="animate-blob animation-delay-2000 absolute -right-8 top-32 h-80 w-80 rounded-full bg-blue-500 opacity-10 mix-blend-multiply blur-3xl filter dark:opacity-20 dark:mix-blend-normal"></div>

      {/* Orange blob */}
      <div className="animate-blob animation-delay-4000 absolute bottom-24 left-20 h-72 w-72 rounded-full bg-orange-400 opacity-10 mix-blend-multiply blur-3xl filter dark:opacity-20 dark:mix-blend-normal"></div>

      {/* Subtle grid pattern */}
      <div className="bg-grid-pattern absolute inset-0 opacity-5 dark:opacity-[0.03]"></div>
    </div>
  )
}
