/**
 * Shown on the frozen 2.x site at v2.embedpdf.com, whose deploy sets EMBEDPDF_V2_ARCHIVE=1:
 * www.embedpdf.com serves the current docs.
 */
export function ArchiveBanner() {
  if (process.env.EMBEDPDF_V2_ARCHIVE !== '1') return null

  return (
    <div className="bg-blue-600 px-4 py-2 text-center text-sm text-white">
      You&apos;re reading the docs for EmbedPDF 2.x.{' '}
      <a
        href="https://www.embedpdf.com/docs"
        className="font-semibold underline underline-offset-2 hover:text-blue-100"
      >
        Read the current docs
      </a>
    </div>
  )
}
