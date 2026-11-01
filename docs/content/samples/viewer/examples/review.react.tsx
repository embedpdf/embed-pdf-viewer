import { useState } from 'react';
import {
  Panel,
  PDFViewer,
  ToolbarItem,
  type Viewer,
  type ViewerConfig,
} from '@embedpdf/viewer-react';

import './review.css';

// [!doc-source proposal]
const proposal = '/pdfs/proposal.pdf';
// [!/doc-source]

type Status = 'review' | 'approved' | 'changes';

const STATUS: Record<Status, string> = {
  review: 'In review',
  approved: 'Approved',
  changes: 'Changes requested',
};

// What the reviewer checks before a verdict, in the Checklist panel.
const CHECKS = [
  'The problem is stated clearly',
  'The phases and weeks add up',
  'Each open question has an owner',
  'Every review note has an answer',
];

// The review's look, words, tools and layout.
const design: ViewerConfig = {
  theme: {
    preference: 'light',
    accent: '#4f46e5',
    tokens: {
      background: '#eef0f4',
      surface: '#ffffff',
      'surface-raised': '#ffffff',
      text: '#161a23',
      'text-muted': '#5d6474',
      border: '#dde1e8',
      hover: '#f0f2f6',
      canvas: '#363c4a',
      radius: '8px',
      font: '"Avenir Next", Avenir, "Segoe UI", system-ui, sans-serif',
    },
  },
  icons: {
    approve: [
      'M14 3v4a1 1 0 0 0 1 1h4',
      'M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z',
      'M9 15l2 2l4 -4',
    ],
    requestChanges: [
      'M14 3v4a1 1 0 0 0 1 1h4',
      'M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z',
      'M10 18l5 -5a1.414 1.414 0 0 0 -2 -2l-5 5v2h2z',
    ],
    checklist: [
      'M3.5 5.5l1.5 1.5l2.5 -2.5',
      'M3.5 11.5l1.5 1.5l2.5 -2.5',
      'M3.5 17.5l1.5 1.5l2.5 -2.5',
      'M11 6l9 0',
      'M11 12l9 0',
      'M11 18l9 0',
    ],
  },
  // The words of a review.
  strings: {
    en: {
      'acme.reviewNotes': 'Review notes',
      'tool:note': 'Review note',
      'annotation:comment': 'Review note',
      'tool:strikeout': 'Suggest a deletion',
      'tool:insert-text': 'Suggest an insertion',
      'tool:replace-text': 'Suggest a replacement',
    },
  },
  // What a review doesn't need.
  disable: [
    'shapes',
    'stamps',
    'signatures',
    'forms',
    'redaction',
    'measurement',
    'attachments',
    'pages',
  ],
  // Deletions in red, suggestions in the review's own color.
  plugins: {
    annotation: {
      tools: [
        { id: 'highlight', defaults: { color: '#ffcd45' } },
        { id: 'underline', defaults: { color: '#30a46c' } },
        { id: 'strikeout', defaults: { color: '#e5484d' } },
        { id: 'insert-text', defaults: { color: '#4f46e5' } },
        { id: 'replace-text', defaults: { color: '#4f46e5' } },
      ],
    },
  },
  layout: (layout, env) =>
    layout
      // Your own bars take the place of the toolbar and the mode bars along it.
      .removeBar('main')
      .removeBar('annotate')
      .removeBar('shapes')
      .removeBar('insert')
      .removeBar('form')
      .removeBar('redact')
      .removeBar('measure')
      // The review bar: the document and its status, then the verdict.
      .addBar('review', {
        place: 'top',
        start: [
          env.size === 'compact'
            ? [{ custom: 'status' }]
            : [{ custom: 'title' }, { custom: 'status' }],
        ],
        end: [
          { items: ['document:print', 'document:download'], importance: 2 },
          ['panel:comments'],
          {
            items: [
              { command: 'acme:request-changes', variants: ['icon+label', 'icon'] },
              { command: 'acme:approve', variants: ['icon+label', 'icon'] },
            ],
            importance: 5,
          },
        ],
      })
      // The review tools on a rail, and the panels on its side at its end.
      .addBar('tools', {
        place: env.size === 'compact' ? 'bottom' : 'start',
        start: [
          ['tool:pointer', 'tool:pan'],
          ['tool:note', 'tool:highlight', 'tool:underline', 'tool:strikeout'],
          ['tool:insert-text', 'tool:replace-text'],
          ['history:undo', 'history:redo'],
        ],
        end: [['panel:checklist', 'panel:thumbnails', 'panel:search']],
      })
      // Zoom joins the page number, floating over the pages.
      .add({ custom: 'zoom' }, { to: 'pager', section: 'center' })
      .addPanel('checklist', { side: 'start', title: 'Checklist', icon: 'checklist' })
      // The right side is the review notes': search and style open on the left.
      .panel('search', { side: 'start' })
      .panel('style', { side: 'start' })
      .panels({ present: { medium: 'dock' } })
      .panel('comments', { titleKey: 'acme.reviewNotes', width: 340 }),
};

export default function App() {
  const [status, setStatus] = useState<Status>('review');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [done, setDone] = useState<string[]>([]);

  // Read once, when the viewer starts: the commands keep these setters.
  const [config] = useState(
    (): ViewerConfig => ({
      ...design,
      commands: [
        {
          id: 'acme:approve',
          label: 'Approve',
          icon: 'approve',
          shortcut: 'Mod+Enter',
          run: () => setStatus('approved'),
        },
        {
          id: 'acme:request-changes',
          label: 'Request changes',
          icon: 'requestChanges',
          // The status, then the note tool, to say what should change.
          run: ({ viewer }) => {
            setStatus('changes');
            void viewer.commands.execute('tool:note');
          },
        },
      ],
    }),
  );

  function onReady(viewer: Viewer) {
    viewer.documents.onOpened(async ({ documentId }) => {
      const opened = viewer.forDocument(documentId);
      // The review notes are open from the start.
      opened.get('shell').open('comments');
      // The title and the author come from the PDF itself.
      const metadata = opened.get('metadata');
      await metadata.ensureLoaded();
      const fields = metadata.getSnapshot();
      setTitle(fields?.title ?? 'Untitled');
      setAuthor(fields?.author ?? '');
    });
  }

  const toggle = (check: string) =>
    setDone((done) =>
      done.includes(check) ? done.filter((item) => item !== check) : [...done, check],
    );

  return (
    <PDFViewer src={proposal} {...config} onReady={onReady} style={{ height: '100%' }}>
      <ToolbarItem id="title">
        <div className="review-title">
          <strong>{title}</strong>
          {author && <span>From {author}</span>}
        </div>
      </ToolbarItem>
      <ToolbarItem id="status">
        <span className="review-status" data-status={status}>
          {STATUS[status]}
        </span>
      </ToolbarItem>
      <Panel id="checklist">
        <div className="review-checklist">
          {CHECKS.map((check) => (
            <label key={check} className="review-check">
              <input
                type="checkbox"
                checked={done.includes(check)}
                onChange={() => toggle(check)}
              />
              {check}
            </label>
          ))}
          <p className="review-count">
            {done.length} of {CHECKS.length} done
          </p>
        </div>
      </Panel>
    </PDFViewer>
  );
}
