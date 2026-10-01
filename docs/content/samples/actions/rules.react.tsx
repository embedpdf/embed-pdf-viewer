import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import {
  actionsPlugin,
  useActions,
  useActionsEvent,
  useActionsSettings,
  useActionsUiAdapter,
  type ActionContext,
  type ActionOrigin,
  type ActionPolicyDecision,
  type PdfActionTree,
} from '@embedpdf/react/actions';
import { localEngine } from '@embedpdf/engine';

import './rules.css';

const engine = localEngine();
// Websites open only on a click, as the page's example registers it.
const plugins = [
  actionsPlugin({
    policy: { uri: { user: 'adapter', hover: 'block', lifecycle: 'block' } },
  }),
];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// A link to a website, as a PDF carries it: what getActionTree() reads from a link.
const websiteLink: PdfActionTree = {
  root: { type: 'uri', subtype: 'URI', uri: 'https://www.embedpdf.com', isMap: false, next: [] },
  incomplete: false,
  warningFlags: 0,
  warnings: [],
};

// The three ways an action can start, each as the context it runs with.
const STARTS: ReadonlyArray<{ label: string; context: ActionContext }> = [
  {
    label: 'A click',
    context: { origin: 'user', source: { kind: 'api' }, event: { scope: 'activate' } },
  },
  {
    label: 'The pointer over it',
    context: {
      origin: 'hover',
      source: { kind: 'api' },
      event: { scope: 'annotation', name: 'cursorEnter' },
    },
  },
  {
    label: 'The document opening',
    context: {
      origin: 'lifecycle',
      source: { kind: 'api' },
      event: { scope: 'document', name: 'open' },
    },
  },
];
const RULES: readonly ActionPolicyDecision[] = ['allow', 'adapter', 'report', 'block'];

// The rules for websites, changed while the app runs, and what happens when the link runs.
function WebsiteRules() {
  const actions = useActions();
  const rules = useActionsSettings((settings) => settings.policy.uri);
  const [log, setLog] = useState<string[]>([]);
  const note = (line: string) => setLog((lines) => [line, ...lines].slice(0, 6));

  // Instead of opening a tab, the adapter notes the website it was given.
  useActionsUiAdapter({ openUri: (uri) => note(`Your adapter got ${uri}`) });
  useActionsEvent(
    (capability) => capability.onDiagnosticReported,
    ({ code, action }) => note(`The ${action} action was not run: ${code}`),
  );

  const run = (context: ActionContext) => actions.execute(websiteLink, context);
  const setRule = (origin: ActionOrigin, rule: ActionPolicyDecision) =>
    actions.updateSettings({ policy: { uri: { [origin]: rule } } });

  // One click on load, so the log shows what a click does.
  const clicked = useRef(false);
  useEffect(() => {
    if (clicked.current) return;
    clicked.current = true;
    void run(STARTS[0].context);
  });

  return (
    <section className="panel">
      <ul className="starts">
        {STARTS.map(({ label, context }) => (
          <li className="start" key={context.origin}>
            <span className="start-label">
              {label} <code>{context.origin}</code>
            </span>
            <select
              className="field"
              aria-label={`The rule for ${context.origin}`}
              value={rules[context.origin]}
              onChange={(event) =>
                setRule(context.origin, event.target.value as ActionPolicyDecision)
              }
            >
              {RULES.map((rule) => (
                <option key={rule} value={rule}>
                  {rule}
                </option>
              ))}
            </select>
            <button type="button" className="button" onClick={() => run(context)}>
              Run the link
            </button>
          </li>
        ))}
      </ul>
      <div className="footer">
        <ol className="log" aria-live="polite">
          {log.map((line, index) => (
            <li key={log.length - index}>{line}</li>
          ))}
        </ol>
        <button type="button" className="button" onClick={() => actions.resetSettings()}>
          Back to the registered rules
        </button>
      </div>
    </section>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <WebsiteRules />
      </DocumentGate>
    </Viewer>
  );
}
