/**
 * A package README as text (`readmes.mjs`): its frame filled in, and what the check reads in the
 * result. Plain functions over strings, so `node --test` runs them without the docs kit.
 */

const SLOT = /\{(\w+)\}/g;
const ONLY_A_SLOT = /^\{(\w+)\}$/;
const HEADING = /^(#+) /;

/**
 * A frame (`../readme/installed.md`) with each `{slot}` filled from `slots`. A README has no
 * place for what it has nothing to say: a line that is only an empty slot is left out, and so is
 * a heading left with nothing under it. Throws on a slot `slots` doesn't have.
 */
export function fillFrame(frame, slots) {
  const value = (slot) => {
    if (typeof slots[slot] !== 'string') throw new Error(`the frame's {${slot}} has no value`);
    return slots[slot];
  };
  const said = frame.split('\n').filter((line) => {
    const [, slot] = line.match(ONLY_A_SLOT) ?? [];
    return !slot || value(slot) !== '';
  });
  // From the last line up, so a heading is read against what is kept below it. Nothing is under
  // a heading when the next line with text is a heading of its level or above, or there is none.
  const kept = said.reduceRight((below, line) => {
    const level = line.match(HEADING)?.[1].length;
    if (level) {
      const next = below.find((later) => later.trim() !== '');
      const nextLevel = next?.match(HEADING)?.[1].length;
      if (next === undefined || (nextLevel && nextLevel <= level)) return below;
    }
    return [line, ...below];
  }, []);
  // The blank lines are the frame's own: a value is put in as it is, after they are tidied.
  const text = kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return `${text.replace(SLOT, (whole, slot) => value(slot))}\n`;
}

/** A table's rows as Markdown, each column as wide as its widest cell. */
export function tableRows(rows) {
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  return rows
    .map((row) => `| ${row.map((cell, column) => cell.padEnd(widths[column])).join(' | ')} |`)
    .join('\n');
}

/** A README's prose: its Markdown without the code, fenced or in a line. */
export function proseOf(markdown) {
  return markdown
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, '')
    .replace(/`[^`\n]*`/g, '');
}

/** What our copy doesn't say, found in `text`: an em-dash, or a release by its name. */
export function wordingProblems(text) {
  const problems = [];
  if (text.includes('—')) problems.push('holds an em-dash');
  if (/\bv3\b/i.test(text)) problems.push('says "v3"');
  return problems;
}

/** What a README links and shows as a picture, outside its code. */
export function linksOf(markdown) {
  return [...proseOf(markdown).matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]);
}

/**
 * What is wrong with a README's links. A README is read on npm and GitHub, so each link is a full
 * URL, and one into the docs is a page, not its Markdown. `docsRoutes(origin)` gives the URL
 * paths a docs site answers, or nothing for any other origin.
 */
export function linkProblems(markdown, docsRoutes) {
  const problems = [];
  for (const link of linksOf(markdown)) {
    if (!URL.canParse(link)) {
      problems.push(`${link} is not a full URL`);
      continue;
    }
    const url = new URL(link);
    const routes = docsRoutes(url.origin);
    let page = url.pathname;
    while (page.endsWith('/')) page = page.slice(0, -1);
    if (!routes || (page !== '/docs' && !page.startsWith('/docs/'))) continue;
    const last = page.slice(page.lastIndexOf('/') + 1);
    if (last.endsWith('.md')) problems.push(`${link} is a page's Markdown, not the page`);
    // Any other file a site serves under `/docs`, such as a screenshot, is no page to look up.
    else if (!last.includes('.') && !routes.has(page)) problems.push(`${link} is no page`);
  }
  return problems;
}

/**
 * A README's size, and where it comes from: its lines, and each code block's, named by the file
 * it shows (the `**\`basic.tsx\`**` line above it) or its language.
 */
export function sizeOf(markdown) {
  const lines = markdown.trimEnd().split('\n');
  const code = [];
  let open = null;
  lines.forEach((line, index) => {
    const [, fence, language] = line.match(/^(`{3,}|~{3,})\s*([\w-]*)/) ?? [];
    if (!open && fence) {
      const above = lines.slice(0, index).findLast((earlier) => earlier.trim() !== '');
      const [, file] = above?.match(/^\*\*`([^`]+)`\*\*$/) ?? [];
      open = { fence, block: { shows: file ?? (language || 'code'), lines: 0 } };
    } else if (open && line.trimEnd() === open.fence) {
      code.push(open.block);
      open = null;
    } else if (open) {
      open.block.lines += 1;
    }
  });
  return { lines: lines.length, code };
}
