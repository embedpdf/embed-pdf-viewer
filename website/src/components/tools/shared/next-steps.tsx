'use client';

import Link from 'next/link';

import { TOOLS, type ToolSlug } from '../content';
import { handOff, type HandedFile } from './handoff';

import { ArrowRightIcon } from '@/components/site/icons';

/**
 * What to do next with the file a tool just made: the other tools, each starting with this file,
 * so nobody picks it again.
 */
export function NextSteps({ file, from }: { file: HandedFile; from: ToolSlug }) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <p className="text-ep-soft m-0 font-sans text-sm">Next, with this file:</p>
      <div className="flex flex-wrap justify-center gap-2">
        {TOOLS.filter((tool) => tool.slug !== from).map((tool) => (
          <Link
            key={tool.slug}
            href={tool.href}
            onClick={() => handOff(file)}
            className="border-ep-border text-ep-navy hover:border-ep-blue hover:text-ep-blue inline-flex h-10 items-center gap-1.5 rounded-full border bg-white px-4 font-sans text-sm font-bold transition-colors"
          >
            {tool.next}
            <ArrowRightIcon size={15} />
          </Link>
        ))}
      </div>
    </div>
  );
}
