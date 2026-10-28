'use client';

import { useState, type FormEvent } from 'react';

/** A file's password, asked where the file is shown; `purpose` says what it opens the file for. */
export function UnlockForm({
  state,
  name,
  purpose,
  onUnlock,
}: {
  state: { readonly incorrect: boolean; readonly trying: boolean };
  name: string;
  purpose: string;
  onUnlock: (password: string) => void;
}) {
  const [password, setPassword] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password) onUnlock(password);
  };
  return (
    <form onSubmit={submit} className="mt-2 flex flex-col gap-1.5">
      <span className="text-ep-ink font-sans text-[13px] font-semibold">{purpose}</span>
      <span className="flex flex-wrap gap-2">
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="off"
          aria-label={`Password for ${name}`}
          aria-invalid={state.incorrect}
          placeholder="Password"
          className={`h-9 w-[min(200px,100%)] rounded-lg border bg-white px-2.5 font-sans text-sm outline-none ${
            state.incorrect ? 'border-[#B42318]' : 'border-ep-border focus:border-ep-blue'
          }`}
        />
        <button
          type="submit"
          disabled={!password || state.trying}
          className="bg-ep-navy inline-flex h-9 items-center rounded-lg px-3.5 font-sans text-sm font-bold text-white transition-opacity disabled:opacity-50"
        >
          {state.trying ? 'Unlocking…' : 'Unlock'}
        </button>
      </span>
      {state.incorrect && (
        <span role="alert" className="font-sans text-[13px] font-semibold text-[#B42318]">
          That password didn’t work. Try again.
        </span>
      )}
    </form>
  );
}
