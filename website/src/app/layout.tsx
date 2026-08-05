import type { Metadata } from 'next';
import { Inter, Manrope } from 'next/font/google';
import type { ReactNode } from 'react';

import { getMetadataBase } from '@/lib/site';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: 'EmbedPDF — Open Source PDF Solutions',
  description:
    'The ultimate Open Source PDF viewer for JavaScript. Choose our drop-in component for instant results, or use our headless library to build a completely custom UI. Apache-2.0 licensed.',
  icons: { icon: '/embedpdf-icon.svg' },
};

/**
 * The DOCUMENT only — html, body, fonts, metadata. No chrome.
 *
 * Chrome belongs to the shells one level down, one route group each:
 *   (site)  marketing — header + footer
 *   (docs)  reference — header + sidebar container + footer
 *   (app)   the product itself — header, nothing below the fold
 *
 * Layouts compose downward only: whatever the root renders, no page can
 * remove. Keeping it empty is what lets a shell differ — an app page drop
 * the footer, a future lead-gen shell swap the header for a stripped one —
 * without any page-aware conditionals in here.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${manrope.variable}`}>
      <body className="bg-ep-bg text-ep-ink min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
