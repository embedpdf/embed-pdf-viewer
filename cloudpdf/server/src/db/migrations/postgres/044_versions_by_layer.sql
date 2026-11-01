-- A signature's base version belongs to the layer it was made in (postgres).
--
-- A signature writes a new base version and moves only the signing layer's
-- `base_sha`; `documents.base_sha` is the upload, where every new layer
-- starts. `layer_id` names the layer a version was made in (NULL for the
-- upload), and a layer's versions are numbered along its own chain.
ALTER TABLE base_versions
  ADD COLUMN layer_id TEXT REFERENCES layers(id) ON DELETE CASCADE,
  DROP CONSTRAINT base_versions_doc_id_number_key;

-- A signed version belongs to its signing's layer.
UPDATE base_versions v SET layer_id = s.layer_id
FROM document_signings s
WHERE v.producer_kind = 'signature' AND s.id = v.producer_ref;

CREATE UNIQUE INDEX idx_base_versions_upload ON base_versions(doc_id)
  WHERE producer_kind = 'upload';
CREATE UNIQUE INDEX idx_base_versions_layer_number ON base_versions(layer_id, number)
  WHERE layer_id IS NOT NULL;

-- Documents a signature moved go back to their upload. Their page rows were
-- the signing layer's, so they go too: the next open reads them from the
-- upload again. `doc_version` only moves forward (its URLs are immutable).
DELETE FROM document_pages p
USING documents d, base_versions v
WHERE p.doc_id = d.id AND v.doc_id = d.id AND v.producer_kind = 'upload'
  AND v.sha256 <> d.base_sha;
UPDATE documents d SET
  base_sha = v.sha256,
  storage_size_bytes = v.byte_length,
  doc_version = d.doc_version + 1
FROM base_versions v
WHERE v.doc_id = d.id AND v.producer_kind = 'upload' AND v.sha256 <> d.base_sha;

-- A live layer on another layer's version, which it was started on after
-- that signature moved the document: with nothing stored of its own, it
-- starts over on the upload. One with changes keeps its version (deleting a
-- layer keeps a version another layer is on); list them with
--   SELECT l.id, l.doc_id, l.name FROM layers l JOIN base_versions v
--   ON v.doc_id = l.doc_id AND v.sha256 = l.base_sha
--   WHERE l.deleted_at IS NULL AND v.producer_kind = 'signature'
--     AND (v.layer_id IS NULL OR v.layer_id <> l.id);
UPDATE layers l SET
  base_sha = u.sha256,
  doc_version = l.doc_version + 1
FROM base_versions u, base_versions v
WHERE u.doc_id = l.doc_id AND u.producer_kind = 'upload'
  AND v.doc_id = l.doc_id AND v.sha256 = l.base_sha AND v.producer_kind = 'signature'
  AND (v.layer_id IS NULL OR v.layer_id <> l.id)
  AND l.deleted_at IS NULL AND l.current_artifact_key IS NULL;

-- A signed version whose layer is gone (its signing went with it), and that
-- no live layer is on: nothing reads it any more.
DELETE FROM base_versions v
WHERE v.producer_kind = 'signature' AND v.layer_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM layers l
                  WHERE l.doc_id = v.doc_id AND l.base_sha = v.sha256 AND l.deleted_at IS NULL);
