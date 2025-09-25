import React from 'react'
import { FAQItem } from '../shared/faq'

export const attachmentFAQs: FAQItem[] = [
  {
    id: 'attachment-1',
    question: 'What are PDF attachments?',
    answer: (
      <div>
        <p>
          PDF attachments are files embedded within a PDF document, similar to
          email attachments. They allow you to bundle related files together
          with your main PDF document.
        </p>
        <p className="mt-2">
          For example, you might attach spreadsheets to a report, source images
          to a design document, or supporting documents to a contract.
          Recipients can extract and save these attached files when they open
          the PDF.
        </p>
      </div>
    ),
    category: 'General',
  },
  {
    id: 'attachment-2',
    question: 'What types of files can I attach to a PDF?',
    answer:
      'You can attach any type of file to a PDF document – there are no restrictions on file types. Common attachments include Excel spreadsheets (.xlsx), Word documents (.docx), images (.jpg, .png), text files (.txt), CSV files, ZIP archives, and even other PDFs.',
    category: 'General',
  },
  {
    id: 'attachment-3',
    question: 'How do I add an attachment to my PDF?',
    answer: (
      <div>
        <p>Adding attachments is simple:</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Click the &quot;Add Attachment&quot; button</li>
          <li>Select or drag and drop the file you want to attach</li>
          <li>
            Give the attachment a descriptive name (this is what users will see
            in the PDF)
          </li>
          <li>Optionally add a description</li>
          <li>Click &quot;Add Attachment&quot; to confirm</li>
        </ol>
        <p className="mt-2">
          After adding attachments, remember to click &quot;Save Changes&quot;
          to create your updated PDF.
        </p>
      </div>
    ),
    category: 'Usage',
  },
  {
    id: 'attachment-4',
    question: 'Can I rename attachments without changing the actual file?',
    answer:
      "Yes! The attachment name shown in the PDF can be different from the original filename. When you add an attachment, you can specify any name you want – this is purely for display purposes within the PDF and doesn't modify the actual attached file.",
    category: 'Usage',
  },
  {
    id: 'attachment-5',
    question: 'How do recipients access the attached files?',
    answer: (
      <div>
        <p>Recipients can access attachments in most PDF viewers by:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Looking for a paperclip icon or attachments panel in their PDF
            reader
          </li>
          <li>
            Going to View → Navigation Panels → Attachments (in Adobe Reader)
          </li>
          <li>
            Right-clicking on attachment icons if they appear in the document
          </li>
        </ul>
        <p className="mt-2">
          Once found, they can open, save, or extract the attached files to
          their computer.
        </p>
      </div>
    ),
    category: 'General',
  },
  {
    id: 'attachment-6',
    question: 'What happens to the original PDF when I modify attachments?',
    answer:
      'Your original PDF file remains unchanged. When you save your edits, the tool creates a new PDF file with the updated attachments. The original file stays intact on your device.',
    category: 'General',
  },
  {
    id: 'attachment-7',
    question: 'Is there a limit to how many files I can attach?',
    answer:
      "There's no hard limit on the number of attachments, but keep in mind that each attachment increases the PDF file size. Very large attachments or many attachments can make your PDF unwieldy. Consider the total file size and whether recipients will be able to easily handle the resulting PDF.",
    category: 'Technical',
  },
  {
    id: 'attachment-8',
    question: 'Can I attach password-protected or encrypted files?',
    answer:
      'Yes, you can attach password-protected or encrypted files. The files are embedded as-is, maintaining their protection. Recipients will need the appropriate passwords or keys to open these attached files after extracting them from the PDF.',
    category: 'Technical',
  },
  {
    id: 'attachment-9',
    question: "Why can't I add an attachment with the same name?",
    answer:
      "PDF specifications require unique attachment names within a document. If you try to add an attachment with a name that already exists, you'll get an error. Simply use a slightly different name (like adding a number or date) to distinguish between similar attachments.",
    category: 'Usage',
  },
  {
    id: 'attachment-10',
    question: 'Are my attachments compressed in the PDF?',
    answer:
      "The PDF format supports compression for embedded files, and our tool automatically applies appropriate compression when saving. However, files that are already compressed (like ZIP files or JPEGs) won't benefit much from additional compression.",
    category: 'Technical',
  },
  {
    id: 'attachment-11',
    question: 'Will attachments work in all PDF readers?',
    answer:
      'PDF attachments are a standard PDF feature supported by all major PDF readers including Adobe Acrobat, web browsers, Preview (Mac), and mobile PDF apps. However, some very basic or older PDF viewers might not provide easy access to attachments.',
    category: 'Technical',
  },
  {
    id: 'attachment-12',
    question: 'Are my files secure? Do you keep my data?',
    answer:
      'We prioritize your privacy and security. Your files and their attachments are processed directly in your browser using WebAssembly technology. They are never uploaded to our servers, so your data remains completely private and under your control.',
    category: 'Security',
  },
]
