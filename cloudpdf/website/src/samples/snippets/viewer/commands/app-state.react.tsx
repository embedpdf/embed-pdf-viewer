import { useState } from 'react';
import { PDFViewer, type ViewerConfig } from '@cloudpdf/viewer-react';

const CHECKS = ['Parties', 'Dates', 'Payment', 'Signatures'];

interface Review {
  done: string[];
  status: 'review' | 'approved';
  approve(): void;
}

// A constant: the commands read your state from `appState`, so nothing goes stale.
const config: ViewerConfig<Review> = {
  commands: [
    {
      id: 'acme:approve',
      label: 'Approve',
      icon: 'check',
      enabled: ({ appState }) => appState.done.length === CHECKS.length,
      active: ({ appState }) => appState.status === 'approved',
      run: ({ appState }) => appState.approve(),
    },
  ],
  layout: (layout) => layout.add('acme:approve', { to: 'main', section: 'end' }),
};

export function ReviewApp() {
  const [done, setDone] = useState<string[]>([]);
  const [status, setStatus] = useState<Review['status']>('review');

  const toggle = (check: string) =>
    setDone((done) => (done.includes(check) ? done.filter((c) => c !== check) : [...done, check]));

  return (
    <>
      <fieldset>
        {CHECKS.map((check) => (
          <label key={check}>
            <input type="checkbox" checked={done.includes(check)} onChange={() => toggle(check)} />
            {check}
          </label>
        ))}
      </fieldset>
      <PDFViewer
        src={{ grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' }}
        {...config}
        appState={{ done, status, approve: () => setStatus('approved') }}
        style={{ height: '100vh' }}
      />
    </>
  );
}
