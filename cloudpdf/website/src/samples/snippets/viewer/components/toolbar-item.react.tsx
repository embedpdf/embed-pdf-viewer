import { PDFViewer, ToolbarItem, type Layout } from '@embedpdf/viewer-react';
import { useVersions, type Version } from './versions'; // your app

const layout = (layout: Layout) =>
  layout.add({ custom: 'versions', command: 'acme:versions' }, { to: 'main', section: 'start' });

function VersionPicker() {
  const { versions, current, select } = useVersions();
  return (
    <select className="versions" value={current} onChange={(event) => select(event.target.value)}>
      {versions.map((version: Version) => (
        <option key={version.id} value={version.id}>
          {version.label}
        </option>
      ))}
    </select>
  );
}

export function Contract() {
  const { currentUrl } = useVersions();
  return (
    <PDFViewer src={currentUrl} layout={layout} style={{ height: '100vh' }}>
      <ToolbarItem id="versions">
        <VersionPicker />
      </ToolbarItem>
    </PDFViewer>
  );
}
