/**
 * The social card both docs sites render.
 *
 * Satori, not a browser: only `display: flex` and `none` exist, CSS variables
 * do not resolve, and every colour and font arrives as a literal (see
 * ./brand.ts, ./fonts.ts). Two consequences show up below — the footer
 * lattice is a wrapping flex row rather than a grid, and letter-spacing is in
 * px rather than em.
 *
 * Everything the card shows comes from `DocsOgPage`, which each site fills
 * from the same resolved values its `<meta>` tags use. The card decides
 * nothing about content; it only draws.
 */
import type { ReactElement } from 'react';

import { ReactIcon, SvelteIcon, VueIcon } from '../icons';

import { resolvePalette, type DocsOgBrand, type OgPalette } from './brand';
import { OG_FONT_FAMILIES } from './fonts';
import type { OgLine } from './highlight';
import {
  CODE_FONT_SIZE,
  CODE_LINE_HEIGHT,
  OVERFLOW_ROWS,
  VISIBLE_ROWS,
  toPanelRows,
} from './panel';
import type { OgSnippet } from './snippet';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export interface DocsOgPage {
  /** Eyebrow inside the tinted pill, e.g. "Headless SDK". */
  section: string;
  title: string;
  description: string;
  /** Framework key; adds the dark pill. Omit on framework-less pages. */
  integration?: string;
  /** Label for `integration` — the site owns its vocabulary. */
  integrationLabel?: string;
  /** Path shown in the footer, leading slash included. */
  canonicalPath: string;
  snippet?: (OgSnippet & { lines: OgLine[] }) | null;
}

const { display, body, mono } = OG_FONT_FAMILIES;

function truncate(value: string, maximum: number) {
  if (value.length <= maximum) return value;
  return `${value.slice(0, maximum - 1).trimEnd()}…`;
}

/**
 * The footer route, shortened to clear the code panel.
 *
 * The panel's rotated backing layers reach down into the footer line and
 * begin at x=753, so a long route (the API reference nests four segments
 * deep) runs straight into them. Eliding the MIDDLE keeps the two halves
 * that carry meaning — the domain and the leaf the card links to — where
 * truncating the end would drop exactly the part that identifies the page.
 *
 * Which segments go is decided by keeping as many as will fit, and — when two
 * splits keep the same number — keeping the ones nearer the front. The head
 * names the product or section (`engine`, `api-reference`); the middle is
 * usually a structural bucket (`core-concepts`, `document-operations`). A
 * fixed-size tail gets this backwards, dropping `engine` to keep
 * `core-concepts`.
 *
 * Budgets are in monospace columns: JetBrains Mono at 18px advances ~11px,
 * so the panel leaves ~59 columns and a bare card most of the canvas.
 */
const FOOTER_COLUMNS_WITH_PANEL = 56;
const FOOTER_COLUMNS_BARE = 88;

export function elideRoute(origin: string, path: string, columns: number) {
  const width = (value: string) => origin.length + value.length;
  if (width(path) <= columns) return path;

  const segments = path.split('/').filter(Boolean);

  for (let kept = segments.length - 1; kept >= 2; kept--) {
    for (let head = kept - 1; head >= 1; head--) {
      const tail = segments.slice(-(kept - head));
      const elided = `/${[...segments.slice(0, head), '…', ...tail].join('/')}`;
      if (width(elided) <= columns) return elided;
    }
  }

  return `/…/${segments.at(-1) ?? ''}`;
}

/** Manrope 800 at 66px fits about thirty characters on one line. */
function titleSize(title: string) {
  if (title.length <= 30) return 66;
  if (title.length <= 46) return 56;
  return 48;
}

/**
 * Monochrome framework marks. React/Vue/Svelte come from the kit's icon set
 * recoloured white; Angular and vanilla are inlined because the kit versions
 * hard-code a brand fill and a Tailwind class respectively — neither of which
 * survives Satori.
 */
