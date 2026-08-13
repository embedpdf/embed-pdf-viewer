import { visit, SKIP } from 'unist-util-visit';

/**
 * Build-time resolution of the engine axis (DOCS-PLATFORM-ARCHITECTURE.md).
 *
 * Shared MDX marks engine-specific content with `<Engine>` blocks:
 *
 *   <Engine local>…</Engine>
 *   <Engine only="cloud">…</Engine>              (equivalent spelling)
 *
 * Each site compiles with its own binding. The rule is deliberately blunt:
 * a matching block unwraps in place; a non-matching block is REMOVED.
 * Because this happens at compile time, rendered HTML, OG text, markdown
 * export, and the search corpus only ever contain the site's own flavour.
 *
 * A branch hides; a pointer speaks. `<Engine>` exists only for content the
 * OTHER site's render of the same page makes visible. A cross-site call to
 * action is ordinary authored content — write the words and the link
 * yourself (wrapped in the flavor whose readers should see them); this
 * plugin never manufactures prose.
 *
 * Ships as plain ESM (not TypeScript) so `next.config.ts` can load it from
 * node_modules without a transpile step.
 *
 * @param {{ engine: 'local' | 'cloud' }} options — the site's binding.
 */
export function remarkEngineAxis(options) {
  const engine = options?.engine;
  if (engine !== 'local' && engine !== 'cloud') {
    throw new Error(
      `remarkEngineAxis: options.engine must be 'local' or 'cloud' (got ${JSON.stringify(engine)})`,
    );
  }

  return (tree) => {
    visit(tree, ['mdxJsxFlowElement', 'mdxJsxTextElement'], (node, index, parent) => {
      if (node.name !== 'Engine' || !parent || typeof index !== 'number') return;

      const flavors = readFlavors(node);
      if (flavors.length === 0) {
        throw new Error(
          "remarkEngineAxis: <Engine> needs a flavor — write <Engine local>, <Engine cloud>, or only=\"…\"",
        );
      }

      if (flavors.includes(engine)) {
        // Matching block: unwrap — the children take its place.
        parent.children.splice(index, 1, ...node.children);
        return [SKIP, index];
      }

      parent.children.splice(index, 1);
      return [SKIP, index];
    });
  };
}

function readFlavors(node) {
  const flavors = [];
  for (const attribute of node.attributes ?? []) {
    if (attribute.type !== 'mdxJsxAttribute') continue;
    if ((attribute.name === 'local' || attribute.name === 'cloud') && attribute.value === null) {
      flavors.push(attribute.name);
    }
    if (attribute.name === 'only' && typeof attribute.value === 'string') {
      for (const flavor of attribute.value.split(/[\s,]+/)) {
        if (flavor === 'local' || flavor === 'cloud') flavors.push(flavor);
      }
    }
  }
  return flavors;
}

