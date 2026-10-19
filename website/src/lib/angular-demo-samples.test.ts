import { describe, expect, it } from 'vitest';

import { compileForJit, loadJitTransform, rewriteStyleUrls } from './angular-demo-samples';

const TOOLBAR = `import { Component, ViewEncapsulation, input, output, viewChild } from '@angular/core';
import type { ElementRef } from '@angular/core';

@Component({
  selector: 'demo-toolbar',
  template: '<button #button (click)="pressed.emit(label())">{{ label() }}</button>',
  styleUrl: './basic.css',
  encapsulation: ViewEncapsulation.None,
})
export class Toolbar {
  readonly label = input.required<string>();
  readonly pressed = output<string>();
  readonly button = viewChild<ElementRef>('button');
}
`;

describe('an Angular example in the demo build', () => {
  it('imports its stylesheet the way every other framework does', () => {
    const code = rewriteStyleUrls(TOOLBAR);

    expect(code.startsWith('import "./basic.css";\n')).toBe(true);
    expect(code).not.toContain('styleUrl');
    expect(code).toContain("selector: 'demo-toolbar',");
  });

  it('imports each file of styleUrls once', () => {
    const code = rewriteStyleUrls(
      "@Component({ styleUrls: ['./basic.css', \"./extra.css\"], template: '' })\nclass A {}\n" +
        "@Component({ styleUrl: './basic.css' })\nclass B {}\n",
    );

    expect(code.match(/^import .*$/gm)).toEqual(['import "./basic.css";', 'import "./extra.css";']);
    expect(code).not.toMatch(/styleUrls?/);
  });

  it('leaves a component without a stylesheet as it is', () => {
    const code = "@Component({ selector: 'demo-root', template: '' })\nexport class App {}\n";

    expect(rewriteStyleUrls(code)).toBe(code);
  });

  it('gives signal inputs, outputs and queries the metadata JIT reads', async () => {
    const transform = await loadJitTransform();
    expect(transform).not.toBeNull();

    const code = compileForJit(TOOLBAR, '/samples/search/basic.angular.ts', transform!);

    expect(code).toMatch(/label: \[\{ type: i0\.Input, args: \[\{ isSignal: true, alias: "label"/);
    expect(code).toMatch(/pressed: \[\{ type: i0\.Output, args: \["pressed"/);
    expect(code).toMatch(/button: \[\{ type: i0\.ViewChild, args: \['button', \{ isSignal: true/);
    // Type-only imports are gone, as in any build.
    expect(code).not.toContain('ElementRef');
  });
});
