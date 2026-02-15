import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = { DB: D1Database }
type Variables = { userId: string | null; username: string | null }

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.use('/api/*', cors())

// Simple token-based auth middleware
app.use('/api/*', async (c, next) => {
  const auth = c.req.header('Authorization')
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice(7)
    try {
      const decoded = atob(token)
      const [userId, username] = decoded.split(':')
      if (userId && username) {
        c.set('userId', userId)
        c.set('username', username)
      }
    } catch { /* not logged in */ }
  }
  if (!c.get('userId')) {
    c.set('userId', null)
    c.set('username', null)
  }
  await next()
})

function generateId(): string {
  return crypto.randomUUID()
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + 'vocabflash-salt-2024')
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function requireAuth(c: any): string {
  const userId = c.get('userId')
  if (!userId) throw new Error('Unauthorized')
  return userId
}

// ===== AUTH ROUTES =====
app.post('/api/auth/register', async (c) => {
  const { username, password, displayName } = await c.req.json()
  if (!username || !password) return c.json({ error: 'Username and password required' }, 400)
  if (username.length < 3 || username.length > 30) return c.json({ error: 'Username must be 3-30 characters' }, 400)
  if (password.length < 6) return c.json({ error: 'Password must be at least 6 characters' }, 400)
  
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first()
  if (existing) return c.json({ error: 'Username already taken' }, 409)
  
  const id = generateId()
  const passwordHash = await hashPassword(password)
  await c.env.DB.prepare('INSERT INTO users (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)')
    .bind(id, username, passwordHash, displayName || username).run()
  
  const token = btoa(`${id}:${username}`)
  return c.json({ token, user: { id, username, displayName: displayName || username } })
})

app.post('/api/auth/login', async (c) => {
  const { username, password } = await c.req.json()
  if (!username || !password) return c.json({ error: 'Username and password required' }, 400)
  
  const passwordHash = await hashPassword(password)
  const user: any = await c.env.DB.prepare('SELECT id, username, display_name FROM users WHERE username = ? AND password_hash = ?')
    .bind(username, passwordHash).first()
  if (!user) return c.json({ error: 'Invalid credentials' }, 401)
  
  const token = btoa(`${user.id}:${user.username}`)
  return c.json({ token, user: { id: user.id, username: user.username, displayName: user.display_name } })
})

app.get('/api/auth/me', async (c) => {
  const userId = c.get('userId')
  if (!userId) return c.json({ user: null })
  const user: any = await c.env.DB.prepare('SELECT id, username, display_name, created_at FROM users WHERE id = ?')
    .bind(userId).first()
  if (!user) return c.json({ user: null })
  return c.json({ user: { id: user.id, username: user.username, displayName: user.display_name, createdAt: user.created_at } })
})

