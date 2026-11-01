/**
 * Every word the open source PDF tools show, in one place: the tool list (footer, /tools, "Other
 * tools"), and each tool page's search title, heading, steps, questions and code. The URLs are
 * the ones the old site ranked with, so they never change.
 *
 * Page copy has no em-dashes and names no release version.
 */

export type ToolSlug =
  | 'pdf-merge'
  | 'pdf-metadata-editor'
  | 'pdf-outline-editor'
  | 'pdf-attachment-editor';

export interface ToolInfo {
  readonly slug: ToolSlug;
  readonly href: `/tools/${ToolSlug}`;
  /** What links call it. */
  readonly name: string;
  /** One line on the card: what you'd use it for. */
  readonly summary: string;
  /** The link another tool offers to carry on with the same file. */
  readonly next: string;
}

export const TOOLS: readonly ToolInfo[] = [
  {
    slug: 'pdf-merge',
    href: '/tools/pdf-merge',
    name: 'Merge PDF',
    summary: 'Put several PDFs together into one file, in the order you choose.',
    next: 'Merge it with other PDFs',
  },
  {
    slug: 'pdf-metadata-editor',
    href: '/tools/pdf-metadata-editor',
    name: 'Edit PDF metadata',
    summary: 'Change the title and author stored in a PDF, or remove them before you share it.',
    next: 'Edit its metadata',
  },
  {
    slug: 'pdf-outline-editor',
    href: '/tools/pdf-outline-editor',
    name: 'Edit PDF bookmarks',
    summary: 'Add, rename and organize the bookmarks readers use to jump through a PDF.',
    next: 'Edit its bookmarks',
  },
  {
    slug: 'pdf-attachment-editor',
    href: '/tools/pdf-attachment-editor',
    name: 'PDF attachments',
    summary: 'See the files inside a PDF, save them, or attach new ones.',
    next: 'Add or save attachments',
  },
];

export const toolInfo = (slug: ToolSlug): ToolInfo => TOOLS.find((tool) => tool.slug === slug)!;

export interface ToolQuestion {
  readonly question: string;
  /** Plain text: it is also the page's structured data. */
  readonly answer: string;
}

export interface ToolPageCopy {
  readonly slug: ToolSlug;
  /** The search result's title and description. */
  readonly metaTitle: string;
  readonly metaDescription: string;
  /** The H1, with the part drawn in the brand gradient. */
  readonly heading: { readonly lead: string; readonly accent: string };
  readonly lede: string;
  /** The empty tool: what to drop, the button, and what happens next. */
  readonly drop: { readonly title: string; readonly button: string; readonly hint: string };
  readonly steps: readonly { readonly title: string; readonly body: string }[];
  readonly questions: readonly ToolQuestion[];
  /** "Build this into your app": the calls the tool makes, and where the docs explain them. */
  readonly developer: {
    readonly title: string;
    readonly body: string;
    readonly filename: string;
    readonly code: string;
    readonly docs: { readonly label: string; readonly href: string };
  };
}

export const TOOLS_INDEX = {
  metaTitle: 'Free, Open Source PDF Tools in Your Browser | EmbedPDF',
  metaDescription:
    'Free, open source PDF tools that run in your browser: merge PDFs, edit metadata and bookmarks, and manage attachments. No upload and no sign-up: your files never leave your device.',
  heading: { lead: 'Open source PDF tools,', accent: 'free in your browser' },
  lede: 'Merge PDFs, edit their details and bookmarks, and manage attachments. No upload, no account and no watermark.',
} as const;

/** Said once under every tool, and true: the engine runs on the visitor's device. */
export const PRIVACY_LINE = 'Your files stay on your device. Nothing is uploaded.';

/** The questions every tool shares, after its own. */
const SHARED_QUESTIONS: readonly ToolQuestion[] = [
  {
    question: 'Are my files uploaded anywhere?',
    answer:
      'No. The tool runs in your browser, on your device, with the open source EmbedPDF engine. Your files are never sent to a server, and the tool keeps working if you go offline after the page has loaded.',
  },
  {
    question: 'Is it free and open source?',
    answer:
      'Yes. There is no account, no watermark and no limit on how often you use it. The tools and the EmbedPDF library they are built on are open source under the Apache-2.0 license, and the code is on GitHub.',
  },
  {
    question: 'Which browsers does it work in?',
    answer:
      'Any current version of Chrome, Edge, Firefox or Safari, on a computer, tablet or phone.',
  },
];

