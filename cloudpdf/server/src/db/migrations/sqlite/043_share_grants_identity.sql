-- Who a share link's visitors are, when the link says so (SQLite).
--
-- A link made for one person carries their identity (`identity_json`: the
-- shape of `tokens.issue`'s `identity`). Every token the exchange issues
-- for the link carries it; a field it sets is never asked, and a visitor's
-- answer for it is ignored. NULL: the visitors are whoever they answer.
ALTER TABLE share_grants ADD COLUMN identity_json TEXT;
