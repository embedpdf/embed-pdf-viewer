/**
 * Shared by the API reference page header and the sidebar so a method always
 * carries the same colour in both places. Kept free of server-only imports
 * (shiki, the OpenAPI document) so the client sidebar can use it too.
 */
const METHOD_STYLES: Record<string, string> = {
  GET: 'border-[#B7D4FF] bg-[#EAF3FF] text-[#1D5FBF]',
  POST: 'border-[#B9E5CB] bg-[#EAF9F0] text-[#167645]',
  PUT: 'border-[#F1D7A8] bg-[#FFF6E5] text-[#9A5A00]',
  PATCH: 'border-[#D8C6F3] bg-[#F5EEFF] text-[#6A3EB2]',
  DELETE: 'border-[#F2BFC4] bg-[#FFF0F1] text-[#B52D3B]',
};

/** Narrow enough to keep the sidebar's titles on one line. */
const SHORT_LABELS: Record<string, string> = {
  DELETE: 'DEL',
  OPTIONS: 'OPT',
};

export function methodStyle(method: string) {
  return METHOD_STYLES[method] ?? 'border-cp-border bg-white text-cp-navy';
}

export function MethodBadge({ method }: { method: string }) {
  const short = SHORT_LABELS[method];
  const className = `w-[38px] shrink-0 rounded border py-[3px] text-center font-mono text-[9.5px] font-bold leading-[1.4] tracking-[0.04em] ${methodStyle(method)}`;

  if (!short) return <span className={className}>{method}</span>;

  // Abbreviated to fit the sidebar, so read the real method out instead.
  return (
    <>
      <span aria-hidden className={className}>
        {short}
      </span>
      <span className="sr-only">{method}</span>
    </>
  );
}
