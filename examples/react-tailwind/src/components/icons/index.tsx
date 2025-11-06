type IconProps = {
  className?: string;
  title?: string;
  style?: React.CSSProperties;
};

export function DocumentIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
      />
    </svg>
  );
}

export function CloseIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export function PlusIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

export function HandIcon({ className, title }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M8 13v-7.5a1.5 1.5 0 0 1 3 0v6.5" />
      <path d="M11 5.5v-2a1.5 1.5 0 1 1 3 0v8.5" />
      <path d="M14 5.5a1.5 1.5 0 0 1 3 0v6.5" />
      <path d="M17 7.5a1.5 1.5 0 0 1 3 0v8.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7a69.74 69.74 0 0 1 -.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47" />
    </svg>
  );
}

export function SearchMinusIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"
      />
    </svg>
  );
}

export function SearchPlusIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
      />
    </svg>
  );
}

export function ChevronDownIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function FitPageIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

export function FitWidthIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
    </svg>
  );
}

export function MarqueeIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
      />
    </svg>
  );
}

export function RotateRightIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M4.05 11a8 8 0 1 1 .5 4m-.5 5v-5h5" />
    </svg>
  );
}

export function RotateLeftIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M19.95 11a8 8 0 1 0 -.5 4m.5 5v-5h-5" />
    </svg>
  );
}

export function SinglePageIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

export function BookOpenIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  );
}

export function SettingsIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M12 14m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      <path d="M12 10.5v1.5" />
      <path d="M12 16v1.5" />
      <path d="M15.031 12.25l-1.299 .75" />
      <path d="M10.268 15l-1.3 .75" />
      <path d="M15 15.803l-1.285 -.773" />
      <path d="M10.285 12.97l-1.285 -.773" />
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
    </svg>
  );
}

export function PrintIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
      />
    </svg>
  );
}

export function DownloadIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
      />
    </svg>
  );
}

export function ScreenshotIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M7 19a2 2 0 0 1 -2 -2" />
      <path d="M5 13v-2" />
      <path d="M5 7a2 2 0 0 1 2 -2" />
      <path d="M11 5h2" />
      <path d="M17 5a2 2 0 0 1 2 2" />
      <path d="M19 11v2" />
      <path d="M19 17v4" />
      <path d="M21 19h-4" />
      <path d="M13 19h-2" />
    </svg>
  );
}

export function FullscreenIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 8v-2a2 2 0 0 1 2 -2h2"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16v2a2 2 0 0 0 2 2h2"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 4h2a2 2 0 0 1 2 2v2"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 20h2a2 2 0 0 0 2 -2v-2"
      />
    </svg>
  );
}

export function FullscreenExitIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 8v-2c0 -.551 .223 -1.05 .584 -1.412"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16v2a2 2 0 0 0 2 2h2"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 4h2a2 2 0 0 1 2 2v2"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 20h2c.545 0 1.04 -.218 1.4 -.572"
      />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
    </svg>
  );
}

export function MenuIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M4 8l16 0" />
      <path d="M4 16l16 0" />
    </svg>
  );
}

export function MenuDotsIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
      />
    </svg>
  );
}

export function AlertIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

export function RefreshIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

export function CheckIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function SearchIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

export function ThumbnailsIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
      />
    </svg>
  );
}

export function ChevronLeftIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

export function ChevronRightIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function TextIcon({ className, title, style }: IconProps) {
  return (
    <svg
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M6.5 15.5m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0" />
      <path d="M14 19v-10.5a3.5 3.5 0 0 1 7 0v10.5" />
      <path d="M14 13h7" />
      <path d="M10 12v7" />
    </svg>
  );
}

