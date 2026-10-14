import type { ExampleMode } from '@embedpdf/docs-kit';
import {
  codePanelsDir,
  routeCodePanels,
  type CodePanelProps,
} from '@embedpdf/docs-kit/mdx/code-panels';

import { Example, type ExampleSize } from './example';

/** The props a compiled page gives `<Example>` and `<Snippet>`. */
export type CompiledExampleProps = CodePanelProps & {
  mode?: ExampleMode;
  kind?: 'example' | 'snippet';
  /** The sample's name, as written in the page (the key already carries it). */
  name?: string;
  /** A bigger preview than the example's own: `tall`, or `wide` (see `Example`). */
  size?: ExampleSize;
};

/**
 * An `<Example>` or `<Snippet>`, on the server. The compiled page doesn't carry the code: it says
 * where the compile stored each framework's highlighted files (`codeKey`) and which frameworks
 * have a version (`codeFrameworks`); see docs-kit `mdx/code-panels`. Here the route's framework's
 * files and demo are read and handed to the client `Example`, with the list of frameworks that
 * have a version, which the "not available yet" note needs. Nothing else crosses to the browser.
 *
 * A route without a framework (a page that isn't fanned out) gets every framework's files, and
 * the client picks by pathname.
 */
export function RouteExample({
  codeKey,
  codeFrameworks,
  demosByFramework,
  framework,
  mode,
  kind,
  name,
  size,
}: CompiledExampleProps & {
  /** The route's framework or integration; null on a page that isn't fanned out. */
  framework: string | null;
}) {
  const shown = routeCodePanels({
    dir: codePanelsDir(),
    codeKey,
    codeFrameworks,
    demosByFramework,
    framework,
  });
  return (
    <Example
      mode={mode}
      kind={kind}
      name={name}
      size={size}
      filesByFramework={JSON.stringify(shown.filesByFramework)}
      demosByFramework={JSON.stringify(shown.demosByFramework)}
      available={shown.available}
    />
  );
}
