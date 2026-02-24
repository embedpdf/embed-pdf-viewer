export function NavigationBar() {
  return (
    <div className="flex items-center justify-between border-b bg-gray-800 px-4 py-2 text-white">
      <div className="flex items-center gap-4">
        <a
          href="#/"
          className="rounded px-3 py-1 text-sm font-medium transition-colors hover:bg-gray-700"
        >
          ← Home
        </a>
        <span className="text-gray-400">|</span>
        <span className="text-sm font-semibold">PDF Viewer</span>
      </div>
      <div className="text-xs text-gray-400">EmbedPDF React Example</div>
    </div>
  );
}
