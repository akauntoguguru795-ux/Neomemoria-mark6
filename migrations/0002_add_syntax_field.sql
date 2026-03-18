-- Add syntax field for phrase/collocation patterns
ALTER TABLE cards ADD COLUMN syntax TEXT DEFAULT '';