export function PenIcon({ className, title, style }: IconProps) {
  return (
    <svg
      className={className}
      style={style}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <g transform="rotate(47.565 12.1875 10.75)">
        <path
          stroke="#000000"
          d="m14.18752,16.75l0,-12c0,-1.1 -0.9,-2 -2,-2s-2,0.9 -2,2l0,12l2,2l2,-2z"
        />
        <path stroke="#000000" d="m10.18752,6.75l4,0" />
      </g>
      <path
        stroke="currentColor"
        d="m19.37499,20.125c0.56874,0.0625 -4.04999,-0.5625 -6.41249,-0.4375c-2.3625,0.125 -4.75833,1.22916 -6.85624,1.625c-1.76458,0.6875 -3.40416,-0.9375 -1.98125,-2.49999"
      />
    </svg>
  );
}

export function CircleIcon({ className, title, style }: IconProps) {
  return (
    <svg
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SquareIcon({ className, title, style }: IconProps) {
  return (
    <svg
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArrowIcon({ className, title, style }: IconProps) {
  return (
    <svg
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M20 4l-16 16" />
      <path d="M16 3h5v5" />
    </svg>
  );
}

export function HighlightIcon({ className, title, style }: IconProps) {
  return (
    <svg
      className={className}
      style={style}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <rect x="2" y="6" width="20" height="16" rx="2" fill="currentColor" stroke="none" />
      <path d="M8 16v-8a4 4 0 1 1 8 0v8" stroke="#000000" />
      <path d="M8 10h8" stroke="#000000" />
    </svg>
  );
}

export function LineIcon({ className, title, style }: IconProps) {
  return (
    <svg
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2.2}
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M20 4l-16 16" />
    </svg>
  );
}

export function PolygonIcon({ className, title, style }: IconProps) {
  return (
    <svg
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M13.163 2.168l8.021 5.828c.694 .504 .984 1.397 .719 2.212l-3.064 9.43a1.978 1.978 0 0 1 -1.881 1.367h-9.916a1.978 1.978 0 0 1 -1.881 -1.367l-3.064 -9.43a1.978 1.978 0 0 1 .719 -2.212l8.021 -5.828a1.978 1.978 0 0 1 2.326 0z" />
    </svg>
  );
}

export function SquigglyIcon({ className, title, style }: IconProps) {
  return (
    <svg
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M8 16v-8a4 4 0 1 1 8 0v8" stroke="#000000" />
      <path d="M8 10h8" stroke="#000000" />
      <path
        d="M4 20c1.5 -1.5 3.5 -1.5 5 0s3.5 1.5 5 0 3.5 -1.5 5 0"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StrikethroughIcon({ className, title, style }: IconProps) {
  return (
    <svg
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M8 16v-8a4 4 0 1 1 8 0v8" stroke="#000000" />
      <path d="M4 10h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UnderlineIcon({ className, title, style }: IconProps) {
  return (
    <svg
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M4 20h16" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 16v-8a4 4 0 1 1 8 0v8" stroke="#000000" />
      <path d="M8 10h8" stroke="#000000" />
    </svg>
  );
}

export function ZigzagIcon({ className, title, style }: IconProps) {
  return (
    <svg
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M12 2.4L21.36 11.76L2.64 12.24L12 21.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PolylineIcon({ className, title, style }: IconProps) {
  return <ZigzagIcon className={className} title={title} style={style} />;
}

export function ItalicIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M11 5l6 0" />
      <path d="M7 19l6 0" />
      <path d="M14 5l-4 14" />
    </svg>
  );
}

export function SquaresIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M8 10a2 2 0 0 1 2 -2h9a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-9a2 2 0 0 1 -2 -2z" />
      <path d="M16 8v-3a2 2 0 0 0 -2 -2h-9a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h3" />
    </svg>
  );
}

export function TrashIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M4 7l16 0" />
      <path d="M10 11l0 6" />
      <path d="M14 11l0 6" />
      <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
      <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
    </svg>
  );
}

export function UndoIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M9 14l-4 -4l4 -4" />
      <path d="M5 10h11a4 4 0 1 1 0 8h-1" />
    </svg>
  );
}

export function RedoIcon({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M15 14l4 -4l-4 -4" />
      <path d="M19 10h-11a4 4 0 1 0 0 8h1" />
    </svg>
  );
}
