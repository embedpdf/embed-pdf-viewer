import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';

/**
 * What a token's swatch draws: a fill for a color, a page with its shadow,
 * a corner with its radius, or a word in its font.
 */
type ThemeTokenKind = 'color' | 'shadow' | 'radius' | 'font';

type ThemeTokenProps = {
  /** The token's name, as config and CSS (`--epdf-<name>`) write it. */
  name: string;
  kind?: ThemeTokenKind;
  /** The default in light mode, as CSS. */
  light?: string;
  /** The default in dark mode, as CSS. */
  dark?: string;
  /** The default in both modes, as CSS, for a token dark mode leaves alone. */
  value?: string;
  /**
   * The default in words, for one CSS can't show (the system's font, another
   * token's color). Backticks mark code.
   */
  default?: string;
  /** The token whose color this one takes by default: its swatch shows that color. */
  follows?: string;
  /** What the token colors: the description, as MDX. */
  children?: ReactNode;
};

type Defaults = { light?: string; dark?: string };

/**
 * A theme's tokens as a list: each with a swatch of its defaults (light on the
 * left, dark on the right), what it colors, and the values to write. For pages
 * where a token table's four columns would squeeze the descriptions.
 */
export function ThemeTokens({ children }: { children: ReactNode }) {
  const tokens = Children.toArray(children).filter(
    (child): child is ReactElement<ThemeTokenProps> => isValidElement(child),
  );
  const defaults = new Map<string, Defaults>(
    tokens.map(({ props }) => [
      props.name,
      { light: props.light ?? props.value, dark: props.dark ?? props.value },
    ]),
  );

  return (
    <ul className="mt-6 list-none divide-y divide-[var(--dk-border)] overflow-hidden rounded-[14px] border border-[var(--dk-border)] bg-white p-0">
      {tokens.map(({ props }) => (
        <TokenRow
          key={props.name}
          {...props}
          swatch={props.follows ? defaults.get(props.follows) : undefined}
        />
      ))}
    </ul>
  );
}

/** One token in a <ThemeTokens> list. It only carries data: the list draws it. */
export function ThemeToken(_props: ThemeTokenProps) {
  return null;
}

function TokenRow({
  name,
  kind = 'color',
  light,
  dark,
  value,
  default: inWords,
  swatch,
  children,
}: ThemeTokenProps & { swatch?: Defaults }) {
  const fill = swatch ?? { light: light ?? value, dark: dark ?? value };

  return (
    <li className="m-0 flex gap-4 px-[18px] py-4" id={`token-${name}`}>
      <Swatch kind={kind} {...fill} />
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[14.5px] font-semibold leading-[1.3] text-[var(--dk-heading)]">
          {name}
        </div>
        <div className="mt-1 font-sans text-[14.5px] leading-[1.55] text-[var(--dk-muted)] [&_p]:m-0 [&_p]:max-w-none [&_p]:text-[length:inherit] [&_p]:leading-[inherit] [&_p]:text-inherit">
          {children}
        </div>
        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] leading-[1.4]">
          {value !== undefined || inWords !== undefined ? (
            <Default label="Light and dark">
              {value !== undefined ? <code>{value}</code> : <Words text={inWords!} />}
            </Default>
          ) : (
            <>
              <Default label="Light">
                <code>{light}</code>
              </Default>
              <Default label="Dark">
                <code>{dark}</code>
              </Default>
            </>
          )}
        </dl>
      </div>
    </li>
  );
}

function Default({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5">
      <dt className="font-sans font-semibold text-[var(--dk-muted)]">{label}</dt>
      <dd className="m-0 font-sans text-[var(--dk-heading)]">{children}</dd>
    </div>
  );
}

/** Words with `backticked` code, the one piece of Markdown a default in words needs. */
function Words({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(`[^`]+`)/)
        .map((part, index) =>
          part.startsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : part,
        )}
    </>
  );
}

const SWATCH = 'h-11 w-11 flex-shrink-0 overflow-hidden rounded-[11px] border border-black/10';

/** The defaults drawn: split in two when light and dark differ, whole when they don't. */
function Swatch({ kind, light, dark }: { kind: ThemeTokenKind } & Defaults) {
  if (kind === 'shadow') {
    return (
      <span aria-hidden className={`${SWATCH} flex items-center justify-center bg-[#eef1f5]`}>
        <span className="h-[22px] w-[17px] rounded-[2px] bg-white" style={{ boxShadow: light }} />
      </span>
    );
  }
  if (kind === 'radius') {
    return (
      <span aria-hidden className={`${SWATCH} flex items-center justify-center bg-white`}>
        <span
          className="h-6 w-6 border-2 border-[var(--dk-accent)] bg-[var(--dk-accent-surface)]"
          style={{ borderRadius: light }}
        />
      </span>
    );
  }
  if (kind === 'font') {
    return (
      <span
        aria-hidden
        className={`${SWATCH} flex items-center justify-center bg-white text-[17px] font-semibold text-[var(--dk-heading)]`}
        style={{ fontFamily: light ?? 'system-ui, sans-serif' }}
      >
        Aa
      </span>
    );
  }
  return (
    <span aria-hidden className={`${SWATCH} flex`}>
      <span className="flex-1" style={{ background: light }} />
      {dark !== light ? <span className="flex-1" style={{ background: dark }} /> : null}
    </span>
  );
}
