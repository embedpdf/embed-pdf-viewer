import { ThemeProvider } from '@/components/theme-provider'
import '@/styles/tailwind.css'
import { getPageMap } from 'nextra/page-map'

export const metadata = {
  title:
    'Open-Source JavaScript PDF Viewer – Fast, Customizable & Framework-Agnostic | EmbedPDF',
  description:
    'EmbedPDF is a blazing-fast, MIT-licensed JavaScript PDF viewer that works with React, Vue, Svelte, and plain JS. Fully customizable, zero vendor lock-in, and perfect for modern web apps.',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  manifest: `/site.webmanifest`,
  // Initial theme color - will be dynamically updated by ThemeProvider
  // based on user's theme preference (system or manual)
  themeColor: '#ffffff',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let pageMap = await getPageMap()

  return (
    // Add suppressHydrationWarning to html
    <html lang="en" suppressHydrationWarning>
      <body className="bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
