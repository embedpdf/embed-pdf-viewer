import { useMetadata, useMetadataState } from '@embedpdf/react/metadata';

export function TitleField() {
  const { update, canUpdate } = useMetadata();
  const { metadata } = useMetadataState();

  return (
    <label>
      Title
      <input
        defaultValue={metadata?.title ?? ''}
        disabled={!canUpdate()}
        onBlur={(event) => update({ title: event.target.value })}
      />
    </label>
  );
}