function IntegrationMark({ integration, size }: { integration: string; size: number }) {
  if (integration === 'react') return <ReactIcon size={size} color="#FFFFFF" />;
  if (integration === 'vue') return <VueIcon size={size} color="#FFFFFF" />;
  if (integration === 'svelte') return <SvelteIcon size={size} color="#FFFFFF" />;
  if (integration === 'angular') {
    return (
      <svg width={size} height={size} viewBox="31.9 30 186.2 200">
        <path
          fill="#FFFFFF"
          fillRule="evenodd"
          d="M125 30L31.9 63.2l14.2 123.1L125 230l78.9-43.7 14.2-123.1L125 30zm0 22.1l58.2 130.5h-21.7l-11.7-29.2H99.2l-11.7 29.2H65.8L125 52.1zm17 83.3h-34l17-40.9 17 40.9z"
        />
      </svg>
    );
  }
  return (
    <div
      style={{
        alignItems: 'center',
        backgroundColor: '#F7DF1E',
        borderRadius: Math.round(size * 0.22),
        color: '#0A1A4D',
        display: 'flex',
        fontFamily: display,
        fontSize: Math.round(size * 0.46),
        fontWeight: 800,
        height: size,
        justifyContent: 'center',
        width: size,
      }}
    >
      JS
    </div>
  );
}

/** Satori has no `white-space: pre`; spacing has to be non-breaking. */
function spaced(content: string) {
  return content.replace(/ /g, '\u00A0');
}

/** The tab strip above the code — see the panel geometry in ./panel.ts. */
const TAB_STRIP_HEIGHT = 54;

/**
 * The lattice mark, top right. Five columns of 5px dots on a 22px pitch,
 * three rows deep; Satori has no grid, so it wraps a fixed-width flex row.
 * Positioned from the left because `right` on an absolute child is one more
 * thing to get wrong — 72px of gutter, mirroring the page padding.
 */
const MARK_DOT = 5;
const MARK_PITCH = 22;
const MARK_COLUMNS = 5;
const MARK_WIDTH = MARK_COLUMNS * MARK_DOT + (MARK_COLUMNS - 1) * MARK_PITCH;

function LatticeMark({ colour }: { colour: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: MARK_PITCH,
        left: OG_WIDTH - 72 - MARK_WIDTH,
        position: 'absolute',
        top: 58,
        width: MARK_WIDTH,
      }}
    >
      {Array.from({ length: 15 }, (_, index) => (
        <div
          key={index}
          style={{
            backgroundColor: colour,
            borderRadius: 999,
            height: MARK_DOT,
            width: MARK_DOT,
          }}
        />
      ))}
    </div>
  );
}

/**
 * The design pins the panel with `right: -110px`. Absolute offsets resolve
 * against the padding box, not the content box, so its left edge sits at
 * 1200 + 110 - 560 — deliberately overhanging the canvas so the code bleeds
 * off the right edge instead of ending in a straight margin.
 */
const CARD_LEFT = OG_WIDTH + 110 - 560;

/**
 * The dot lattice, as a tiled SVG rather than the usual
 * `radial-gradient(<colour> 1.5px, transparent 1.5px)` idiom: Satori parses
 * that form without error but paints nothing, so the pattern would silently
 * vanish. A repeated data URI tiles correctly, and `maskImage` still fades it.
 */
const LATTICE_TILE = 28;

function latticeUri(colour: string) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${LATTICE_TILE}" height="${LATTICE_TILE}">` +
    `<circle cx="1.5" cy="1.5" r="1.5" fill="${colour}"/></svg>`;
  return `url("data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}")`;
}

