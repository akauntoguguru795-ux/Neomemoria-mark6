-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Decks (vocabulary books)
CREATE TABLE IF NOT EXISTS decks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  user_id TEXT,
  author_name TEXT DEFAULT 'Anonymous',
  is_public INTEGER DEFAULT 1,
  card_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Cards in decks
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  deck_id TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  word TEXT NOT NULL,
  meaning TEXT NOT NULL,
  example_sentence TEXT DEFAULT '',
  example_translation TEXT DEFAULT '',
  emoji TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
);

-- User progress on cards (SRS data)
CREATE TABLE IF NOT EXISTS card_progress (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  deck_id TEXT NOT NULL,
  status TEXT DEFAULT 'unseen',
  next_review TEXT,
  last_reviewed TEXT,
  review_count INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, card_id)
);

-- Study sessions for statistics
CREATE TABLE IF NOT EXISTS study_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  deck_id TEXT,
  mode TEXT DEFAULT 'normal',
  cards_studied INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  duration_seconds INTEGER DEFAULT 0,
  studied_at TEXT DEFAULT (datetime('now'))
);

-- Daily streaks
CREATE TABLE IF NOT EXISTS daily_streaks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  study_date TEXT NOT NULL,
  cards_studied INTEGER DEFAULT 0,
  UNIQUE(user_id, study_date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_decks_user ON decks(user_id);
CREATE INDEX IF NOT EXISTS idx_decks_public ON decks(is_public);
CREATE INDEX IF NOT EXISTS idx_cards_deck ON cards(deck_id);
CREATE INDEX IF NOT EXISTS idx_cards_word ON cards(word);
CREATE INDEX IF NOT EXISTS idx_progress_user ON card_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_card ON card_progress(card_id);
CREATE INDEX IF NOT EXISTS idx_progress_deck ON card_progress(deck_id);
CREATE INDEX IF NOT EXISTS idx_progress_review ON card_progress(next_review);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON study_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_streaks_user ON daily_streaks(user_id);
CREATE INDEX IF NOT EXISTS idx_streaks_date ON daily_streaks(study_date);
