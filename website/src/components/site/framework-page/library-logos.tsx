/*
 * Marks of the UI libraries a framework page says EmbedPDF works with (the
 * v2 framework pages' set). Each takes the size its strip gives it; the
 * monochrome ones (shadcn/ui, Radix) draw in `currentColor`.
 */

type LogoProps = { className?: string };

export const MuiLogo = ({ className }: LogoProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 476.3" className={className} aria-hidden>
    <path d="M0 259.8V0l225 129.9v86.6L75 129.9v173.2z" fill="#00b0ff" />
    <path d="M225 129.9L450 0v259.8l-150 86.6-75-43.3 150-86.6v-86.6l-150 86.6z" fill="#0081cb" />
    <path d="M225 303.1v86.6l150 86.6v-86.6z" fill="#00b0ff" />
    <path
      d="M375 476.3l225-129.9V173.2l-75 43.3v86.6l-150 86.6zm150-346.4V43.3L600 0v86.6z"
      fill="#0081cb"
    />
  </svg>
);

export const ChakraLogo = ({ className }: LogoProps) => (
  <svg viewBox="5 5 30 26" className={className} aria-hidden>
    <defs>
      <linearGradient
        id="chakra-logo-a"
        x1="33.9534"
        y1="23.645"
        x2="5.78627"
        y2="23.9059"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#3585A3" />
        <stop offset="1" stopColor="#00DEAE" />
      </linearGradient>
      <linearGradient
        id="chakra-logo-b"
        x1="6.67767"
        y1="12.4545"
        x2="31.7007"
        y2="11.8021"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#3585A3" />
        <stop offset="1" stopColor="#00DEAE" />
      </linearGradient>
    </defs>
    <path
      d="M34.5655 17.9244L28.0585 16.7206L27.3139 18.0099L25.4813 21.1828L20.7231 29.4212C20.5147 29.7819 19.9653 29.6335 19.9653 29.2166V22.2928V21.5412C19.9653 21.1509 19.6901 20.8153 19.3087 20.7404L11.8954 19.2841L5.25929 18.0708C5.26937 18.4155 5.35079 18.7586 5.50582 19.0761L10.9828 28.5803C11.7469 29.9063 13.1577 30.7221 14.6835 30.7201L25.1868 30.7061C26.7118 30.7041 28.1198 29.8854 28.8808 28.5585L34.2409 19.2113C34.4694 18.8138 34.5768 18.3679 34.5655 17.9244Z"
      fill="url(#chakra-logo-a)"
    />
    <path
      d="M12.642 17.9885L14.4774 14.8034L19.2073 6.59529C19.4154 6.2342 19.9653 6.38242 19.9653 6.79963V14.471C19.9653 14.8617 20.2411 15.1976 20.6231 15.272L28.0585 16.7207L34.5655 17.9245C34.5572 17.5987 34.4841 17.2747 34.3464 16.9717C34.314 16.9004 34.2792 16.8299 34.2397 16.7613L28.8728 7.42387C28.1102 6.09724 26.7007 5.27994 25.1753 5.27994H14.6361C13.1082 5.27994 11.6968 6.09981 10.9352 7.42979L5.58357 16.7749C5.57125 16.7963 5.56056 16.8184 5.54894 16.8401C5.34348 17.2237 5.24692 17.6483 5.25929 18.0708L11.8954 19.2841L12.642 17.9885Z"
      fill="url(#chakra-logo-b)"
    />
  </svg>
);

export const TailwindLogo = ({ className }: LogoProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54 33" className={className} aria-hidden>
    <path
      fill="#38bdf8"
      fillRule="evenodd"
      d="M27 0c-7.2 0-11.7 3.6-13.5 10.8 2.7-3.6 5.85-4.95 9.45-4.05 2.054.513 3.522 2.004 5.147 3.653C30.744 13.09 33.808 16.2 40.5 16.2c7.2 0 11.7-3.6 13.5-10.8-2.7 3.6-5.85 4.95-9.45 4.05-2.054-.513-3.522-2.004-5.147-3.653C36.756 3.11 33.692 0 27 0zM13.5 16.2C6.3 16.2 1.8 19.8 0 27c2.7-3.6 5.85-4.95 9.45-4.05 2.054.514 3.522 2.004 5.147 3.653C17.244 29.29 20.308 32.4 27 32.4c7.2 0 11.7-3.6 13.5-10.8-2.7 3.6-5.85 4.95-9.45 4.05-2.054-.513-3.522-2.004-5.147-3.653C23.256 19.31 20.192 16.2 13.5 16.2z"
      clipRule="evenodd"
    />
  </svg>
);