export const MERGE_COPY: ToolPageCopy = {
  slug: 'pdf-merge',
  metaTitle: 'Merge PDF Files: Combine PDFs Free in Your Browser | EmbedPDF',
  metaDescription:
    'Combine PDF files into one in your browser. Put them in order, choose pages if you like, press Merge, and download. Free, no upload and no sign-up: your files never leave your device.',
  heading: { lead: 'Merge', accent: 'PDF files' },
  lede: 'Put PDFs together in the order you choose, whole or just the pages you need. Free, and your files never leave your device.',
  drop: {
    title: 'Drop your PDFs here',
    button: 'Choose PDF files',
    hint: 'Add as many as you like. Next, put them in order and, if you want, choose pages.',
  },
  steps: [
    {
      title: 'Add your PDFs',
      body: 'Drop them on the page or choose them. Add as many as you need.',
    },
    {
      title: 'Put them in order',
      body: 'Drag the files, or use the arrows. To use only some pages of a file, press Choose pages on its row.',
    },
    { title: 'Merge and download', body: 'Press Merge. The merged PDF downloads straight away.' },
  ],
  questions: [
    {
      question: 'How do I merge PDF files?',
      answer:
        'Drop your PDFs on this page, or press Choose PDF files. Put them in order by dragging them or with the arrows, then press Merge. The merged PDF downloads straight away.',
    },
    {
      question: 'Do I have to pick pages?',
      answer:
        'No. Every page of every file goes into the merged PDF unless you choose otherwise. To use only some pages of a file, press Choose pages on its row and tap the pages to leave out, or type the ones you want, like 1-3, 8. To move or rotate single pages, press Rearrange pages once the merge is done.',
    },
    {
      question: 'Can I take a few pages out of one PDF?',
      answer:
        'Yes. Add the PDF, press Choose pages and keep only the pages you need. The tool saves them as a new PDF.',
    },
    {
      question: 'Can I merge password-protected PDFs?',
      answer:
        'Yes. A file with a password asks for it in its own row. The password is only used on your device to open the file, and the merged PDF has no password.',
    },
    {
      question: 'What happens to bookmarks, links, comments and form fields?',
      answer:
        'They come along. Each file keeps its bookmarks, gathered under a bookmark with the file name (you can turn that off under Options); bookmarks to pages you left out are dropped. Links, comments and form fields stay on their pages, and the fields can still be filled in. When two files have fields with the same name, the second file’s fields get a new name, so each one is filled in on its own.',
    },
    {
      question: 'Can I merge signed PDFs?',
      answer:
        'Yes, and the pages look the same, but a digital signature only covers the file it was made in. In the merged PDF it no longer counts as valid. The tool tells you which files are signed before you merge.',
    },
    {
      question: 'Will the quality of my pages change?',
      answer:
        'No. Pages are copied as they are, with their fonts and images. Nothing is compressed or converted.',
    },
    {
      question: 'Is there a limit to how many files I can merge?',
      answer:
        'No. The only limit is the memory of your device. On a phone, merging several hundred megabytes at once can make the browser reload the page; merge fewer files at a time if that happens.',
    },
    ...SHARED_QUESTIONS,
  ],
  developer: {
    title: 'Merge PDFs in your own app',
    body: 'This tool is a few lines of EmbedPDF. The same engine opens, edits and saves PDFs in the browser or in Node, and the viewer around it is open source too.',
    filename: 'merge.ts',
    code: `import { localEngine } from '@embedpdf/engine';

// first, second: the two PDFs, as bytes
const engine = localEngine();
const doc = await engine.open({ kind: 'bytes', bytes: first });

await doc.pages.insert(second);
const merged = await doc.download();`,
    docs: { label: 'Read about pages', href: '/docs/engine/documents/pages' },
  },
};