// ===== DECK ROUTES =====
// Create deck (auth optional for anonymous)
app.post('/api/decks', async (c) => {
  const userId = c.get('userId')
  const username = c.get('username')
  const { name, description, isPublic, cards } = await c.req.json()
  if (!name) return c.json({ error: 'Deck name required' }, 400)
  if (!cards || !Array.isArray(cards) || cards.length === 0) return c.json({ error: 'At least one card required' }, 400)
  
  const deckId = generateId()
  const authorName = username || 'Anonymous'
  
  await c.env.DB.prepare('INSERT INTO decks (id, name, description, user_id, author_name, is_public, card_count) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(deckId, name, description || '', userId, authorName, isPublic !== false ? 1 : 0, cards.length).run()
  
  // Batch insert cards
  const stmts = cards.map((card: any, i: number) => {
    return c.env.DB.prepare('INSERT INTO cards (id, deck_id, sort_order, word, meaning, example_sentence, example_translation, emoji) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(generateId(), deckId, i + 1, card.word || '', card.meaning || '', card.example_sentence || '', card.example_translation || '', card.emoji || '')
  })
  
  // Batch in groups of 50 to avoid limits
  for (let i = 0; i < stmts.length; i += 50) {
    await c.env.DB.batch(stmts.slice(i, i + 50))
  }
  
  return c.json({ id: deckId, name, cardCount: cards.length })
})

// Get public decks (browse/search)
app.get('/api/decks/public', async (c) => {
  const search = c.req.query('q') || ''
  const page = parseInt(c.req.query('page') || '1')
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50)
  const offset = (page - 1) * limit
  
  let query = 'SELECT d.*, (SELECT COUNT(*) FROM cards WHERE deck_id = d.id) as actual_count FROM decks d WHERE d.is_public = 1'
  let countQuery = 'SELECT COUNT(*) as total FROM decks d WHERE d.is_public = 1'
  const params: any[] = []
  const countParams: any[] = []
  
  if (search) {
    const searchClause = ` AND (d.name LIKE ? OR d.author_name LIKE ? OR EXISTS (SELECT 1 FROM cards c WHERE c.deck_id = d.id AND (c.word LIKE ? OR c.meaning LIKE ?)))`
    query += searchClause
    countQuery += searchClause
    const s = `%${search}%`
    params.push(s, s, s, s)
    countParams.push(s, s, s, s)
  }
  
  query += ' ORDER BY d.created_at DESC LIMIT ? OFFSET ?'
  params.push(limit, offset)
  
  const [decks, total] = await Promise.all([
    c.env.DB.prepare(query).bind(...params).all(),
    c.env.DB.prepare(countQuery).bind(...countParams).first()
  ])
  
  return c.json({ decks: decks.results, total: (total as any)?.total || 0, page, limit })
})

// Get my decks
app.get('/api/decks/mine', async (c) => {
  const userId = requireAuth(c)
  const decks = await c.env.DB.prepare('SELECT * FROM decks WHERE user_id = ? ORDER BY updated_at DESC').bind(userId).all()
  return c.json({ decks: decks.results })
})

// Get deck with cards
app.get('/api/decks/:id', async (c) => {
  const deckId = c.req.param('id')
  const deck: any = await c.env.DB.prepare('SELECT * FROM decks WHERE id = ?').bind(deckId).first()
  if (!deck) return c.json({ error: 'Deck not found' }, 404)
  
  const cards = await c.env.DB.prepare('SELECT * FROM cards WHERE deck_id = ? ORDER BY sort_order ASC').bind(deckId).all()
  return c.json({ deck, cards: cards.results })
})

// Update deck
app.put('/api/decks/:id', async (c) => {
  const userId = requireAuth(c)
  const deckId = c.req.param('id')
  const deck: any = await c.env.DB.prepare('SELECT * FROM decks WHERE id = ? AND user_id = ?').bind(deckId, userId).first()
  if (!deck) return c.json({ error: 'Deck not found or not authorized' }, 404)
  
  const { name, description, isPublic } = await c.req.json()
  await c.env.DB.prepare("UPDATE decks SET name = COALESCE(?, name), description = COALESCE(?, description), is_public = COALESCE(?, is_public), updated_at = datetime('now') WHERE id = ?")
    .bind(name || null, description !== undefined ? description : null, isPublic !== undefined ? (isPublic ? 1 : 0) : null, deckId).run()
  
  return c.json({ success: true })
})

// Delete deck
app.delete('/api/decks/:id', async (c) => {
  const userId = requireAuth(c)
  const deckId = c.req.param('id')
  const deck: any = await c.env.DB.prepare('SELECT * FROM decks WHERE id = ? AND user_id = ?').bind(deckId, userId).first()
  if (!deck) return c.json({ error: 'Deck not found or not authorized' }, 404)
  
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM card_progress WHERE deck_id = ?').bind(deckId),
    c.env.DB.prepare('DELETE FROM cards WHERE deck_id = ?').bind(deckId),
    c.env.DB.prepare('DELETE FROM study_sessions WHERE deck_id = ?').bind(deckId),
    c.env.DB.prepare('DELETE FROM decks WHERE id = ?').bind(deckId),
  ])
  
  return c.json({ success: true })
})

// Add card to deck
app.post('/api/decks/:id/cards', async (c) => {
  const userId = requireAuth(c)
  const deckId = c.req.param('id')
  const deck: any = await c.env.DB.prepare('SELECT * FROM decks WHERE id = ? AND user_id = ?').bind(deckId, userId).first()
  if (!deck) return c.json({ error: 'Deck not found or not authorized' }, 404)
  
  const { word, meaning, example_sentence, example_translation, emoji } = await c.req.json()
  if (!word || !meaning) return c.json({ error: 'Word and meaning required' }, 400)
  
  const maxOrder: any = await c.env.DB.prepare('SELECT MAX(sort_order) as mx FROM cards WHERE deck_id = ?').bind(deckId).first()
  const cardId = generateId()
  
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO cards (id, deck_id, sort_order, word, meaning, example_sentence, example_translation, emoji) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(cardId, deckId, (maxOrder?.mx || 0) + 1, word, meaning, example_sentence || '', example_translation || '', emoji || ''),
    c.env.DB.prepare("UPDATE decks SET card_count = card_count + 1, updated_at = datetime('now') WHERE id = ?").bind(deckId)
  ])
  
  return c.json({ id: cardId, success: true })
})

