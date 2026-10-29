/**
 * What a grant asks for before its document opens or changes: its passphrase, or who the
 * visitor is.
 *
 *   an `error` tab with a `grantRequest` → <GrantPrompt/>, which opens it again with the answer
 *     (`documents.retry(id, { passphrase })` or `{ identity }`)
 *   a ready document with a `grantRequest` (the grant got it after the document opened) → the
 *     same <GrantPrompt/> over it, and `retry` with the answer lets it go on
 *   a ready document with an `identityRequest` (a change waits) → <VisitorIdentityDialog/>, which
 *     answers for the changes waiting (`documents.identify`) or lets them go (`declineIdentity`)
 *
 * The answers are the grant owner's to collect: the form shows their purpose and privacy notice,
 * and says the answers can't be changed later (a visitor who mistyped starts over).
 */
import { useT } from '@embedpdf/react/i18n';
import {
  useDocument,
  useDocumentId,
  useDocuments,
  useDocumentsState,
  type VisitorAnswers,
  type VisitorIdentityRequest,
} from '@embedpdf/react/runtime';
import { useId, useState, type FormEvent } from 'react';

import { Dialog } from './dialog';
import { Icon } from './icons';

type Field = keyof VisitorAnswers;

/** The fields in the order the form asks them. */
const FIELDS: readonly Field[] = [
  'displayName',
  'email',
  'title',
  'organization',
  'organizationalUnit',
];

