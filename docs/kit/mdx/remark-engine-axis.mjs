import { visit, SKIP } from 'unist-util-visit';

/**
 * Build-time resolution of the engine axis (DOCS-PLATFORM-ARCHITECTURE.md).
 *
 * Shared MDX marks engine-specific content with `<Engine>` blocks:
 *
 *   <Engine local>…</Engine>
 *   <Engine cloud href="https://www.cloudpdf.com/docs/…">…</Engine>
 *   <Engine only="cloud">…</Engine>              (equivalent spelling)
 *
 * Each site compiles with its own binding. A matching block unwraps in
 * place; a non-matching block is REMOVED — or, when it carries `href`,
 * degrades to a one-line `<EngineCrossLink>` pointing at the sibling site
 * (the upsell surface). Because this happens at compile time, rendered
 * HTML, OG text, markdown export, and the search corpus only ever contain
 * the site's own flavour.
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

      const href = readAttribute(node, 'href');
      if (href) {
        parent.children.splice(index, 1, {
          type: node.type,
          name: 'EngineCrossLink',
          attributes: [
            { type: 'mdxJsxAttribute', name: 'engine', value: flavors[0] },
            { type: 'mdxJsxAttribute', name: 'href', value: href },
          ],
          children: [],
        });
        return [SKIP, index + 1];
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

function readAttribute(node, name) {
  const attribute = (node.attributes ?? []).find(
    (candidate) => candidate.type === 'mdxJsxAttribute' && candidate.name === name,
  );
  return typeof attribute?.value === 'string' ? attribute.value : null;
}
