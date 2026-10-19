-- The form's read family (SQLite).
--
-- `forms_version` is the doc-level pointer for the immutable form
-- (/form@formsVersion: its fields, every widget row, the calculation
-- order), and `widget_version` the per-page pointer for a page's widget
-- images (/form/pages/{p}/appearances@). Form writes move them and never
-- the annotation pointers, so a fill leaves every comment URL as it was;
-- an annotation write never moves them.

ALTER TABLE layers ADD COLUMN forms_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE base_versions ADD COLUMN forms_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE document_pages ADD COLUMN widget_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE layer_pages ADD COLUMN widget_version INTEGER NOT NULL DEFAULT 1;
