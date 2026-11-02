import { Button, Icon } from '@cloudpdf/viewer-react';
import { useReview } from './review'; // your app

export function ReviewControls() {
  const { notesShown, toggleNotes, saved } = useReview();
  return (
    <span className="review">
      <Button icon="message" label="Notes" active={notesShown} onClick={toggleNotes} />
      {saved && (
        <span className="saved">
          <Icon name="check" size={16} /> Saved
        </span>
      )}
    </span>
  );
}
