// Version is injected at build time from the snippet's package.json via next.config.ts
const EMBEDPDF_VERSION = process.env.NEXT_PUBLIC_SNIPPET_VERSION ?? '0.0.0'

export const EMBEDPDF_JS_URL = `https://cdn.jsdelivr.net/npm/@embedpdf/snippet@${EMBEDPDF_VERSION}/dist/embedpdf.js`
export const DEMO_PDF_URL = 'https://snippet.embedpdf.com/ebook.pdf'