/** What the browser may fill each field with. */
const AUTOCOMPLETE: Record<Field, string> = {
  displayName: 'name',
  email: 'email',
  title: 'organization-title',
  organization: 'organization',
  organizationalUnit: 'off',
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The answers the server would refuse, so the form says so before sending them. */
function invalidAnswers(answers: VisitorAnswers): Field[] {
  return FIELDS.filter((field) => {
    const value = answers[field]?.trim();
    if (!value) return false;
    if (field === 'email') return value.length > 254 || !EMAIL.test(value);
    return value.length > 256;
  });
}

const asked = (request: VisitorIdentityRequest): Field[] =>
  FIELDS.filter((field) => request.fields[field] !== undefined);

/** Whether every required field has an answer. */
const complete = (request: VisitorIdentityRequest, answers: VisitorAnswers): boolean =>
  asked(request).every(
    (field) => request.fields[field] !== 'required' || Boolean(answers[field]?.trim()),
  );

/** The answers given, trimmed, without the empty ones. */
function given(answers: VisitorAnswers): VisitorAnswers {
  const out: VisitorAnswers = {};
  for (const field of FIELDS) {
    const value = answers[field]?.trim();
    if (value) out[field] = value;
  }
  return out;
}

const INPUT_CLASS =
  'bg-surface border-border focus:border-accent focus:ring-accent text-fg placeholder:text-fg-muted block w-full rounded-md border px-3 py-2.5 text-sm focus:outline-none focus:ring-1 disabled:opacity-50';
const SECONDARY_CLASS =
  'border-border text-fg-secondary hover:bg-hover flex-1 cursor-pointer rounded-md border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50';
const PRIMARY_CLASS =
  'bg-accent text-on-accent flex-1 cursor-pointer rounded-md px-4 py-2.5 text-sm font-medium transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';

/** The grant's questions: its fields, its owner's purpose and privacy notice, and what answering means. */
function VisitorQuestions({
  request,
  answers,
  onChange,
  invalid,
  disabled,
}: {
  request: VisitorIdentityRequest;
  answers: VisitorAnswers;
  onChange: (answers: VisitorAnswers) => void;
  invalid: readonly Field[];
  disabled: boolean;
}) {
  const t = useT();
  const id = useId();
  const fields = asked(request);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-fg-secondary text-sm">{t('grantPrompt.asks')}</p>
      {request.purpose && (
        <p className="bg-surface-alt text-fg rounded-md p-3 text-sm">{request.purpose}</p>
      )}
      {fields.map((field, index) => {
        const inputId = `${id}-${field}`;
        const wrong = invalid.includes(field);
        return (
          <div key={field}>
            <label className="text-fg mb-1.5 block text-sm font-medium" htmlFor={inputId}>
              {t(`grantPrompt.fields.${field}`)}
              {request.fields[field] === 'optional' && (
                <span className="text-fg-muted font-normal"> ({t('grantPrompt.optional')})</span>
              )}
            </label>
            <input
              id={inputId}
              type={field === 'email' ? 'email' : 'text'}
              autoComplete={AUTOCOMPLETE[field]}
              value={answers[field] ?? ''}
              onChange={(event) => onChange({ ...answers, [field]: event.target.value })}
              disabled={disabled}
              required={request.fields[field] === 'required'}
              aria-invalid={wrong || undefined}
              aria-describedby={wrong ? `${inputId}-invalid` : undefined}
              className={INPUT_CLASS}
              autoFocus={index === 0}
            />
            {wrong && (
              <p id={`${inputId}-invalid`} className="mt-1 text-sm text-red-500">
                {t(field === 'email' ? 'grantPrompt.invalidEmail' : 'grantPrompt.invalid')}
              </p>
            )}
          </div>
        );
      })}
      <div className="text-fg-muted flex flex-col gap-1 text-xs">
        {request.fields.displayName !== undefined && <p>{t('grantPrompt.shownOnChanges')}</p>}
        <p>{t('grantPrompt.final')}</p>
        {request.privacyUrl && (
          <a
            href={request.privacyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent self-start underline"
          >
            {t('grantPrompt.privacy')}
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * A document from a grant that waits for the grant's passphrase or the visitor's answers,
 * before it opens or to go on: the pane asks, and `retry` with what's given opens it again or
 * lets it go on.
 */
export function GrantPrompt() {
  const docId = useDocumentId();
  const docs = useDocumentsState((state) => state.documents);
  const doc = docs.find((documentInfo) => documentInfo.id === docId);
  const request = doc?.grantRequest;
  if (!docId || !doc || !request) return null;
  return (
    <div className="bg-app flex h-full w-full items-center justify-center overflow-auto p-8">
      <div className="bg-surface border-border w-full max-w-sm rounded-xl border p-6 shadow-lg">
        {request.kind === 'passphrase' ? (
          <PassphraseForm
            docId={docId}
            name={doc.name}
            passphraseProvided={request.passphraseProvided}
          />
        ) : (
          <IdentityForm docId={docId} name={doc.name} request={request.request} />
        )}
      </div>
    </div>
  );
}

function Heading({ title, name }: { title: string; name: string | undefined }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="bg-accent-light mb-4 rounded-full p-4">
        <Icon name="lock" size={28} className="text-accent" />
      </div>
      <h3 className="text-fg text-lg font-semibold">{title}</h3>
      {name && <p className="text-fg-muted mt-1 text-sm">{name}</p>}
    </div>
  );
}

function PassphraseForm({
  docId,
  name,
  passphraseProvided,
}: {
  docId: string;
  name: string | undefined;
  passphraseProvided: boolean;
}) {
  const { retry, close } = useDocuments();
  const t = useT();
  const id = useId();
  const [passphrase, setPassphrase] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!passphrase) return;
    // Before it opens, the tab shows it loading at once, and this pane again if the passphrase
    // is wrong; over an open document this pane stays, so a wrong one is cleared.
    void retry(docId, { passphrase }).catch(() => setPassphrase(''));
  };
  return (
    <form onSubmit={submit}>
      <Heading title={t('grantPrompt.passphraseTitle')} name={name} />
      <p className="text-fg-secondary mt-4 text-center text-sm">
        {passphraseProvided
          ? t('grantPrompt.passphraseIncorrect')
          : t('grantPrompt.passphraseRequired')}
      </p>
      <div className="mt-5">
        <label className="text-fg mb-1.5 block text-sm font-medium" htmlFor={id}>
          {t('grantPrompt.passphraseLabel')}
        </label>
        <input
          id={id}
          type="password"
          autoComplete="off"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          className={INPUT_CLASS}
          autoFocus
        />
      </div>
      <div className="mt-6 flex gap-3">
        <button type="button" onClick={() => void close(docId)} className={SECONDARY_CLASS}>
          {t('grantPrompt.cancel')}
        </button>
        <button type="submit" disabled={!passphrase} className={PRIMARY_CLASS}>
          {t('grantPrompt.open')}
        </button>
      </div>
    </form>
  );
}

function IdentityForm({
  docId,
  name,
  request,
}: {
  docId: string;
  name: string | undefined;
  request: VisitorIdentityRequest;
}) {
  const { retry, close } = useDocuments();
  const t = useT();
  const [answers, setAnswers] = useState<VisitorAnswers>({});
  const [checked, setChecked] = useState(false);
  const invalid = checked ? invalidAnswers(answers) : request.invalid;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setChecked(true);
    if (!complete(request, answers) || invalidAnswers(answers).length > 0) return;
    void retry(docId, { identity: given(answers) }).catch(() => {});
  };
  return (
    <form onSubmit={submit} noValidate>
      <Heading title={t('grantPrompt.openTitle')} name={name} />
      <div className="mt-5">
        <VisitorQuestions
          request={request}
          answers={answers}
          onChange={setAnswers}
          invalid={invalid}
          disabled={false}
        />
      </div>
      <div className="mt-6 flex gap-3">
        <button type="button" onClick={() => void close(docId)} className={SECONDARY_CLASS}>
          {t('grantPrompt.cancel')}
        </button>
        <button type="submit" disabled={!complete(request, answers)} className={PRIMARY_CLASS}>
          {t('grantPrompt.open')}
        </button>
      </div>
    </form>
  );
}

/**
 * A change waits for the visitor's answers to what the grant asks before the first change:
 * answering sends it (and every change after it); Not now lets it go, and the next change asks
 * again.
 */
export function VisitorIdentityDialog() {
  const docId = useDocumentId();
  const request = useDocument((document) => document.identityRequest);
  const { identify, declineIdentity } = useDocuments();
  const t = useT();
  const titleId = useId();
  const [answers, setAnswers] = useState<VisitorAnswers>({});
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!docId || !request) return null;
  const invalid = checked ? invalidAnswers(answers) : request.invalid;
  const decline = () => {
    if (!busy) declineIdentity(docId);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setChecked(true);
    if (busy || !complete(request, answers) || invalidAnswers(answers).length > 0) return;
    setBusy(true);
    try {
      // Answered: the request goes, and this dialog with it. Refused: the request says why.
      await identify(docId, given(answers));
    } catch {
      setChecked(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      labelledBy={titleId}
      onClose={decline}
      className="bg-surface border-border w-full max-w-sm rounded-xl border p-6 shadow-lg"
    >
      <form onSubmit={(event) => void submit(event)} noValidate>
        <h3 id={titleId} className="text-fg text-lg font-semibold">
          {t('grantPrompt.changeTitle')}
        </h3>
        <div className="mt-4">
          <VisitorQuestions
            request={request}
            answers={answers}
            onChange={setAnswers}
            invalid={invalid}
            disabled={busy}
          />
        </div>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={decline} disabled={busy} className={SECONDARY_CLASS}>
            {t('grantPrompt.notNow')}
          </button>
          <button
            type="submit"
            disabled={busy || !complete(request, answers)}
            className={PRIMARY_CLASS}
          >
            {busy ? t('grantPrompt.saving') : t('grantPrompt.continue')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