export const ShadcnLogo = ({ className }: LogoProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className={className} aria-hidden>
    <line
      x1="208"
      y1="128"
      x2="128"
      y2="208"
      stroke="currentColor"
      strokeWidth="32"
      strokeLinecap="round"
    />
    <line
      x1="192"
      y1="40"
      x2="40"
      y2="192"
      stroke="currentColor"
      strokeWidth="32"
      strokeLinecap="round"
    />
  </svg>
);

export const AntDesignLogo = ({ className }: LogoProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" className={className} aria-hidden>
    <defs>
      <linearGradient id="antd-logo-a" x1="62.102%" y1="0%" x2="108.197%" y2="37.864%">
        <stop stopColor="#4285EB" offset="0%" />
        <stop stopColor="#2EC7FF" offset="100%" />
      </linearGradient>
      <linearGradient id="antd-logo-b" x1="69.644%" y1="0%" x2="54.043%" y2="108.457%">
        <stop stopColor="#29CDFF" offset="0%" />
        <stop stopColor="#148EFF" offset="37.86%" />
        <stop stopColor="#0A60FF" offset="100%" />
      </linearGradient>
      <linearGradient id="antd-logo-c" x1="69.691%" y1="-12.974%" x2="16.723%" y2="117.391%">
        <stop stopColor="#FA816E" offset="0%" />
        <stop stopColor="#F74A5C" offset="41.473%" />
        <stop stopColor="#F51D2C" offset="100%" />
      </linearGradient>
      <linearGradient id="antd-logo-d" x1="68.128%" y1="-35.691%" x2="30.44%" y2="114.943%">
        <stop stopColor="#FA8E7D" offset="0%" />
        <stop stopColor="#F74A5C" offset="51.264%" />
        <stop stopColor="#F51D2C" offset="100%" />
      </linearGradient>
    </defs>
    <path
      d="M91.588 4.177L4.18 91.513c-4.7 4.695-4.7 12.279 0 16.974l87.408 87.336c4.7 4.695 12.29 4.695 16.99 0l36.649-36.619c4.208-4.205 4.208-11.023 0-15.228-4.209-4.205-11.032-4.205-15.24 0l-27.784 27.76-4.114-4.114-69.802-69.744-4.114-4.114 69.802-69.744 4.114 4.114 27.783 27.76c4.209 4.205 11.032 4.205 15.24 0 4.209-4.205 4.209-11.023 0-15.228L108.58 4.056c-4.719-4.594-12.311-4.557-16.992.12z"
      fill="url(#antd-logo-a)"
    />
    <path
      d="M91.588 4.177L4.18 91.513c-4.7 4.695-4.7 12.279 0 16.974l87.408 87.336c4.7 4.695 12.29 4.695 16.99 0l36.649-36.619c4.208-4.205 4.208-11.023 0-15.228-4.209-4.205-11.032-4.205-15.24 0l-27.784 27.76-4.114-4.114-69.802-69.744-4.114-4.114 69.802-69.744 4.114 4.114 27.783 27.76c2.912-2.51 7.664-7.596 14.642-8.785 5.186-.884 10.856 1.061 17.01 5.836-4.114-4.11-11.167-11.155-21.158-21.133-4.719-4.594-12.311-4.557-16.992.12z"
      fill="url(#antd-logo-b)"
    />
    <path
      d="M153.686 135.855c4.208 4.205 11.031 4.205 15.24 0l27.034-27.012c4.7-4.695 4.7-12.279 0-16.974l-27.27-27.15c-4.218-4.2-11.044-4.194-15.255.013-4.208 4.205-4.208 11.023 0 15.228l18.418 18.403c1.17 1.169 1.17 2.943 0 4.111l-18.167 18.154c-4.209 4.205-4.209 11.023 0 15.227z"
      fill="url(#antd-logo-c)"
    />
    <ellipse cx="100.519" cy="100.437" rx="23.6" ry="23.581" fill="url(#antd-logo-d)" />
  </svg>
);

export const RadixLogo = ({ className }: LogoProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="4 0 17 25" className={className} aria-hidden>
    <path
      d="M12 25a8 8 0 1 1 0-16v16zM12 0H4v8h8V0zM17 8a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"
      fill="currentColor"
    />
  </svg>
);