export const METADATA_COPY: ToolPageCopy = {
  slug: 'pdf-metadata-editor',
  metaTitle: 'PDF Metadata Editor: Edit Title, Author and More | EmbedPDF',
  metaDescription:
    'Change the title, author, subject and keywords stored in a PDF, or remove personal details before you share it. Free, open source and private: your file never leaves your device.',
  heading: { lead: 'Edit PDF', accent: 'metadata' },
  lede: 'Change the title, author and other details stored in a PDF, or remove them before you share it. Free, and your file never leaves your device.',
  drop: {
    title: 'Drop your PDF here',
    button: 'Choose a PDF',
    hint: 'Its details show straight away, ready to change or remove.',
  },
  steps: [
    {
      title: 'Add your PDF',
      body: 'Drop it on the page or choose it. Its details show straight away.',
    },
    {
      title: 'Change what you need',
      body: 'Edit the title, author or any other field, or press Remove personal details.',
    },
    {
      title: 'Save and download',
      body: 'Press Save and download. The PDF keeps its name and its pages.',
    },
  ],
  questions: [
    {
      question: 'What is PDF metadata?',
      answer:
        'Details stored inside the file, apart from its pages: the title, the author, what it is about, keywords, the apps that made it, and when it was created and changed. PDF readers, file browsers and search engines read them.',
    },
    {
      question: 'Why does my PDF show a different title than its file name?',
      answer:
        'Browsers and PDF readers show the title stored in the file when there is one, instead of the file name. Change the Title field here to fix what they show, or empty it to show the file name.',
    },
    {
      question: 'How do I remove my name from a PDF?',
      answer:
        'Press Remove personal details. It empties the author, the keywords, the names of the apps that made the file, and fields other apps added. Then press Save and download. The new file is written fresh, so the old values are not left inside it. Some PDFs also keep a second copy of these details (XMP metadata); the tool tells you when yours does.',
    },
    {
      question: 'Will editing the metadata change my pages?',
      answer:
        'No. Only the details change. The pages, fonts, images, links and form fields stay exactly as they were.',
    },
    {
      question: 'What is the Trapping setting?',
      answer:
        'A setting for print shops: it says whether the file was prepared for small shifts between ink colors when it is printed. Leave it as it is unless your printer asks for it.',
    },
    {
      question: 'Why does my computer still show the old details?',
      answer:
        'Some file browsers remember what they read before. Open the downloaded file in a PDF reader to check, or give your computer a moment to read it again.',
    },
    ...SHARED_QUESTIONS,
  ],
  developer: {
    title: 'Read and change metadata in your app',
    body: 'Reading and changing a PDF’s details is two calls in EmbedPDF, in the browser or in Node.',
    filename: 'metadata.ts',
    code: `import { localEngine } from '@embedpdf/engine';

const engine = localEngine();
const doc = await engine.open({ kind: 'bytes', bytes });

const { title, author } = await doc.metadata.get();
await doc.metadata.update({ title: 'Q2 report', author: null });
const updated = await doc.download({ mode: 'rewrite' });`,
    docs: { label: 'Read about metadata', href: '/docs/engine/documents/metadata' },
  },
};

export const OUTLINE_COPY: ToolPageCopy = {
  slug: 'pdf-outline-editor',
  metaTitle: 'PDF Outline Editor: Add and Edit PDF Bookmarks Free | EmbedPDF',
  metaDescription:
    'Add, rename and organize the bookmarks (the outline) of a PDF while you see its pages. Free, open source and private: your file never leaves your device.',
  heading: { lead: 'Edit PDF', accent: 'bookmarks' },
  lede: 'Add, rename and organize the bookmarks readers use to jump through your PDF, with its pages right in front of you.',
  drop: {
    title: 'Drop your PDF here',
    button: 'Choose a PDF',
    hint: 'It opens with its bookmarks next to the pages.',
  },
  steps: [
    {
      title: 'Add your PDF',
      body: 'Drop it on the page or choose it. It opens with its bookmarks on the left.',
    },
    {
      title: 'Add and arrange bookmarks',
      body: 'Go to a page and press Add bookmark. Select a heading first to use it as the title. Drag bookmarks to reorder or nest them.',
    },
    { title: 'Download', body: 'Press Download. Your PDF keeps its name and its pages.' },
  ],
  questions: [
    {
      question: 'What are PDF bookmarks?',
      answer:
        'A table of contents in the side panel of a PDF reader, also called the outline. Each bookmark jumps to a place in the document, and bookmarks can sit under others, like chapters and sections.',
    },
    {
      question: 'How do I add a bookmark?',
      answer:
        'Go to the page, scroll to the place the bookmark should open, and press Add bookmark, then type its title. To use a heading as the title, select it on the page before you press Add bookmark.',
    },
    {
      question: 'How do I put a bookmark under another one?',
      answer:
        'Drag it onto the other bookmark. Or open the other bookmark’s menu and choose Add bookmark inside.',
    },
    {
      question: 'Can I change where a bookmark goes?',
      answer:
        'Yes. Go to the place it should open, then open the bookmark’s menu and choose Point it at the current view.',
    },
    {
      question: 'Will the bookmarks my PDF already has stay?',
      answer: 'Yes. The PDF opens with its bookmarks, and only what you change changes.',
    },
    ...SHARED_QUESTIONS,
  ],
  developer: {
    title: 'Edit bookmarks in your app',
    body: 'This page is the open source EmbedPDF viewer with its bookmarks panel open. Behind it, adding a bookmark is one call to the engine, in the browser or in Node.',
    filename: 'bookmarks.ts',
    code: `import { localEngine } from '@embedpdf/engine';

const engine = localEngine();
const doc = await engine.open({ kind: 'bytes', bytes });
const { pages } = await doc.pages.list();

await doc.outline.create({
  title: 'Appendix',
  target: { kind: 'goto', destination: { kind: 'fit', page: pages[11].ref } },
});
const updated = await doc.download();`,
    docs: { label: 'Read about the outline', href: '/docs/engine/documents/outline' },
  },
};