function CodeCard({
  snippet,
  palette,
}: {
  snippet: OgSnippet & { lines: OgLine[] };
  palette: OgPalette;
}) {
  const { code } = palette;
  const layer = { position: 'absolute' as const, top: 0, left: 0, width: 560, height: 380 };
  const rows = toPanelRows(snippet.lines, OVERFLOW_ROWS);
  const overflows = rows.length > VISIBLE_ROWS;

  return (
    <div style={{ ...layer, left: CARD_LEFT, top: 138, display: 'flex' }}>
      <div
        style={{
          ...layer,
          backgroundColor: palette.rule[2],
          borderRadius: 28,
          display: 'flex',
          opacity: 0.4,
          transform: 'rotate(7deg)',
        }}
      />
      <div
        style={{
          ...layer,
          backgroundColor: palette.accent,
          borderRadius: 28,
          display: 'flex',
          opacity: 0.3,
          transform: 'rotate(3deg)',
        }}
      />
      <div
        style={{
          ...layer,
          backgroundColor: code.surface,
          border: `1px solid ${code.border}`,
          borderRadius: 28,
          boxShadow: code.shadow,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transform: 'rotate(-2.5deg)',
        }}
      >
        <div
          style={{
            alignItems: 'flex-end',
            backgroundColor: code.bar,
            borderBottom: `1px solid ${code.barBorder}`,
            display: 'flex',
            flexShrink: 0,
            gap: 16,
            height: TAB_STRIP_HEIGHT,
            padding: '0 24px',
          }}
        >
          <div style={{ alignItems: 'center', display: 'flex', gap: 8, paddingBottom: 14 }}>
            <div
              style={{ backgroundColor: code.chrome, borderRadius: 999, height: 10, width: 10 }}
            />
            <div
              style={{ backgroundColor: code.chrome, borderRadius: 999, height: 10, width: 10 }}
            />
            <div
              style={{ backgroundColor: code.chrome, borderRadius: 999, height: 10, width: 10 }}
            />
          </div>

          {/* The active tab sits ON the strip's hairline — same fill as the
              body below, borders on three sides, pulled down 1px — so it
              reads as continuous with the code rather than floating above it. */}
          <div
            style={{
              alignItems: 'center',
              backgroundColor: code.surface,
              borderLeft: `1px solid ${code.barBorder}`,
              borderRadius: '10px 10px 0 0',
              borderRight: `1px solid ${code.barBorder}`,
              borderTop: `1px solid ${code.barBorder}`,
              color: code.plain,
              display: 'flex',
              fontFamily: mono,
              fontSize: 14,
              gap: 9,
              marginBottom: -1,
              padding: '8px 18px 10px',
            }}
          >
            <div style={{ backgroundColor: code.tabDot, borderRadius: 999, height: 7, width: 7 }} />
            <div style={{ display: 'flex' }}>{snippet.filename}</div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexGrow: 1,
            minHeight: 0,
            overflow: 'hidden',
            padding: '26px 34px 0 26px',
            position: 'relative',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontFamily: mono,
              fontSize: CODE_FONT_SIZE,
              gap: 18,
            }}
          >
            <div
              style={{
                alignItems: 'flex-end',
                borderRight: `1px solid ${code.gutterRule}`,
                color: code.gutter,
                display: 'flex',
                flexDirection: 'column',
                flexShrink: 0,
                paddingRight: 16,
                width: 26,
              }}
            >
              {rows.map((row, index) => (
                <div key={index} style={{ display: 'flex', height: CODE_LINE_HEIGHT }}>
                  {String(row.lineNumber)}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {rows.map((row, index) => (
                <div
                  key={index}
                  style={{
                    alignItems: 'center',
                    display: 'flex',
                    flexWrap: 'nowrap',
                    height: CODE_LINE_HEIGHT,
                  }}
                >
                  {row.tokens.map((token, tokenIndex) => (
                    <div
                      key={tokenIndex}
                      style={{ color: token.color, display: 'flex', flexShrink: 0 }}
                    >
                      {spaced(token.content)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Only when there is genuinely more code below. A snippet that fits
              shows crisp to its last line; one that does not reads as
              continuing past the edge rather than being truncated. */}
          {overflows ? (
            <div
              style={{
                backgroundImage: `linear-gradient(to bottom, ${code.fadeFrom} 0%, ${code.fadeMid} 42%, ${code.fadeDeep} 74%, ${code.surface} 100%)`,
                bottom: 0,
                display: 'flex',
                height: '40%',
                left: 0,
                position: 'absolute',
                right: 0,
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function DocsOgCard({
  brand,
  page,
}: {
  brand: DocsOgBrand;
  page: DocsOgPage;
}): ReactElement {
  const palette = resolvePalette(brand);
  const snippet = page.snippet ?? null;
  const [ruleFrom, ruleMid, ruleTo] = palette.rule;

  return (
    <div
      style={{
        backgroundColor: palette.surface,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        justifyContent: 'space-between',
        overflow: 'hidden',
        padding: '64px 72px',
        position: 'relative',
        width: '100%',
      }}
    >
      <div
        style={{
          backgroundImage: latticeUri(palette.dot),
          backgroundRepeat: 'repeat',
          backgroundSize: `${LATTICE_TILE}px ${LATTICE_TILE}px`,
          display: 'flex',
          height: OG_HEIGHT,
          left: 0,
          maskImage: 'linear-gradient(115deg, rgba(0,0,0,0.9) 0%, transparent 55%)',
          opacity: 0.55,
          position: 'absolute',
          top: 0,
          width: OG_WIDTH,
        }}
      />
      <div
        style={{
          backgroundImage: `linear-gradient(90deg, ${ruleFrom} 0%, ${ruleMid} 45%, ${ruleTo} 100%)`,
          display: 'flex',
          height: 8,
          left: 0,
          position: 'absolute',
          top: 0,
          width: OG_WIDTH,
        }}
      />

      <LatticeMark colour={palette.footerDot} />

      {snippet ? <CodeCard snippet={snippet} palette={palette} /> : null}

      <div style={{ alignItems: 'center', display: 'flex', gap: 26, position: 'relative' }}>
        <img src={brand.logo.src} width={brand.logo.width} height={brand.logo.height} />
        <div style={{ backgroundColor: palette.divider, display: 'flex', height: 34, width: 1 }} />
        <div
          style={{
            color: palette.accent,
            display: 'flex',
            fontFamily: display,
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: 2.56,
            textTransform: 'uppercase',
          }}
        >
          {brand.eyebrow ?? 'Docs'}
        </div>
      </div>

      <div
        style={{
          alignItems: 'flex-start',
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
          maxWidth: snippet ? 700 : 1000,
          position: 'relative',
        }}
      >
        <div style={{ alignItems: 'center', display: 'flex', gap: 10 }}>
          <div
            style={{
              alignItems: 'center',
              backgroundColor: palette.mist,
              borderRadius: 999,
              color: palette.accent,
              display: 'flex',
              fontFamily: display,
              fontSize: 15,
              fontWeight: 700,
              gap: 8,
              letterSpacing: 0.6,
              padding: '8px 16px',
            }}
          >
            <div style={{ display: 'flex', fontFamily: mono, fontSize: 14, opacity: 0.75 }}>
              &lt;/&gt;
            </div>
            <div style={{ display: 'flex' }}>{page.section}</div>
          </div>

          {page.integration ? (
            <div
              style={{
                alignItems: 'center',
                backgroundColor: palette.navy,
                borderRadius: 999,
                color: '#FFFFFF',
                display: 'flex',
                fontFamily: display,
                fontSize: 15,
                fontWeight: 700,
                gap: 8,
                letterSpacing: 0.6,
                padding: '8px 16px 8px 14px',
              }}
            >
              <IntegrationMark integration={page.integration} size={19} />
              <div style={{ display: 'flex' }}>{page.integrationLabel ?? page.integration}</div>
            </div>
          ) : null}
        </div>

        <div
          style={{
            color: palette.title,
            display: 'flex',
            fontFamily: display,
            fontSize: titleSize(page.title),
            fontWeight: 800,
            letterSpacing: -1.65,
            lineHeight: 1.04,
          }}
        >
          {truncate(page.title, 78)}
        </div>

        <div
          style={{
            backgroundColor: palette.accentBar,
            borderRadius: 5,
            display: 'flex',
            height: 10,
            width: 114,
          }}
        />

        <div
          style={{
            color: palette.body,
            display: 'flex',
            fontFamily: body,
            fontSize: 23,
            lineHeight: 1.5,
            maxWidth: snippet ? 600 : 900,
          }}
        >
          {truncate(page.description, 130)}
        </div>
      </div>

      <div style={{ alignItems: 'center', display: 'flex', position: 'relative' }}>
        <div style={{ color: palette.urlInk, display: 'flex', fontFamily: mono, fontSize: 18 }}>
          <div style={{ color: palette.urlMuted, display: 'flex' }}>{brand.origin}</div>
          <div style={{ display: 'flex' }}>
            {elideRoute(
              brand.origin,
              page.canonicalPath,
              snippet ? FOOTER_COLUMNS_WITH_PANEL : FOOTER_COLUMNS_BARE,
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
