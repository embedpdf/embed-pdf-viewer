import { useMemo, useState } from 'react';

import { api } from '../api/client';
import type { Share, ShareIdentity } from '../api/types';
import { useStore } from '../state/store';
import { Badge, Button, Spinner, cx } from '../ui/primitives';
import { CUSTOM_ROLE_ID, DEFAULT_ROLE_ID, ROLES, materializeScopes, roleById } from './roles';
import {
  SCOPE_GROUPS,
  capabilityScopesOf,
  collabScopesOf,
  parseScopeList,
  previewCapabilities,
} from './scopes';

/**
 * Issue access to a document, as a person.
 *
 * The dialog is a controlled draft: nothing is written, fetched or minted
 * until Create. Roles fill the scope set; editing any switch drops the label
 * to Custom, because the scopes are what's real and a stale role name would
 * misdescribe them.
 */
export function ShareDialog({
  docId,
  docName,
  onClose,
  onCreated,
}: {
  docId: string;
  docName: string;
  onClose: () => void;
  onCreated: (share: Share) => void;
}) {
  const { tenantId, addShare } = useStore();
  const [name, setName] = useState('Alice');
  const [roleId, setRoleId] = useState(DEFAULT_ROLE_ID);
  const [identity, setIdentity] = useState<ShareIdentity>({
    user_id: 'alice',
    group_id: 'legal',
    groups: ['legal'],
    display_name: 'Alice',
  });
  const [sharedLayer, setSharedLayer] = useState(false);
  const [ttlMinutes, setTtlMinutes] = useState(60);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Scopes edited by hand; null means "still following the role". */
  const [override, setOverride] = useState<string[] | null>(null);

  const role = roleById(roleId);
  const materialized = useMemo(
    () => (role ? materializeScopes(role, identity) : { scopes: [], missing: undefined }),
    [role, identity],
  );
  const scopes = override ?? materialized.scopes;
  const preview = useMemo(() => previewCapabilities(scopes, identity), [scopes, identity]);

  // A per-person layer keeps annotations private over one immutable base and
  // costs nothing (an unwritten layer inherits every plane, so it shares the
  // base's URLs and needs no worker session). A shared layer is how two people
  // collaborate — same annotations, live-synced.
  const layerName = sharedLayer ? 'default' : identity.user_id || 'guest';

  const setScope = (scope: string, on: boolean) => {
    const next = new Set(scopes);
    if (on) next.add(scope);
    else next.delete(scope);
    setOverride([...next]);
    setRoleId(CUSTOM_ROLE_ID);
  };

  const pickRole = (id: string) => {
    setRoleId(id);
    setOverride(null); // back to following the preset
  };

  const blocked = !override && materialized.missing;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const share = await api.shares.create(tenantId, {
        docId,
        name: name.trim() || 'Guest',
        role: roleId,
        layerName,
        scope: scopes,
        identity,
        ttlSeconds: ttlMinutes * 60,
      });
      addShare(share);
      onCreated(share);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div
      className="bg-cp-navy/30 fixed inset-0 z-50 flex items-start justify-center overflow-auto p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="shadow-cp-navy/20 my-auto w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-cp-border flex items-baseline justify-between border-b px-6 py-4">
          <div>
            <h2 className="font-display text-cp-navy text-lg font-bold">Share document</h2>
            <p className="text-cp-muted mt-0.5 truncate text-xs">{docName}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </header>

        <div className="grid gap-6 px-6 py-5 md:grid-cols-[1.4fr_1fr]">
          <div className="space-y-5">
            <Field label="Who is this for?">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={INPUT}
                placeholder="Alice"
              />
            </Field>

            <Field label="Role">
              <div className="grid gap-2 sm:grid-cols-2">
                {ROLES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => pickRole(r.id)}
                    className={cx(
                      'rounded-xl border px-3 py-2.5 text-left transition-colors',
                      roleId === r.id
                        ? 'border-cp-blue bg-cp-blue/5 ring-cp-blue/30 ring-1'
                        : 'border-cp-border hover:border-cp-blue/40',
                    )}
                  >
                    <span className="text-cp-navy block text-[13px] font-semibold">{r.label}</span>
                    <span className="text-cp-muted mt-0.5 block text-[11px] leading-snug">
                      {r.description}
                    </span>
                  </button>
                ))}
              </div>
              {roleId === CUSTOM_ROLE_ID && (
                <p className="text-cp-muted mt-2 text-xs">
                  Custom scopes — pick a role above to start over.
                </p>
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="User ID" hint="Binds “own comments” grants">
                <input
                  value={identity.user_id ?? ''}
                  onChange={(e) => setIdentity({ ...identity, user_id: e.target.value })}
                  className={INPUT}
                />
              </Field>
              <Field label="Group" hint="Acts as, and is a member of">
                <input
                  value={identity.group_id ?? ''}
                  onChange={(e) => {
                    // Two different claims, one field: `group_id` is the group
                    // this person WRITES as, `groups` is the membership that
                    // grants authority over the group's rows. A group grant
                    // checks BOTH (see `filterMatches`), so setting only
                    // `group_id` produces a role that can't edit anything.
                    const group = e.target.value.trim();
                    setIdentity({
                      ...identity,
                      group_id: group,
                      ...(group ? { groups: [group] } : { groups: [] }),
                    });
                  }}
                  className={INPUT}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Annotation layer">
                <label className="text-cp-ink flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={sharedLayer}
                    onChange={(e) => setSharedLayer(e.target.checked)}
                  />
                  Collaborate in the shared layer
                </label>
                <p className="text-cp-muted mt-1 text-[11px]">
                  Writing to <code className="font-mono">{layerName}</code>
                  {sharedLayer
                    ? ' — comments are shared and live-sync.'
                    : ' — comments stay private.'}
                </p>
              </Field>
              <Field label="Expires in">
                <select
                  value={ttlMinutes}
                  onChange={(e) => setTtlMinutes(Number(e.target.value))}
                  className={INPUT}
                >
                  <option value={15}>15 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={60 * 24}>1 day</option>
                  <option value={60 * 24 * 7}>1 week</option>
                </select>
              </Field>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setAdvanced((v) => !v)}
                className="text-cp-blue hover:text-cp-blue-600 text-[13px] font-medium"
              >
                {advanced ? '▾' : '▸'} Advanced — raw scopes ({scopes.length})
              </button>
              {advanced && (
                <div className="border-cp-border bg-cp-bg mt-3 space-y-4 rounded-xl border p-4">
                  {SCOPE_GROUPS.map((group) => (
                    <div key={group.title}>
                      <p className="text-cp-muted mb-1.5 text-[11px] font-semibold uppercase tracking-wide">
                        {group.title}
                      </p>
                      <div className="grid gap-1 sm:grid-cols-2">
                        {group.options.map((option) => (
                          <label
                            key={option.scope}
                            className="text-cp-ink flex items-start gap-2 text-[12px]"
                            title={option.hint}
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={scopes.includes(option.scope)}
                              onChange={(e) => setScope(option.scope, e.target.checked)}
                            />
                            <span>
                              {option.label}
                              <code className="text-cp-muted ml-1 font-mono text-[10px]">
                                {option.scope}
                              </code>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div>
                    <p className="text-cp-muted mb-1.5 text-[11px] font-semibold uppercase tracking-wide">
                      Collaboration grants
                    </p>
                    <textarea
                      value={collabScopesOf(scopes).join('\n')}
                      spellCheck={false}
                      rows={3}
                      onChange={(e) => {
                        setOverride([
                          ...capabilityScopesOf(scopes),
                          ...parseScopeList(e.target.value),
                        ]);
                        setRoleId(CUSTOM_ROLE_ID);
                      }}
                      className={cx(INPUT, 'font-mono text-[11px] leading-relaxed')}
                      placeholder="annotations:update:self"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* The teaching device: predict the toolbar, then open the share and
              see you were right. Computed with the engine's own resolver. */}
          <aside className="border-cp-border bg-cp-bg h-fit rounded-xl border p-4">
            <h3 className="font-display text-cp-navy text-sm font-bold">This person can</h3>
            <ul className="mt-3 space-y-1.5">
              {preview.map((row) => (
                <li key={row.label} className="flex items-start gap-2 text-[13px]">
                  <span
                    className={cx(
                      'mt-0.5 font-semibold',
                      row.granted ? 'text-emerald-600' : 'text-cp-border',
                    )}
                  >
                    {row.granted ? '✓' : '✗'}
                  </span>
                  <span className={row.granted ? 'text-cp-ink' : 'text-cp-muted'}>
                    {row.label}
                    {row.note && (
                      <span className="text-cp-violet ml-1 text-[11px]">({row.note})</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="border-cp-border text-cp-muted mt-3 border-t pt-3 text-[11px] leading-snug">
              Computed with the engine's own scope resolver — the same predicate the server enforces
              with.
            </p>
          </aside>
        </div>

        <footer className="border-cp-border bg-cp-bg flex items-center gap-3 border-t px-6 py-4">
          {blocked ? (
            <Badge tone="amber">
              {role?.label} needs an identity {String(materialized.missing).replace('_', ' ')}
            </Badge>
          ) : (
            <span className="text-cp-muted text-xs">
              Mints a doc-scoped JWT for layer <code className="font-mono">{layerName}</code>
            </span>
          )}
          {error && <span className="text-xs text-red-600">{error}</span>}
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || !!blocked} onClick={() => void submit()}>
            {busy && <Spinner className="h-4 w-4" />}
            Create share
          </Button>
        </footer>
      </div>
    </div>
  );
}

const INPUT =
  'w-full rounded-lg border border-cp-border bg-white px-3 py-2 text-[13px] text-cp-ink outline-none focus:border-cp-blue';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-2">
        <span className="text-cp-navy text-[13px] font-semibold">{label}</span>
        {hint && <span className="text-cp-muted text-[11px]">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
