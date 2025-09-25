import React from 'react'
import { FAQItem } from '../shared/faq'

export const outlineFAQs: FAQItem[] = [
  {
    id: 'outline-1',
    question: 'What are PDF bookmarks/outlines?',
    answer: (
      <div>
        <p>
          PDF bookmarks (also called outlines) are a navigation feature that
          creates a clickable table of contents for your PDF document. They
          appear in the navigation pane of PDF readers and allow users to
          quickly jump to specific sections.
        </p>
        <p className="mt-2">
          Think of them like the table of contents in a book, but interactive –
          clicking on a bookmark takes you directly to that page or section.
        </p>
      </div>
    ),
    category: 'General',
  },
  {
    id: 'outline-2',
    question: 'How do I add bookmarks to my PDF?',
    answer: (
      <div>
        <p>Adding bookmarks is simple:</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Click the &quot;Add Bookmark&quot; button to create a new bookmark
          </li>
          <li>Enter a descriptive title for the bookmark</li>
          <li>Select which page it should link to</li>
          <li>Click the checkmark to save</li>
        </ol>
        <p className="mt-2">
          You can also create nested bookmarks by clicking the plus icon next to
          an existing bookmark to add a child bookmark.
        </p>
      </div>
    ),
    category: 'Editing',
  },
  {
    id: 'outline-3',
    question: 'Can I reorganize existing bookmarks?',
    answer:
      'Yes! You can drag and drop bookmarks to reorder them within the same level. You can also edit any bookmark by clicking the edit icon, or delete bookmarks you no longer need.',
    category: 'Editing',
  },
  {
    id: 'outline-4',
    question: 'What happens to my original PDF file?',
    answer:
      'Your original PDF file remains unchanged. When you save your edits, the tool creates a new PDF file with the updated bookmarks. The original file stays intact on your device.',
    category: 'General',
  },
  {
    id: 'outline-5',
    question: 'Can I create nested/hierarchical bookmarks?',
    answer:
      'Absolutely! Click the plus icon next to any bookmark to add a child bookmark. This creates a hierarchical structure that can be expanded or collapsed, perfect for organizing complex documents with chapters and subsections.',
    category: 'Editing',
  },
  {
    id: 'outline-6',
    question: 'Will my bookmarks work in all PDF readers?',
    answer:
      'Yes, the bookmarks created with this tool are standard PDF bookmarks that work in all major PDF readers including Adobe Acrobat, web browsers, Preview (Mac), and mobile PDF apps.',
    category: 'Technical',
  },
  {
    id: 'outline-7',
    question: 'Can I remove all bookmarks at once?',
    answer:
      'Yes, there\'s a "Delete All" button that will remove all bookmarks from the document. Be careful though – this action cannot be undone unless you reset your changes before saving.',
    category: 'Editing',
  },
  {
    id: 'outline-8',
    question: 'Are my files secure? Do you keep my data?',
    answer:
      'We prioritize your privacy and security. Your files are processed directly in your browser using WebAssembly technology. They are never uploaded to our servers, so your data remains completely private and under your control.',
    category: 'Security',
  },
  {
    id: 'outline-9',
    question: 'What browsers are supported?',
    answer:
      'This tool works on all modern browsers that support WebAssembly, including Chrome, Firefox, Safari, and Edge. For the best experience, we recommend using the latest version of your browser.',
    category: 'Technical',
  },
  {
    id: 'outline-10',
    question: 'Is there a limit to how many bookmarks I can add?',
    answer:
      "There are no artificial limits on the number of bookmarks you can create. The only practical limit would be your browser's memory capacity, but even very large bookmark structures (hundreds or thousands of bookmarks) should work without issues.",
    category: 'Technical',
  },
]