// Update card
app.put('/api/cards/:id', async (c) => {
  const userId = requireAuth(c)
  const cardId = c.req.param('id')
  const card: any = await c.env.DB.prepare('SELECT c.*, d.user_id FROM cards c JOIN decks d ON c.deck_id = d.id WHERE c.id = ?').bind(cardId).first()
  if (!card || card.user_id !== userId) return c.json({ error: 'Card not found or not authorized' }, 404)
  
  const { word, meaning, example_sentence, example_translation, emoji } = await c.req.json()
  await c.env.DB.prepare('UPDATE cards SET word = COALESCE(?, word), meaning = COALESCE(?, meaning), example_sentence = COALESCE(?, example_sentence), example_translation = COALESCE(?, example_translation), emoji = COALESCE(?, emoji) WHERE id = ?')
    .bind(word || null, meaning || null, example_sentence !== undefined ? example_sentence : null, example_translation !== undefined ? example_translation : null, emoji !== undefined ? emoji : null, cardId).run()
  
  return c.json({ success: true })
})

// Delete card
app.delete('/api/cards/:id', async (c) => {
  const userId = requireAuth(c)
  const cardId = c.req.param('id')
  const card: any = await c.env.DB.prepare('SELECT c.*, d.user_id FROM cards c JOIN decks d ON c.deck_id = d.id WHERE c.id = ?').bind(cardId).first()
  if (!card || card.user_id !== userId) return c.json({ error: 'Card not found or not authorized' }, 404)
  
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM card_progress WHERE card_id = ?').bind(cardId),
    c.env.DB.prepare('DELETE FROM cards WHERE id = ?').bind(cardId),
    c.env.DB.prepare("UPDATE decks SET card_count = card_count - 1, updated_at = datetime('now') WHERE id = ?").bind(card.deck_id)
  ])
  
  return c.json({ success: true })
})

// ===== PROGRESS & SRS ROUTES =====
// Get study cards for a deck (SRS ordering)
app.get('/api/study/:deckId', async (c) => {
  const userId = c.get('userId')
  const deckId = c.req.param('deckId')
  const mode = c.req.query('mode') || 'normal'
  
  const deck: any = await c.env.DB.prepare('SELECT * FROM decks WHERE id = ?').bind(deckId).first()
  if (!deck) return c.json({ error: 'Deck not found' }, 404)
  
  const cards = await c.env.DB.prepare('SELECT * FROM cards WHERE deck_id = ? ORDER BY sort_order ASC').bind(deckId).all()
  
  let progress: any[] = []
  if (userId) {
    const prog = await c.env.DB.prepare('SELECT * FROM card_progress WHERE user_id = ? AND deck_id = ?').bind(userId, deckId).all()
    progress = prog.results || []
  }
  
  return c.json({ deck, cards: cards.results, progress, mode })
})

// Update card progress (review result)
app.post('/api/progress', async (c) => {
  const userId = c.get('userId')
  if (!userId) {
    // For anonymous users, just return success (progress is in localStorage)
    return c.json({ success: true, storage: 'local' })
  }
  
  const { cardId, deckId, status, nextReview } = await c.req.json()
  if (!cardId || !deckId || !status) return c.json({ error: 'Missing required fields' }, 400)
  
  const existing: any = await c.env.DB.prepare('SELECT * FROM card_progress WHERE user_id = ? AND card_id = ?').bind(userId, cardId).first()
  
  const now = new Date().toISOString()
  if (existing) {
    const correct = status === 'mastered' || status === 'good' ? 1 : 0
    await c.env.DB.prepare("UPDATE card_progress SET status = ?, next_review = ?, last_reviewed = ?, review_count = review_count + 1, correct_count = correct_count + ?, updated_at = datetime('now') WHERE id = ?")
      .bind(status, nextReview || null, now, correct, existing.id).run()
  } else {
    const correct = status === 'mastered' || status === 'good' ? 1 : 0
    await c.env.DB.prepare('INSERT INTO card_progress (id, user_id, card_id, deck_id, status, next_review, last_reviewed, review_count, correct_count) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)')
      .bind(generateId(), userId, cardId, deckId, status, nextReview || null, now, correct).run()
  }
  
  // Update daily streak
  const today = new Date().toISOString().split('T')[0]
  const streakExisting: any = await c.env.DB.prepare('SELECT * FROM daily_streaks WHERE user_id = ? AND study_date = ?').bind(userId, today).first()
  if (streakExisting) {
    await c.env.DB.prepare('UPDATE daily_streaks SET cards_studied = cards_studied + 1 WHERE id = ?').bind(streakExisting.id).run()
  } else {
    await c.env.DB.prepare('INSERT INTO daily_streaks (id, user_id, study_date, cards_studied) VALUES (?, ?, ?, 1)').bind(generateId(), userId, today).run()
  }
  
  return c.json({ success: true, storage: 'server' })
})

