export function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="mb-6 text-4xl font-bold text-gray-900">EmbedPDF React + Tailwind</h1>

        <div className="mb-8 space-y-4 text-gray-600">
          <p className="text-lg">
            Welcome to the EmbedPDF example for React and Tailwind CSS. This demonstrates how to
            integrate a powerful PDF viewer into your React applications with a beautiful, modern
            UI.
          </p>

          <div className="rounded-lg bg-blue-50 p-4">
            <h2 className="mb-2 font-semibold text-blue-900">Features:</h2>
            <ul className="list-inside list-disc space-y-2 text-sm">
              <li>High-performance PDF rendering with PDFium</li>
              <li>Multiple document support with tabs</li>
              <li>Zoom, pan, and page navigation</li>
              <li>Responsive design with Tailwind CSS</li>
              <li>Modern React 18 architecture</li>
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <a
            href="#/viewer"
            className="block rounded-lg bg-indigo-600 px-6 py-3 text-center font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            Go to PDF Viewer (with ViewManager)
          </a>

          <a
            href="#/viewer-simple"
            className="block rounded-lg bg-purple-600 px-6 py-3 text-center font-semibold text-white transition-colors hover:bg-purple-700"
          >
            Go to Simple PDF Viewer (DocumentManager only)
          </a>

          <a
            href="#/about"
            className="block rounded-lg border-2 border-gray-300 px-6 py-3 text-center font-semibold text-gray-700 transition-colors hover:border-indigo-600 hover:text-indigo-600"
          >
            Learn More
          </a>
        </div>

        <div className="mt-8 rounded-lg bg-indigo-50 p-4">
          <p className="text-sm text-indigo-900">
            <strong>Getting Started:</strong> Choose a viewer to open and load your PDF documents.
            The ViewManager version supports split views, while the simple version uses tabs.
          </p>
        </div>
      </div>
    </div>
  );
}