export const ATTACHMENTS_COPY: ToolPageCopy = {
  slug: 'pdf-attachment-editor',
  metaTitle: 'PDF Attachment Editor: Add, View and Extract Files | EmbedPDF',
  metaDescription:
    'See the files attached to a PDF, save them, or attach new ones, right in your browser. Free, open source and private: your file never leaves your device.',
  heading: { lead: 'Add or extract', accent: 'PDF attachments' },
  lede: 'See the files inside a PDF, save them, or attach new ones. Free, and your files never leave your device.',
  drop: {
    title: 'Drop your PDF here',
    button: 'Choose a PDF',
    hint: 'The files inside it are listed straight away.',
  },
  steps: [
    {
      title: 'Add your PDF',
      body: 'Drop it on the page or choose it. The files inside it are listed straight away.',
    },
    {
      title: 'Save or attach files',
      body: 'Save any file, or all of them at once. Drop other files on the page to attach them.',
    },
    {
      title: 'Download the PDF',
      body: 'Changed something? Press Download PDF to get it with its new attachments.',
    },
  ],
  questions: [
    {
      question: 'What are PDF attachments?',
      answer:
        'Files carried inside a PDF, like the spreadsheet behind a report or the XML of an e-invoice. PDF readers list them in an attachments panel. Some are pinned to a spot on a page instead; this tool shows both kinds.',
    },
    {
      question: 'How do I get the files out of a PDF?',
      answer:
        'Drop the PDF on this page. Press Save next to a file, or Save all files to get them together in one zip file.',
    },
    {
      question: 'How do I attach a file to a PDF?',
      answer:
        'Open the PDF here, then drop the files you want to attach on the page, or press Attach files. Press Download PDF to get the PDF with the files inside.',
    },
    {
      question: 'Can I attach any kind of file?',
      answer:
        'Yes: spreadsheets, images, XML, other PDFs, any file. PDF readers show them in their attachments panel.',
    },
    {
      question: 'Are files I remove really gone?',
      answer:
        'Yes. The downloaded PDF is written fresh, so a file you removed is not left inside it. A signed PDF is the exception: to keep its signature, it keeps its signed version, with the files it had then.',
    },
    ...SHARED_QUESTIONS,
  ],
  developer: {
    title: 'Work with attachments in your app',
    body: 'Listing, saving and attaching files is a few calls in EmbedPDF, in the browser or in Node.',
    filename: 'attachments.ts',
    code: `import { localEngine } from '@embedpdf/engine';

const engine = localEngine();
const doc = await engine.open({ kind: 'bytes', bytes });

const { attachments } = await doc.attachments.list();
const data = await doc.attachments.download(attachments[0].ref);
await doc.attachments.create({ data: file }); // a File the user picked`,
    docs: { label: 'Read about attachments', href: '/docs/engine/documents/attachments' },
  },
};
