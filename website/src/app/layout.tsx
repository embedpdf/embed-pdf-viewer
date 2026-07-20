import type { Metadata } from 'next';
import { Inter, Manrope } from 'next/font/google';
import type { ReactNode } from 'react';

import { Footer } from '@/components/site/footer';
import { Header } from '@/components/site/header';

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
  title: 'EmbedPDF — Open Source PDF Solutions',
  description:
    'The ultimate Open Source PDF viewer for JavaScript. Choose our drop-in component for instant results, or use our headless library to build a completely custom UI. Apache-2.0 licensed.',
  icons: { icon: '/embedpdf-icon.svg' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${manrope.variable}`}>
      <body className="bg-ep-bg text-ep-ink min-h-screen font-sans antialiased">
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