// Reset card progress (un-master)
app.post('/api/progress/reset', async (c) => {
  const userId = requireAuth(c)
  const { cardId } = await c.req.json()
  if (!cardId) return c.json({ error: 'Card ID required' }, 400)
  
  await c.env.DB.prepare("UPDATE card_progress SET status = 'unseen', next_review = NULL, updated_at = datetime('now') WHERE user_id = ? AND card_id = ?")
    .bind(userId, cardId).run()
  
  return c.json({ success: true })
})

// Save study session
app.post('/api/sessions', async (c) => {
  const userId = c.get('userId')
  if (!userId) return c.json({ success: true, storage: 'local' })
  
  const { deckId, mode, cardsStudied, correctCount, durationSeconds } = await c.req.json()
  await c.env.DB.prepare('INSERT INTO study_sessions (id, user_id, deck_id, mode, cards_studied, correct_count, duration_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(generateId(), userId, deckId || null, mode || 'normal', cardsStudied || 0, correctCount || 0, durationSeconds || 0).run()
  
  return c.json({ success: true })
})

// Get statistics
app.get('/api/stats', async (c) => {
  const userId = c.get('userId')
  if (!userId) return c.json({ stats: null })
  
  const [totalCards, masteredCards, sessions, streaks, weeklyData] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as count FROM card_progress WHERE user_id = ?').bind(userId).first(),
    c.env.DB.prepare("SELECT COUNT(*) as count FROM card_progress WHERE user_id = ? AND status = 'mastered'").bind(userId).first(),
    c.env.DB.prepare('SELECT SUM(cards_studied) as total_cards, SUM(correct_count) as total_correct, SUM(duration_seconds) as total_time, COUNT(*) as session_count FROM study_sessions WHERE user_id = ?').bind(userId).first(),
    c.env.DB.prepare('SELECT * FROM daily_streaks WHERE user_id = ? ORDER BY study_date DESC LIMIT 60').bind(userId).all(),
    c.env.DB.prepare("SELECT study_date, SUM(cards_studied) as cards FROM daily_streaks WHERE user_id = ? AND study_date >= date('now', '-7 days') GROUP BY study_date ORDER BY study_date ASC").bind(userId).all()
  ])
  
  // Calculate streak
  const streakDates = (streaks.results || []).map((s: any) => s.study_date).sort().reverse()
  let currentStreak = 0
  const today = new Date()
  for (let i = 0; i < streakDates.length; i++) {
    const expected = new Date(today)
    expected.setDate(expected.getDate() - i)
    const expectedStr = expected.toISOString().split('T')[0]
    if (streakDates[i] === expectedStr) {
      currentStreak++
    } else if (i === 0) {
      // Check yesterday  
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      if (streakDates[i] === yesterday.toISOString().split('T')[0]) {
        currentStreak++
      } else break
    } else break
  }
  
  // Status distribution
  const distribution = await c.env.DB.prepare("SELECT status, COUNT(*) as count FROM card_progress WHERE user_id = ? GROUP BY status").bind(userId).all()
  
  return c.json({
    stats: {
      totalCards: (totalCards as any)?.count || 0,
      masteredCards: (masteredCards as any)?.count || 0,
      totalStudied: (sessions as any)?.total_cards || 0,
      totalCorrect: (sessions as any)?.total_correct || 0,
      totalTime: (sessions as any)?.total_time || 0,
      sessionCount: (sessions as any)?.session_count || 0,
      currentStreak,
      weeklyData: weeklyData.results || [],
      distribution: distribution.results || [],
      accuracy: (sessions as any)?.total_cards > 0 ? Math.round(((sessions as any)?.total_correct / (sessions as any)?.total_cards) * 100) : 0
    }
  })
})

// Get all user progress for a deck
app.get('/api/progress/:deckId', async (c) => {
  const userId = c.get('userId')
  if (!userId) return c.json({ progress: [] })
  const deckId = c.req.param('deckId')
  const progress = await c.env.DB.prepare('SELECT * FROM card_progress WHERE user_id = ? AND deck_id = ?').bind(userId, deckId).all()
  return c.json({ progress: progress.results || [] })
})

// ===== SERVE FRONTEND =====
app.get('/', (c) => c.html(getHtml()))
app.get('/app', (c) => c.html(getHtml()))
app.get('/app/*', (c) => c.html(getHtml()))

function getHtml(): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>Neomemoria - 英単語フラッシュカード</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧠</text></svg>">
<link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.1/css/all.min.css" rel="stylesheet">
<link rel="stylesheet" href="/static/styles.css">
</head>
<body>
<div id="app"></div>
<script src="/static/app.js"></script>
</body>
</html>`
}

export default app
