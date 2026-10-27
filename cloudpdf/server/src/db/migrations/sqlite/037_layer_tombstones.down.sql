-- Down for 037_layer_tombstones.sql (SQLite). Tombstones go with the column.

DELETE FROM layers WHERE deleted_at IS NOT NULL;
ALTER TABLE layers DROP COLUMN deleted_at;
