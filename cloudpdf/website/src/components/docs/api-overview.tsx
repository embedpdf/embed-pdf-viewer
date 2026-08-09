import Link from 'next/link';
import { createHighlighter } from 'shiki';

import {
  getApiGroups,
  getGrantIndex,
  getOperationCount,
  getSdkLanguages,
  getSecurityScheme,
} from '@/lib/api-reference';

import { MethodBadge, methodStyle } from './method-badge';
import { Tabs } from './tabs';

/**
 * Overview surfaces for the API reference. Every list here is derived
 * from the committed OpenAPI document — resource groups from
 * `x-docs-groups`, credential names from the security schemes, and the
 * capability tables by inverting each operation's `x-required-*`. A new
 * operation or group in the contract shows up here with no edit.
 */

const CARD = 'border-cp-border overflow-hidden rounded-[14px] border bg-white';

const installHighlighter = createHighlighter({
  themes: ['material-theme-palenight'],
  langs: ['sh', 'groovy'],
});

/**
 * Install commands per SDK, sharing the reference's language switcher —
 * so choosing a language here also settles every operation page's
 * examples, and arriving from the docs landing lands on your language.
 */
export async function ApiInstall() {
  const languages = getSdkLanguages();
  const highlighter = await installHighlighter;
  const blocks = languages.map((language) => ({
    ...language,
    html: highlighter.codeToHtml(language.install, {
      lang: language.installFence,
      theme: 'material-theme-palenight',
    }),
  }));

  return (
    <Tabs items={blocks.map((block) => block.label)} storageKey="cloudpdf-sdk-language">
      {blocks.map((block) => (
        <div
          key={block.language}
          className="[&_.shiki]:!m-0 [&_.shiki]:overflow-x-auto [&_.shiki]:!bg-[#0E1A40] [&_.shiki]:px-[18px] [&_.shiki]:py-[17px] [&_.shiki]:font-mono [&_.shiki]:text-[13px] [&_.shiki]:leading-[1.8]"
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      ))}
    </Tabs>
  );
}

/** The reference's resource groups, each listing the operations it holds. */
export function ApiResources() {
  const groups = getApiGroups().filter((group) => group.operations.length > 0);

  return (
    <div className="mt-6 grid gap-3.5 sm:grid-cols-2">
      {groups.map((group) => (
        <div key={group.key} className={`${CARD} flex flex-col`}>
          <div className="border-cp-borderSoft flex items-baseline gap-2 border-b bg-[#F8FAFE] px-4 py-3">
            <span className="font-display text-cp-navy text-[14.5px] font-bold">{group.title}</span>
            <span className="text-cp-muted font-sans text-[12.5px]">
              {group.operations.length} {group.operations.length === 1 ? 'operation' : 'operations'}
            </span>
            {group.operatorOnly ? (
              <span className="border-cp-border text-cp-muted ml-auto rounded border bg-white px-1.5 py-px font-sans text-[10.5px] font-bold">
                Self-hosted
              </span>
            ) : null}
          </div>
          <div className="divide-cp-borderSoft divide-y">
            {group.operations.map((operation) => (
              <Link
                key={operation.operationId}
                href={operation.href}
                className="hover:bg-cp-surface/50 flex items-center gap-2.5 px-4 py-2.5 no-underline transition-colors"
              >
                <MethodBadge method={operation.method} />
                <span className="text-cp-ink hover:text-cp-blue min-w-0 flex-1 font-sans text-[14px]">
                  {operation.title}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ApiOperationCount() {
  return <>{getOperationCount()}</>;
}

const CREDENTIAL_ORDER = ['apiToken', 'tenantToken', 'docToken'] as const;

const CREDENTIAL_HOLDER: Record<string, string> = {
  apiToken: 'Your server environment',
  tenantToken: 'Your backend',
  docToken: "The end user's browser",
};

/**
 * The three credentials as a ladder. Authority mints only downward, and
 * each rung's blast radius shrinks as it moves closer to the browser —
 * the one idea that makes every per-operation auth rule obvious.
 */
export function ApiCredentials() {
  return (
    <div className="mt-6 space-y-3">
      {CREDENTIAL_ORDER.map((name, index) => {
        const scheme = getSecurityScheme(name);
        if (!scheme) return null;
        return (
          <div key={name} className={`${CARD} flex gap-4 px-4 py-4`}>
            <span className="bg-cp-surface text-cp-blue font-display mt-px inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg text-[13px] font-extrabold">
              {index + 1}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span className="font-display text-cp-navy text-[14.5px] font-bold">
                  {scheme['x-docs-title'] ?? name}
                </span>
                <span className="text-cp-muted font-sans text-[12.5px]">
                  {CREDENTIAL_HOLDER[name]}
                </span>
              </div>
              <p className="text-cp-muted mt-1 max-w-[68ch] font-sans text-[14.5px] leading-[1.6]">
                {scheme.description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Inverts the per-operation grants: one row per capability (or tenant
 * scope) listing what it unlocks, so choosing the scopes for a token is
 * one lookup instead of twenty operation pages.
 */
export function ApiGrants({ kind }: { kind: 'capability' | 'scope' }) {
  const grants = getGrantIndex(
    kind === 'capability' ? 'x-required-capability' : 'x-required-scope',
  ).filter((entry) => entry.grant !== '');

  return (
    <div className={`mt-6 ${CARD}`}>
      <div className="divide-cp-borderSoft divide-y">
        {grants.map(({ grant, operations }) => (
          <div key={grant} className="grid gap-2 px-4 py-3.5 sm:grid-cols-[minmax(190px,0.4fr)_1fr]">
            <div>
              <code>{grant}</code>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              {operations.map((operation) => (
                <Link
                  key={operation.href}
                  href={operation.href}
                  className={`rounded border px-2 py-px font-sans text-[12.5px] font-semibold no-underline transition-opacity hover:opacity-80 ${methodStyle(operation.method)}`}
                >
                  {operation.title}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
