/**
 * Svelte 5.56 changed the `exclude` argument of the private `rest_props` runtime helper from an
 * array (`exclude.includes(key)`) to a Set (`exclude.has(key)`). We publish the Svelte entry points
 * precompiled, so output built against one side of that change throws on the other —
 * `TypeError: exclude.has is not a function` on >= 5.56, `exclude.includes is not a function` on
 * < 5.56 — for every consumer in our `svelte: ">=5 <6"` peer range.
 *
 * Routing the call through a wrapper that passes a Set carrying an `includes` alias satisfies both
 * runtimes from a single build. The non-legacy handler only ever reads `exclude` through those two
 * methods, so nothing else needs to be emulated.
 */
import MagicString from 'magic-string';
import type { Plugin } from 'vite';

const SVELTE_MODULE = /\.svelte(?:\?|$)/;
const INTERNAL_NAMESPACE =
  /import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from\s*['"]svelte\/internal\/client['"]/;

const HELPER = '$$rest_props_compat';

const helper = (namespace: string) => `
function ${HELPER}(props, exclude, name) {
	// svelte < 5.56 reads \`exclude\` as an array (\`exclude.includes(key)\`), >= 5.56 as a Set
	// (\`exclude.has(key)\`). We publish precompiled components, so hand the runtime a value that
	// answers both and keep a single build valid across the whole \`svelte: ">=5 <6"\` peer range.
	const set = exclude instanceof Set ? exclude : new Set(exclude);
	if (typeof set.includes !== 'function') set.includes = Set.prototype.has.bind(set);
	return ${namespace}.rest_props(props, set, name);
}
`;

/**
 * Routes compiled `rest_props` calls through a wrapper that normalises the `exclude` argument.
 * Returns `null` when the module has no call to rewrite.
 *
 * Exported so the rewrite can be exercised on its own; builds use {@link svelteRestPropsCompat}.
 */
export function rewriteRestPropsCalls(
  code: string,
  id: string,
): { code: string; map: ReturnType<MagicString['generateMap']> } | null {
  const namespace = code.match(INTERNAL_NAMESPACE)?.[1];
  if (!namespace) return null;

  // `legacy_rest_props` is deliberately not matched: its array contract is unchanged in 5.56.
  const call = new RegExp(`(?<![$\\w])${namespace.replace(/\$/g, '\\$')}\\.rest_props\\(`, 'g');
  const s = new MagicString(code);
  let found = false;

  for (const match of code.matchAll(call)) {
    const start = match.index!;
    s.overwrite(start, start + match[0].length, `${HELPER}(`);
    found = true;
  }

  if (!found) return null;

  s.append(helper(namespace));
  return { code: s.toString(), map: s.generateMap({ source: id, hires: true }) };
}

export function svelteRestPropsCompat(): Plugin {
  return {
    name: 'embedpdf:svelte-rest-props-compat',
    enforce: 'post',
    transform(code, id) {
      if (!SVELTE_MODULE.test(id)) return null;
      return rewriteRestPropsCalls(code, id);
    },
  };
}
