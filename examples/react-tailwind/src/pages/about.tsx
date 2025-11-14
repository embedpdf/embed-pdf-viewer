export function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-purple-50 to-pink-100 p-8">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="mb-6 text-4xl font-bold text-gray-900">About This Example</h1>

        <div className="space-y-4 text-gray-600">
          <p>
            This example demonstrates how to build a fully-featured PDF viewer using EmbedPDF with
            React 18 and Tailwind CSS. It showcases the power and flexibility of EmbedPDF's plugin
            system.
          </p>

          <div className="my-6 rounded-lg bg-purple-50 p-6">
            <h2 className="mb-4 text-xl font-semibold text-purple-900">Key Technologies:</h2>
            <ul className="list-inside list-disc space-y-2">
              <li>EmbedPDF - High-performance PDF rendering</li>
              <li>React 18 - Modern component architecture</li>
              <li>Tailwind CSS - Utility-first styling</li>
              <li>PDFium Engine - Google's PDF rendering engine</li>
              <li>TypeScript - Type-safe development</li>
            </ul>
          </div>

          <div className="rounded-lg bg-purple-100 p-4">
            <h3 className="mb-2 font-semibold text-purple-900">Use Cases:</h3>
            <p className="text-sm">
              This example serves as a starting point for building document management systems,
              annotation tools, online document readers, and any application that needs robust PDF
              viewing capabilities.
            </p>
          </div>
        </div>

        <div className="mt-8 space-y-3">
          <a
            href="#/"
            className="block rounded-lg bg-purple-600 px-6 py-3 text-center font-semibold text-white transition-colors hover:bg-purple-700"
          >
            Back to Home
          </a>

          <a
            href="#/viewer"
            className="block rounded-lg border-2 border-purple-300 px-6 py-3 text-center font-semibold text-purple-700 transition-colors hover:border-purple-600 hover:bg-purple-50"
          >
            Go to PDF Viewer
          </a>
        </div>
      </div>
    </div>
  );
}
