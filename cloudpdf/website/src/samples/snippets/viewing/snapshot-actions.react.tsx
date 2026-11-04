import { copyImage, saveFile } from '@embedpdf/react/runtime';
import { useSnapshot } from '@embedpdf/react/render';

// Beside the pages: copy the snapshot, or save it as a file
export function SnapshotActions() {
  const snapshot = useSnapshot();
  if (!snapshot) return null;
  const save = async () => saveFile(await (await snapshot.image).blob(), 'snapshot.png');
  return (
    <div className="snapshot-actions">
      {/* In the click itself, not after an await: the picture follows when it's there */}
      <button onClick={() => copyImage(snapshot.image)}>Copy</button>
      <button onClick={save}>Save</button>
    </div>
  );
}
