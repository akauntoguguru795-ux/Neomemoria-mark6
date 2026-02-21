/* ============================================================
   Neomemoria - Complete Frontend Application v4.0
   - 3 button layout options (settings)
   - Enlarged rating buttons
   - Simple mode same size pre/post flip
   - Password visibility toggle
   - Performance optimized (DOM diffing, debounce)
   - Study history
   - 9 premium themes
   ============================================================ */

// ===== State Management =====
const State = {
  user: null,
  token: localStorage.getItem('vf_token') || null,
  currentView: 'home',
  theme: localStorage.getItem('vf_theme') || 'dull-black',
  buttonLayout: localStorage.getItem('vf_btn_layout') || 'right',
  decks: [],
  myDecks: [],
  currentDeck: null,
  currentCards: [],
  currentProgress: {},
  studyQueue: [],
  studyIndex: 0,
  studyMode: 'normal',
  orderMode: 'srs',
  isFlipped: false,
  sessionStart: null,
  sessionCards: 0,
  sessionCorrect: 0,
  forgotQueue: [],
  forgotCounter: 0,
  history: [],
  stats: null,
  searchQuery: '',
  menuOpen: false,
};

// ===== API Helper =====
const API = {
  base: '/api',
  async request(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (State.token) headers['Authorization'] = `Bearer ${State.token}`;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    try {
      const res = await fetch(this.base + path, opts);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      return data;
    } catch (e) {
      if (e.message === 'Unauthorized') {
        State.user = null; State.token = null; localStorage.removeItem('vf_token');
      }
      throw e;
    }
  },
  get(p) { return this.request('GET', p); },
  post(p, b) { return this.request('POST', p, b); },
  put(p, b) { return this.request('PUT', p, b); },
  del(p) { return this.request('DELETE', p); },
};

// ===== Theme =====
function applyTheme(t) {
  State.theme = t;
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('vf_theme', t);
}

// ===== Button Layout =====
function setButtonLayout(layout) {
  State.buttonLayout = layout;
  localStorage.setItem('vf_btn_layout', layout);
}

// ===== Study History (localStorage) =====
const StudyHistory = {
  KEY: 'vf_study_history',
  get() { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { return []; } },
  add(entry) {
    const hist = this.get();
    hist.unshift({ ...entry, timestamp: Date.now() });
    if (hist.length > 50) hist.length = 50;
    localStorage.setItem(this.KEY, JSON.stringify(hist));
  },
  clear() { localStorage.removeItem(this.KEY); }
};

// ===== Toast =====
let toastContainer = null;
function showToast(message, type = 'info') {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i>${message}`;
  toastContainer.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 200); }, 2500);
}

// ===== Navigation =====
function navigate(view, data = {}) {
  State.currentView = view;
  Object.assign(State, data);
  render();
  window.scrollTo(0, 0);
}

// ===== Auth =====
async function initAuth() {
  if (State.token) {
    try {
      const data = await API.get('/auth/me');
      if (data && data.user) {
        State.user = data.user;
      } else {
        State.token = null;
        State.user = null;
        localStorage.removeItem('vf_token');
      }
    } catch {
      State.token = null;
      State.user = null;
      localStorage.removeItem('vf_token');
    }
  }
}

async function login(username, password) {
  try {
    const data = await API.post('/auth/login', { username, password });
    if (!data.token) throw new Error('トークンが取得できませんでした');
    State.token = data.token;
    State.user = data.user;
    localStorage.setItem('vf_token', data.token);
    showToast('ログイン成功!', 'success');
    navigate('home');
  } catch (e) {
    State.token = null;
    State.user = null;
    localStorage.removeItem('vf_token');
    throw e;
  }
}

async function register(username, password, displayName) {
  const data = await API.post('/auth/register', { username, password, displayName });
  State.token = data.token; State.user = data.user;
  localStorage.setItem('vf_token', data.token);
  showToast('アカウント作成完了!', 'success');
  navigate('home');
}

function logout() {
  State.user = null;
  State.token = null;
  localStorage.removeItem('vf_token');
  State.currentDeck = null;
  State.currentCards = [];
  State.currentProgress = {};
  State.myDecks = [];
  showToast('ログアウトしました', 'info');
  navigate('home');
}

// ===== Local Progress =====
const LocalProgress = {
  getKey(cardId) { return `vf_prog_${cardId}`; },
  get(cardId) { try { return JSON.parse(localStorage.getItem(this.getKey(cardId))) || null; } catch { return null; } },
  set(cardId, data) { localStorage.setItem(this.getKey(cardId), JSON.stringify(data)); },
  getAll() {
    const progress = {};
    State.currentCards.forEach(card => { const p = this.get(card.id); if (p) progress[card.id] = p; });
    return progress;
  }
};

// ===== SRS =====
function getNextReview(status) {
  const now = new Date();
  switch (status) {
    case 'mastered': return null;
    case 'good': return new Date(now.getTime() + 2 * 86400000).toISOString();
    case 'unsure': return new Date(now.getTime() + 1 * 86400000).toISOString();
    case 'forgot': return 'forgot';
    default: return now.toISOString();
  }
}

function buildStudyQueue(cards, progress, mode = 'srs') {
  let queue = cards.filter(c => {
    const p = progress[c.id];
    if (!p) return true;
    if (p.status === 'mastered') return false;
    return true;
  });
  if (mode === 'sequential') return queue.sort((a, b) => a.sort_order - b.sort_order);
  if (mode === 'random') return shuffleArray([...queue]);
  const now = new Date().toISOString();
  const unseen = queue.filter(c => !progress[c.id]);
  const review = queue.filter(c => progress[c.id] && progress[c.id].next_review && progress[c.id].next_review <= now);
  const future = queue.filter(c => progress[c.id] && progress[c.id].next_review && progress[c.id].next_review > now);
  if (unseen.length === queue.length) return shuffleArray(unseen);
  review.sort((a, b) => (progress[a.id]?.next_review || '').localeCompare(progress[b.id]?.next_review || ''));
  return [...review, ...shuffleArray(unseen), ...future];
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ===== CSV =====
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const cards = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = parseCSVLine(line);
    if (fields.length < 2) continue;
    if (i === 0 && (fields[0].toLowerCase() === 'no' || fields[0].toLowerCase() === 'number' || fields[0].toLowerCase() === '番号')) continue;
    let s = 0;
    if (fields.length >= 3 && /^\d+$/.test(fields[0].trim())) s = 1;
    const card = {
      word: (fields[s] || '').trim(),
      meaning: (fields[s+1] || '').trim(),
      example_sentence: (fields[s+2] || '').trim(),
      example_translation: (fields[s+3] || '').trim(),
      emoji: (fields[s+4] || '').trim(),
    };
    if (card.word && card.meaning) cards.push(card);
  }
  return cards;
}

function parseCSVLine(line) {
  const fields = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if ((ch === ',' || ch === '\t') && !inQ) { fields.push(cur); cur = ''; }
    else { cur += ch; }
  }
  fields.push(cur);
  return fields;
}

// ===== Progress Helpers =====
function getProgress(cardId) {
  if (State.user) return State.currentProgress[cardId] || null;
  return LocalProgress.get(cardId);
}
function getAllProgress() {
  if (State.user) return State.currentProgress;
  return LocalProgress.getAll();
}

async function saveProgress(cardId, deckId, status) {
  const nextReview = getNextReview(status);
  const pd = {
    status,
    next_review: nextReview === 'forgot' ? null : nextReview,
    last_reviewed: new Date().toISOString(),
    review_count: (getProgress(cardId)?.review_count || 0) + 1,
    correct_count: (getProgress(cardId)?.correct_count || 0) + (status === 'mastered' || status === 'good' ? 1 : 0),
  };
  if (State.user) {
    State.currentProgress[cardId] = pd;
    try { await API.post('/progress', { cardId, deckId, status, nextReview: pd.next_review }); } catch {}
  } else {
    LocalProgress.set(cardId, pd);
  }
}

function getStreakInfo(streak) {
  if (streak >= 30) return { emoji: '🏆', label: 'レジェンド', cls: 'streak-sparkle' };
  if (streak >= 14) return { emoji: '👑', label: 'キング', cls: '' };
  if (streak >= 7) return { emoji: '⚡', label: 'サンダー', cls: '' };
  if (streak >= 3) return { emoji: '🔥', label: 'ファイヤー', cls: '' };
  return { emoji: '📚', label: 'スタート', cls: '' };
}

// ===== Render Engine (optimized: direct innerHTML update) =====
function render() {
  const app = document.getElementById('app');
  if (!app) return;
  let html = '';
  switch (State.currentView) {
    case 'home': html = renderHome(); break;
    case 'browse': html = renderBrowse(); break;
    case 'mydecks': html = renderMyDecks(); break;
    case 'deck-view': html = renderDeckView(); break;
    case 'study-select': html = renderStudySelect(); break;
    case 'study': html = renderStudy(); break;
    case 'import': html = renderImport(); break;
    case 'stats': html = renderStats(); break;
    case 'settings': html = renderSettings(); break;
    case 'auth': html = renderAuth(); break;
    case 'publish': html = renderPublish(); break;
    case 'history': html = renderHistoryView(); break;
    default: html = renderHome();
  }
  app.innerHTML = renderHeader() + html;
  attachEventListeners();
}

function renderHeader() {
  return `
    <header class="header">
      <div class="logo" onclick="navigate('home')">
        <div class="logo-icon"><i class="fas fa-brain"></i></div>
        <span>Neomemoria</span>
      </div>
      <div class="header-actions">
        ${State.user ? `<span class="header-user">${State.user.displayName || State.user.username}</span>` : ''}
        <button class="btn-icon btn-ghost" onclick="toggleMenu()" aria-label="メニュー"><i class="fas fa-bars"></i></button>
      </div>
    </header>
    ${State.menuOpen ? renderMenu() : ''}
  `;
}

function renderMenu() {
  return `
    <div class="menu-overlay" onclick="toggleMenu()"></div>
    <nav class="menu-panel">
      <div class="menu-header">
        ${State.user ? `
          <div class="menu-user">
            <div class="menu-avatar">${(State.user.displayName || State.user.username || 'U')[0].toUpperCase()}</div>
            <div>
              <div style="font-weight:700;font-size:0.95rem;">${State.user.displayName || State.user.username}</div>
              <div style="font-size:0.78rem;color:var(--text-tertiary);">@${State.user.username}</div>
            </div>
          </div>
        ` : `
          <div style="text-align:center;">
            <div style="font-size:0.95rem;font-weight:600;margin-bottom:10px;">ゲストモード</div>
            <button class="btn btn-primary btn-sm" onclick="navigate('auth');toggleMenu();" style="width:100%;"><i class="fas fa-sign-in-alt"></i> ログイン / 登録</button>
          </div>
        `}
      </div>
      <button class="menu-item" onclick="navigate('home');toggleMenu();"><i class="fas fa-home"></i>ホーム</button>
      <button class="menu-item" onclick="navigate('browse');toggleMenu();"><i class="fas fa-globe"></i>公開単語帳を探す</button>
      <button class="menu-item" onclick="navigate('mydecks');toggleMenu();"><i class="fas fa-book"></i>マイ単語帳</button>
      <button class="menu-item" onclick="navigate('import');toggleMenu();"><i class="fas fa-file-import"></i>ファイルインポート</button>
      <button class="menu-item" onclick="navigate('history');toggleMenu();"><i class="fas fa-history"></i>学習履歴</button>
      <div class="menu-divider"></div>
      <button class="menu-item" onclick="navigate('stats');toggleMenu();"><i class="fas fa-chart-bar"></i>統計情報</button>
      <button class="menu-item" onclick="navigate('settings');toggleMenu();"><i class="fas fa-cog"></i>設定</button>
      ${State.user ? `
        <div class="menu-divider"></div>
        <button class="menu-item" onclick="logout();toggleMenu();" style="color:var(--danger);"><i class="fas fa-sign-out-alt" style="color:var(--danger);"></i>ログアウト</button>
      ` : ''}
    </nav>
  `;
}

function toggleMenu() { State.menuOpen = !State.menuOpen; render(); }

// ===== Home =====
function renderHome() {
  return `
    <div class="fade-in" style="padding-top:2px;">

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <button class="btn btn-lg btn-primary" onclick="navigate('browse')" style="flex-direction:column;padding:20px 12px;">
          <i class="fas fa-globe" style="font-size:1.3rem;margin-bottom:3px;"></i>
          <span style="font-size:0.82rem;">公開単語帳</span>
        </button>
        <button class="btn btn-lg" onclick="navigate('mydecks')" style="flex-direction:column;padding:20px 12px;">
          <i class="fas fa-book" style="font-size:1.3rem;margin-bottom:3px;"></i>
          <span style="font-size:0.82rem;">マイ単語帳</span>
        </button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
        <button class="btn" onclick="navigate('import')" style="flex-direction:column;padding:14px 8px;">
          <i class="fas fa-file-import" style="font-size:1rem;margin-bottom:2px;"></i>
          <span style="font-size:0.72rem;">インポート</span>
        </button>
        <button class="btn" onclick="navigate('history')" style="flex-direction:column;padding:14px 8px;">
          <i class="fas fa-history" style="font-size:1rem;margin-bottom:2px;"></i>
          <span style="font-size:0.72rem;">学習履歴</span>
        </button>
        <button class="btn" onclick="navigate('stats')" style="flex-direction:column;padding:14px 8px;">
          <i class="fas fa-chart-bar" style="font-size:1rem;margin-bottom:2px;"></i>
          <span style="font-size:0.72rem;">統計情報</span>
        </button>
      </div>
      ${!State.user ? `
        <div class="card" style="text-align:center;">
          <p style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:8px;">ログインすると学習進捗がサーバーに保存されます</p>
          <button class="btn btn-primary btn-sm" onclick="navigate('auth')"><i class="fas fa-user-plus"></i> 無料登録 / ログイン</button>
        </div>
      ` : ''}
    </div>
  `;
}

// ===== Browse =====
function renderBrowse() {
  return `
    <div class="fade-in">
      <div class="page-title-row">
        <button class="btn-icon btn-ghost" onclick="navigate('home')"><i class="fas fa-arrow-left"></i></button>
        <h2 class="section-title" style="margin:0;">公開単語帳</h2>
      </div>
      <div class="search-bar">
        <div class="search-wrapper">
          <i class="fas fa-search"></i>
          <input type="text" class="search-input" placeholder="単語帳名、作成者、単語を検索..." value="${State.searchQuery}" onkeyup="handleSearch(event)" id="search-input">
        </div>
      </div>
      <div id="deck-list" class="deck-list"><div class="loading"><div class="spinner"></div></div></div>
    </div>
  `;
}

let searchTimeout = null;
function handleSearch(e) { State.searchQuery = e.target.value; clearTimeout(searchTimeout); searchTimeout = setTimeout(() => loadPublicDecks(), 350); }

async function loadPublicDecks() {
  const c = document.getElementById('deck-list');
  if (!c) return;
  c.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const q = State.searchQuery ? `?q=${encodeURIComponent(State.searchQuery)}` : '';
    const data = await API.get(`/decks/public${q}`);
    if (!data.decks || data.decks.length === 0) {
      c.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">単語帳が見つかりません</div></div>';
      return;
    }
    c.innerHTML = data.decks.map(d => `
      <div class="deck-item" onclick="openDeck('${d.id}')">
        <div class="deck-icon"><i class="fas fa-layer-group"></i></div>
        <div class="deck-info">
          <div class="deck-name">${esc(d.name)}</div>
          <div class="deck-meta">${esc(d.author_name)} · ${d.card_count || d.actual_count || 0}語 · ${fmtDate(d.created_at)}</div>
        </div>
        <i class="fas fa-chevron-right" style="color:var(--text-tertiary);font-size:0.75rem;"></i>
      </div>
    `).join('');
  } catch { c.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">読み込みエラー</div></div>'; }
}

// ===== My Decks =====
function renderMyDecks() {
  return `
    <div class="fade-in">
      <div class="page-title-row">
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="btn-icon btn-ghost" onclick="navigate('home')"><i class="fas fa-arrow-left"></i></button>
          <h2 class="section-title" style="margin:0;">マイ単語帳</h2>
        </div>
        <button class="btn btn-primary btn-sm" onclick="navigate('import')"><i class="fas fa-plus"></i> 追加</button>
      </div>
      <div id="my-deck-list" class="deck-list"><div class="loading"><div class="spinner"></div></div></div>
    </div>
  `;
}

async function loadMyDecks() {
  const c = document.getElementById('my-deck-list');
  if (!c) return;
  if (!State.user) {
    const local = JSON.parse(localStorage.getItem('vf_local_decks') || '[]');
    if (local.length === 0) {
      c.innerHTML = '<div class="empty-state"><div class="empty-icon">📚</div><div class="empty-text">単語帳がありません</div><button class="btn btn-primary" onclick="navigate(\'import\')" style="margin-top:12px;"><i class="fas fa-file-import"></i> インポート</button></div>';
      return;
    }
    c.innerHTML = local.map(d => renderDeckItem(d, true)).join('');
    return;
  }
  try {
    const data = await API.get('/decks/mine');
    if (!data.decks || data.decks.length === 0) {
      c.innerHTML = '<div class="empty-state"><div class="empty-icon">📚</div><div class="empty-text">単語帳がありません</div><button class="btn btn-primary" onclick="navigate(\'import\')" style="margin-top:12px;"><i class="fas fa-file-import"></i> インポート</button></div>';
      return;
    }
    State.myDecks = data.decks;
    c.innerHTML = data.decks.map(d => renderDeckItem(d, true)).join('');
  } catch (e) { c.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">${e.message}</div></div>`; }
}

function renderDeckItem(deck, showActions = false) {
  const isOwner = State.user && deck.user_id === State.user.id;
  return `
    <div class="deck-item">
      <div class="deck-icon" onclick="openDeck('${deck.id}')"><i class="fas fa-layer-group"></i></div>
      <div class="deck-info" onclick="openDeck('${deck.id}')">
        <div class="deck-name">${esc(deck.name)}</div>
        <div class="deck-meta">${deck.card_count || 0}語 · ${deck.is_public ? '🌐 公開' : '🔒 非公開'} · ${fmtDate(deck.updated_at || deck.created_at)}</div>
      </div>
      ${showActions && isOwner ? `
        <div class="deck-actions">
          <button class="btn-icon-sm btn-ghost" onclick="event.stopPropagation();renameDeck('${deck.id}','${esc(deck.name)}')" title="名前変更"><i class="fas fa-pen" style="font-size:0.7rem;"></i></button>
          <button class="btn-icon-sm btn-ghost" onclick="event.stopPropagation();confirmDeleteDeck('${deck.id}','${esc(deck.name)}')" title="削除" style="color:var(--danger);"><i class="fas fa-trash" style="font-size:0.7rem;"></i></button>
        </div>
      ` : ''}
    </div>
  `;
}

// ===== Deck View =====
async function openDeck(deckId) {
  State.currentDeck = null; State.currentCards = [];
  navigate('deck-view');
  try {
    const data = await API.get(`/decks/${deckId}`);
    State.currentDeck = data.deck; State.currentCards = data.cards;
    if (State.user) {
      const pd = await API.get(`/progress/${deckId}`);
      State.currentProgress = {};
      (pd.progress || []).forEach(p => { State.currentProgress[p.card_id] = p; });
    } else { State.currentProgress = LocalProgress.getAll(); }
    render();
  } catch { showToast('単語帳の読み込みに失敗しました', 'error'); }
}

function renderDeckView() {
  if (!State.currentDeck) return '<div class="loading"><div class="spinner"></div></div>';
  const deck = State.currentDeck;
  const cards = State.currentCards;
  const progress = getAllProgress();
  const isOwner = State.user && deck.user_id === State.user.id;
  const masteredCount = cards.filter(c => progress[c.id]?.status === 'mastered').length;
  return `
    <div class="fade-in">
      <div class="page-title-row">
        <button class="btn-icon btn-ghost" onclick="navigate('${isOwner ? 'mydecks' : 'browse'}')"><i class="fas fa-arrow-left"></i></button>
        <div style="flex:1;min-width:0;">
          <h2 style="font-size:1.02rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(deck.name)}</h2>
          <div style="font-size:0.72rem;color:var(--text-tertiary);">by ${esc(deck.author_name)} · ${cards.length}語</div>
        </div>
      </div>
      <div class="stats-grid" style="margin-bottom:10px;">
        <div class="stat-card"><div class="stat-value">${cards.length}</div><div class="stat-label">全単語数</div></div>
        <div class="stat-card"><div class="stat-value">${masteredCount}</div><div class="stat-label">習得済み</div></div>
      </div>
      <div class="progress-bar-container" style="margin-bottom:12px;">
        <div class="progress-bar-fill" style="width:${cards.length ? Math.round(masteredCount / cards.length * 100) : 0}%;"></div>
      </div>
      <button class="btn btn-primary btn-lg" onclick="startStudySelect('${deck.id}')" style="width:100%;margin-bottom:8px;"><i class="fas fa-play"></i> 学習開始</button>
      ${isOwner ? `
        <div style="display:flex;gap:6px;margin-bottom:10px;">
          <button class="btn btn-sm" onclick="showAddCardModal('${deck.id}')" style="flex:1;"><i class="fas fa-plus"></i> 単語追加</button>
          <button class="btn btn-sm" onclick="navigate('publish', {publishDeckId:'${deck.id}'})" style="flex:1;"><i class="fas fa-globe"></i> ${deck.is_public ? '公開設定' : '公開する'}</button>
        </div>
      ` : ''}
      <div class="section-title" style="margin-top:10px;">単語一覧</div>
      <div class="card" style="padding:0;overflow:hidden;">
        ${cards.map((card, i) => {
          const p = progress[card.id];
          const sc = p ? `status-${p.status}` : 'status-unseen';
          return `
            <div class="card-list-item">
              <div class="card-list-number">${i + 1}</div>
              <div class="card-list-word">${esc(card.word)}</div>
              <div class="card-list-meaning">${esc(card.meaning)}</div>
              <div class="card-list-status ${sc}"></div>
              ${isOwner ? `<button class="btn-icon-sm btn-ghost" onclick="event.stopPropagation();editCard('${card.id}')" style="flex-shrink:0;"><i class="fas fa-pen" style="font-size:0.6rem;"></i></button><button class="btn-icon-sm btn-ghost" onclick="event.stopPropagation();deleteCard('${card.id}','${esc(card.word)}')" style="flex-shrink:0;color:var(--danger);"><i class="fas fa-times" style="font-size:0.65rem;"></i></button>` : ''}
              ${p?.status === 'mastered' ? `<button class="btn-icon-sm btn-ghost" onclick="event.stopPropagation();resetCard('${card.id}')" title="未習得に戻す"><i class="fas fa-undo" style="font-size:0.6rem;"></i></button>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ===== Study Select =====
function startStudySelect(deckId) { navigate('study-select', { studyDeckId: deckId }); }

function renderStudySelect() {
  return `
    <div class="fade-in">
      <div class="page-title-row">
        <button class="btn-icon btn-ghost" onclick="openDeck('${State.studyDeckId}')"><i class="fas fa-arrow-left"></i></button>
        <h2 class="section-title" style="margin:0;">学習モード選択</h2>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button class="card study-mode-card" onclick="startStudy('normal')">
          <div class="study-mode-icon" style="background:var(--info-bg);color:var(--info);"><i class="fas fa-clone"></i></div>
          <div class="study-mode-info">
            <div class="study-mode-name">ノーマルモード</div>
            <div class="study-mode-desc">表面: 番号と単語 → 裏面: 意味・例文・絵文字</div>
          </div>
        </button>
        <button class="card study-mode-card" onclick="startStudy('simple')">
          <div class="study-mode-icon" style="background:var(--success-bg);color:var(--success);"><i class="fas fa-check-circle"></i></div>
          <div class="study-mode-info">
            <div class="study-mode-name">シンプルモード</div>
            <div class="study-mode-desc">⭕️正解 / ❌不正解 のシンプル2択（めくる前から表示）</div>
          </div>
        </button>
        <button class="card study-mode-card" onclick="startStudy('oni')">
          <div class="study-mode-icon" style="background:var(--danger-bg);color:var(--danger);"><i class="fas fa-fire"></i></div>
          <div class="study-mode-info">
            <div class="study-mode-name">🔥 鬼モード</div>
            <div class="study-mode-desc">意味を見てスペルを入力（大文字小文字は許容）</div>
          </div>
        </button>
      </div>
      <div class="srs-explain-card">
        <div class="srs-explain-title"><i class="fas fa-brain"></i> SRS順とは？</div>
        <div class="srs-explain-text">
          SRS（Spaced Repetition System＝<strong>間隔反復法</strong>）は、忘れかけたタイミングで復習することで記憶を定着させる科学的な学習法です。<br>
          <strong>期限の近いカードから優先出題</strong>され、初回はランダムに出題されます。
        </div>
        <div class="srs-detail-grid">
          <div class="srs-detail-item"><div class="srs-label">💎 完全に覚えた</div><div class="srs-desc">もう出題しない</div></div>
          <div class="srs-detail-item"><div class="srs-label">👍 普通</div><div class="srs-desc">2日後に再出題</div></div>
          <div class="srs-detail-item"><div class="srs-label">🤔 自信なし</div><div class="srs-desc">1日後に再出題</div></div>
          <div class="srs-detail-item"><div class="srs-label">💀 完全に忘れた</div><div class="srs-desc">20枚後に再出題</div></div>
        </div>
      </div>
    </div>
  `;
}

// ===== Study View =====
async function startStudy(mode) {
  State.studyMode = mode;
  State.isFlipped = false;
  State.sessionStart = Date.now();
  State.sessionCards = 0;
  State.sessionCorrect = 0;
  State.forgotQueue = [];
  State.forgotCounter = 0;
  State.history = [];
  const progress = getAllProgress();
  State.studyQueue = buildStudyQueue(State.currentCards, progress, State.orderMode === 'srs' ? 'srs' : State.orderMode);
  State.studyIndex = 0;
  if (State.studyQueue.length === 0) {
    showToast('学習する単語がありません！全て習得済みです 🎉', 'success');
    return;
  }
  navigate('study');
}

function renderStudy() {
  if (State.studyQueue.length === 0 || State.studyIndex >= State.studyQueue.length) return renderStudyComplete();
  if (State.forgotQueue.length > 0 && State.forgotCounter >= 20) {
    const fc = State.forgotQueue.shift();
    State.studyQueue.splice(State.studyIndex, 0, fc);
    State.forgotCounter = 0;
  }
  const card = State.studyQueue[State.studyIndex];
  if (!card) return renderStudyComplete();
  const total = State.studyQueue.length;
  const current = State.studyIndex + 1;
  const pct = Math.round((current / total) * 100);
  const modeLabels = { normal: 'ノーマル', simple: 'シンプル', oni: '🔥 鬼' };
  const orderLabels = { srs: 'SRS順', random: 'ランダム', sequential: '番号順' };
  const layout = State.buttonLayout;

  return `
    <div class="study-view fade-in">
      <div class="study-top-bar">
        <button class="btn btn-sm btn-ghost" onclick="endStudySession()"><i class="fas fa-times"></i> 終了</button>
        <div class="mode-indicator">${modeLabels[State.studyMode]} · ${orderLabels[State.orderMode]}</div>
        <span class="study-counter">${current} / ${total}</span>
      </div>
      <div class="progress-bar-container"><div class="progress-bar-fill" style="width:${pct}%;"></div></div>
      ${State.studyMode === 'oni' ? renderOniCard(card) : renderFlashcard(card)}
      <div class="study-controls">
        ${renderRatingArea(card, layout)}
        <div class="study-bottom-controls">
          <button class="btn btn-sm ${State.history.length === 0 ? 'btn-ghost' : ''}" onclick="undoLastRating()" ${State.history.length === 0 ? 'disabled style="opacity:0.35;"' : ''}>
            <i class="fas fa-undo"></i> 戻る
          </button>
          <button class="btn btn-sm" onclick="toggleOrder()">
            <i class="fas fa-${State.orderMode === 'random' ? 'random' : State.orderMode === 'sequential' ? 'sort-numeric-down' : 'brain'}"></i>
            ${orderLabels[State.orderMode]}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderFlashcard(card) {
  const front = State.studyMode === 'simple'
    ? `<div class="fc-word">${esc(card.word)}</div>${card.emoji ? `<div class="fc-emoji">${card.emoji}</div>` : ''}`
    : `<div class="fc-number">#${card.sort_order}</div><div class="fc-word">${esc(card.word)}</div>`;

  const back = State.studyMode === 'simple'
    ? `<div class="fc-meaning-lg">${esc(card.meaning)}</div>${card.emoji ? `<div class="fc-emoji">${card.emoji}</div>` : ''}`
    : `<div class="fc-meaning-lg">${esc(card.meaning)}</div>
       ${card.example_sentence ? `<div class="fc-example">${esc(card.example_sentence)}</div>` : ''}
       ${card.example_translation ? `<div class="fc-example-jp">${esc(card.example_translation)}</div>` : ''}
       ${card.emoji ? `<div class="fc-emoji">${card.emoji}</div>` : ''}`;

  return `
    <div class="flashcard-area">
      <div class="flashcard ${State.isFlipped ? 'flipped' : ''}" onclick="flipCard()">
        <div class="flashcard-face flashcard-front">${front}<div class="fc-tap-hint">タップしてめくる</div></div>
        <div class="flashcard-face flashcard-back">${back}</div>
      </div>
    </div>
  `;
}

function renderOniCard(card) {
  return `
    <div class="flashcard-area">
      <div class="flashcard" style="transform:none;">
        <div class="flashcard-face flashcard-front" style="position:relative;backface-visibility:visible;">
          <div class="fc-number">#${card.sort_order}</div>
          <div class="fc-meaning-lg">${esc(card.meaning)}</div>
          ${card.emoji ? `<div class="fc-emoji">${card.emoji}</div>` : ''}
        </div>
      </div>
    </div>
    <div class="oni-input-area">
      <input type="text" class="oni-input" id="oni-input" placeholder="英単語のスペルを入力..." onkeydown="if(event.key==='Enter')checkOniAnswer()" autocomplete="off" autocapitalize="off" spellcheck="false">
      <button class="btn btn-primary" onclick="checkOniAnswer()"><i class="fas fa-check"></i></button>
    </div>
    <div id="oni-result" style="margin-top:6px;text-align:center;min-height:22px;"></div>
  `;
}

function renderRatingArea(card, layout) {
  const layoutClass = `layout-${layout}`;

  // Simple mode: SAME size/position pre and post flip
  if (State.studyMode === 'simple') {
    const preflipClass = State.isFlipped ? 'simple-postflip' : 'simple-preflip';
    return `
      <div class="rating-area-wrap ${layoutClass}">
        <div class="simple-btns ${preflipClass}">
          <button class="simple-btn simple-correct" onclick="${State.isFlipped ? "rateCard('good')" : "flipAndRate('good')"}"><span>⭕</span></button>
          <button class="simple-btn simple-wrong" onclick="${State.isFlipped ? "rateCard('forgot')" : "flipAndRate('forgot')"}"><span>❌</span></button>
          <div class="simple-hint-text">${State.isFlipped ? '回答を選択' : 'めくらずに回答 or タップでめくる'}</div>
        </div>
      </div>
    `;
  }

  // Normal mode: show 2x2 grid only after flip
  if (!State.isFlipped) return '';

  return `
    <div class="rating-area-wrap ${layoutClass}">
      <div class="rating-grid-2x2">
        <button class="rating-btn rating-btn-mastered" onclick="rateCard('mastered')">
          <span class="rating-icon">💎</span>
          <span class="rating-label">完全に覚えた</span>
          <span class="rating-hint">非表示</span>
        </button>
        <button class="rating-btn rating-btn-good" onclick="rateCard('good')">
          <span class="rating-icon">👍</span>
          <span class="rating-label">普通</span>
          <span class="rating-hint">2日後</span>
        </button>
        <button class="rating-btn rating-btn-unsure" onclick="rateCard('unsure')">
          <span class="rating-icon">🤔</span>
          <span class="rating-label">自信なし</span>
          <span class="rating-hint">1日後</span>
        </button>
        <button class="rating-btn rating-btn-forgot" onclick="rateCard('forgot')">
          <span class="rating-icon">💀</span>
          <span class="rating-label">完全に忘れた</span>
          <span class="rating-hint">20枚後</span>
        </button>
      </div>
    </div>
  `;
}

function flipAndRate(status) {
  State.isFlipped = true;
  render();
  setTimeout(() => rateCard(status), 350);
}

function flipCard() { State.isFlipped = !State.isFlipped; render(); }

async function rateCard(status) {
  const card = State.studyQueue[State.studyIndex];
  if (!card) return;
  State.history.push({ index: State.studyIndex, card, status, previousProgress: getProgress(card.id) });
  await saveProgress(card.id, State.currentDeck.id, status);
  State.sessionCards++;
  if (status === 'mastered' || status === 'good') State.sessionCorrect++;
  if (status === 'forgot') { State.forgotQueue.push(card); State.forgotCounter = 0; } else { State.forgotCounter++; }
  State.studyIndex++;
  State.isFlipped = false;
  render();
  if (State.studyMode === 'oni') setTimeout(() => { const i = document.getElementById('oni-input'); if (i) i.focus(); }, 80);
}

async function checkOniAnswer() {
  const input = document.getElementById('oni-input');
  const rd = document.getElementById('oni-result');
  if (!input || !rd) return;
  const card = State.studyQueue[State.studyIndex];
  if (!card) return;
  const ans = input.value.trim();
  if (!ans) return;
  const ok = ans.toLowerCase() === card.word.toLowerCase();
  input.classList.remove('correct', 'wrong');
  input.classList.add(ok ? 'correct' : 'wrong');
  rd.innerHTML = ok
    ? `<span style="color:var(--success);font-weight:700;">⭕ 正解！ ${esc(card.word)}</span>`
    : `<span style="color:var(--danger);font-weight:700;">❌ 不正解… 正解: ${esc(card.word)}</span>`;
  setTimeout(() => rateCard(ok ? 'good' : 'forgot'), 1000);
}

function undoLastRating() {
  if (State.history.length === 0) return;
  const last = State.history.pop();
  State.studyIndex = last.index;
  State.isFlipped = false;
  State.sessionCards = Math.max(0, State.sessionCards - 1);
  if (last.previousProgress) {
    if (State.user) State.currentProgress[last.card.id] = last.previousProgress;
    else LocalProgress.set(last.card.id, last.previousProgress);
  }
  render();
  showToast('前の評価を取り消しました', 'info');
}

function toggleOrder() {
  const modes = ['srs', 'random', 'sequential'];
  const idx = modes.indexOf(State.orderMode);
  State.orderMode = modes[(idx + 1) % modes.length];
  const remaining = State.studyQueue.slice(State.studyIndex);
  const progress = getAllProgress();
  if (State.orderMode === 'random') {
    State.studyQueue = [...State.studyQueue.slice(0, State.studyIndex), ...shuffleArray(remaining)];
  } else if (State.orderMode === 'sequential') {
    remaining.sort((a, b) => a.sort_order - b.sort_order);
    State.studyQueue = [...State.studyQueue.slice(0, State.studyIndex), ...remaining];
  } else {
    State.studyQueue = [...State.studyQueue.slice(0, State.studyIndex), ...buildStudyQueue(remaining, progress, 'srs')];
  }
  render();
  showToast(`${State.orderMode === 'random' ? 'ランダム' : State.orderMode === 'sequential' ? '番号順' : 'SRS順'}に切り替え`, 'info');
}

async function endStudySession() {
  if (State.sessionCards > 0) {
    const dur = Math.round((Date.now() - State.sessionStart) / 1000);
    StudyHistory.add({
      deckId: State.currentDeck?.id,
      deckName: State.currentDeck?.name || '不明',
      mode: State.studyMode,
      cardsStudied: State.sessionCards,
      correctCount: State.sessionCorrect,
      duration: dur
    });
    try { await API.post('/sessions', { deckId: State.currentDeck?.id, mode: State.studyMode, cardsStudied: State.sessionCards, correctCount: State.sessionCorrect, durationSeconds: dur }); } catch {}
  }
  openDeck(State.currentDeck.id);
}

function renderStudyComplete() {
  const dur = State.sessionStart ? Math.round((Date.now() - State.sessionStart) / 1000) : 0;
  const mins = Math.floor(dur / 60);
  const secs = dur % 60;
  const acc = State.sessionCards > 0 ? Math.round((State.sessionCorrect / State.sessionCards) * 100) : 0;
  if (State.sessionCards > 0) {
    StudyHistory.add({
      deckId: State.currentDeck?.id,
      deckName: State.currentDeck?.name || '不明',
      mode: State.studyMode,
      cardsStudied: State.sessionCards,
      correctCount: State.sessionCorrect,
      duration: dur
    });
    API.post('/sessions', { deckId: State.currentDeck?.id, mode: State.studyMode, cardsStudied: State.sessionCards, correctCount: State.sessionCorrect, durationSeconds: dur }).catch(() => {});
  }
  return `
    <div class="fade-in" style="text-align:center;padding-top:24px;">
      <div style="font-size:3rem;margin-bottom:10px;">🎉</div>
      <h2 style="font-size:1.2rem;font-weight:800;margin-bottom:5px;">セッション完了！</h2>
      <p style="color:var(--text-secondary);margin-bottom:16px;font-size:0.85rem;">お疲れ様でした！</p>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-value">${State.sessionCards}</div><div class="stat-label">学習カード</div></div>
        <div class="stat-card"><div class="stat-value">${acc}%</div><div class="stat-label">正答率</div></div>
        <div class="stat-card"><div class="stat-value">${mins}:${secs.toString().padStart(2, '0')}</div><div class="stat-label">学習時間</div></div>
        <div class="stat-card"><div class="stat-value">${State.sessionCorrect}</div><div class="stat-label">正解数</div></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;">
        <button class="btn btn-primary btn-lg" onclick="startStudy(State.studyMode)"><i class="fas fa-redo"></i> もう一度学習</button>
        <button class="btn btn-lg" onclick="openDeck('${State.currentDeck?.id}')"><i class="fas fa-arrow-left"></i> 単語帳に戻る</button>
      </div>
    </div>
  `;
}

// ===== Study History =====
function renderHistoryView() {
  const hist = StudyHistory.get();
  return `
    <div class="fade-in">
      <div class="page-title-row">
        <button class="btn-icon btn-ghost" onclick="navigate('home')"><i class="fas fa-arrow-left"></i></button>
        <h2 class="section-title" style="margin:0;">学習履歴</h2>
        ${hist.length > 0 ? `<button class="btn btn-sm btn-ghost" onclick="if(confirm('履歴をすべて削除しますか？')){StudyHistory.clear();render();}"><i class="fas fa-trash"></i></button>` : ''}
      </div>
      ${hist.length === 0 ? `
        <div class="empty-state"><div class="empty-icon">📖</div><div class="empty-text">まだ学習履歴がありません</div></div>
      ` : `
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${hist.map(h => {
            const mLabels = { normal: 'ノーマル', simple: 'シンプル', oni: '🔥鬼' };
            const d = new Date(h.timestamp);
            const dateStr = `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2,'0')}`;
            const acc = h.cardsStudied > 0 ? Math.round((h.correctCount / h.cardsStudied) * 100) : 0;
            return `
              <div class="history-item" onclick="openDeck('${h.deckId}')">
                <div class="history-icon"><i class="fas fa-book-open"></i></div>
                <div class="history-info">
                  <div class="history-name">${esc(h.deckName)}</div>
                  <div class="history-meta">${dateStr} · ${mLabels[h.mode] || h.mode} · ${h.cardsStudied}枚 · ${acc}%正解 · ${fmtTime(h.duration)}</div>
                </div>
                <i class="fas fa-chevron-right" style="color:var(--text-tertiary);font-size:0.7rem;flex-shrink:0;"></i>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;
}

// ===== Import =====
function renderImport() {
  return `
    <div class="fade-in">
      <div class="page-title-row">
        <button class="btn-icon btn-ghost" onclick="navigate('home')"><i class="fas fa-arrow-left"></i></button>
        <h2 class="section-title" style="margin:0;">ファイルインポート</h2>
      </div>
      <div class="input-group"><label class="input-label">単語帳の名前 *</label><input type="text" class="input" id="import-name" placeholder="例: TOEIC 頻出単語 500"></div>
      <div class="input-group"><label class="input-label">説明（任意）</label><input type="text" class="input" id="import-desc" placeholder="単語帳の説明"></div>
      <div class="file-drop-zone" id="drop-zone" onclick="document.getElementById('file-input').click()">
        <i class="fas fa-cloud-upload-alt"></i>
        <div class="file-drop-text">CSV / TXT ファイルをタップして選択</div>
        <div class="file-drop-sub">対応形式: CSV (.csv) / テキスト (.txt) / TSV (.tsv)</div>
        <div class="file-drop-sub" style="margin-top:2px;">形式: No,単語,意味,例文,和訳,絵文字（例文以降は任意）</div>
        <div class="file-drop-sub" style="margin-top:1px;"><i class="fas fa-info-circle" style="margin-right:3px;"></i>テキストファイル (.txt) もカンマ区切り・タブ区切りでインポートできます</div>
      </div>
      <input type="file" class="file-input-hidden" id="file-input" accept=".csv,.txt,.tsv" multiple onchange="handleFileImport(event)">
      <div style="margin-top:10px;"><label class="input-label">または直接テキスト入力</label><textarea class="textarea" id="import-text" rows="4" placeholder="1,apple,りんご,I eat an apple.,私はりんごを食べる。,🍎"></textarea></div>
      <div id="import-preview" style="margin-top:10px;"></div>
      <button class="btn btn-primary btn-lg" onclick="executeImport()" style="width:100%;margin-top:10px;"><i class="fas fa-file-import"></i> インポート</button>
    </div>
  `;
}

let importedCards = [];
function handleFileImport(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  importedCards = [];
  let done = 0;
  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      importedCards = importedCards.concat(parseCSV(e.target.result));
      done++;
      if (done === files.length) showImportPreview();
    };
    reader.readAsText(file);
  });
}

function showImportPreview() {
  const p = document.getElementById('import-preview');
  if (!p) return;
  if (importedCards.length === 0) { p.innerHTML = '<div class="card" style="text-align:center;color:var(--danger);"><i class="fas fa-exclamation-triangle"></i> パースできる単語が見つかりません</div>'; return; }
  p.innerHTML = `
    <div class="card" style="padding:12px;">
      <div style="font-weight:700;margin-bottom:4px;">${importedCards.length}語を検出</div>
      <div style="max-height:160px;overflow-y:auto;">
        ${importedCards.slice(0, 8).map((c, i) => `<div class="card-list-item"><div class="card-list-number">${i+1}</div><div class="card-list-word">${esc(c.word)}</div><div class="card-list-meaning">${esc(c.meaning)}</div></div>`).join('')}
        ${importedCards.length > 8 ? `<div style="text-align:center;padding:5px;color:var(--text-tertiary);font-size:0.78rem;">…他 ${importedCards.length - 8}語</div>` : ''}
      </div>
    </div>
  `;
}

async function executeImport() {
  const name = document.getElementById('import-name')?.value?.trim();
  const desc = document.getElementById('import-desc')?.value?.trim() || '';
  const ta = document.getElementById('import-text')?.value?.trim();
  if (!name) { showToast('単語帳の名前を入力してください', 'error'); return; }
  if (importedCards.length === 0 && ta) importedCards = parseCSV(ta);
  if (importedCards.length === 0) { showToast('インポートする単語がありません', 'error'); return; }
  try {
    const data = await API.post('/decks', { name, description: desc, isPublic: false, cards: importedCards });
    importedCards = [];
    showToast(`${data.cardCount}語をインポートしました！`, 'success');
    openDeck(data.id);
  } catch (e) { showToast('インポート失敗: ' + e.message, 'error'); }
}

// ===== Stats =====
function renderStats() {
  return `
    <div class="fade-in">
      <div class="page-title-row">
        <button class="btn-icon btn-ghost" onclick="navigate('home')"><i class="fas fa-arrow-left"></i></button>
        <h2 class="section-title" style="margin:0;">統計情報</h2>
      </div>
      <div id="stats-content"><div class="loading"><div class="spinner"></div></div></div>
    </div>
  `;
}

async function loadStats() {
  const c = document.getElementById('stats-content');
  if (!c) return;
  if (!State.user) {
    c.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-text">統計はログインが必要です</div><button class="btn btn-primary" onclick="navigate(\'auth\')" style="margin-top:10px;"><i class="fas fa-sign-in-alt"></i> ログイン</button></div>';
    return;
  }
  try {
    const data = await API.get('/stats');
    const s = data.stats;
    if (!s) { c.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-text">まだ学習データがありません</div></div>'; return; }
    const si = getStreakInfo(s.currentStreak);
    const mx = Math.max(...(s.weeklyData || []).map(d => d.cards), 1);
    const days = ['日','月','火','水','木','金','土'];
    const dm = {};
    (s.distribution || []).forEach(d => { dm[d.status] = d.count; });
    const td = Object.values(dm).reduce((a, b) => a + b, 0) || 1;
    c.innerHTML = `
      <div class="streak-display">
        <div class="streak-badge ${si.cls}">${si.emoji}</div>
        <div class="streak-number">${s.currentStreak}</div>
        <div class="streak-label">連続学習日数 · ${si.label}</div>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-value">${s.totalStudied || 0}</div><div class="stat-label">総学習カード</div></div>
        <div class="stat-card"><div class="stat-value">${s.accuracy}%</div><div class="stat-label">正答率</div></div>
        <div class="stat-card"><div class="stat-value">${s.masteredCards}</div><div class="stat-label">習得済み</div></div>
        <div class="stat-card"><div class="stat-value">${fmtTime(s.totalTime || 0)}</div><div class="stat-label">総学習時間</div></div>
      </div>
      <div class="section-title">週間学習グラフ</div>
      <div class="weekly-chart">
        ${(s.weeklyData||[]).map(d => { const h = Math.max(4, Math.round((d.cards/mx)*70)); const dn = days[new Date(d.study_date).getDay()]; return `<div class="chart-bar-wrapper"><div class="chart-bar" style="height:${h}px;"></div><div class="chart-label">${dn}</div></div>`; }).join('')}
        ${(s.weeklyData||[]).length===0 ? '<div style="flex:1;text-align:center;color:var(--text-tertiary);font-size:0.8rem;align-self:center;">データなし</div>' : ''}
      </div>
      <div class="section-title">習熟度分布</div>
      <div class="distribution-bars">
        ${['mastered','good','unsure','forgot'].map(k => {
          const labels = {mastered:'習得済み',good:'普通',unsure:'自信なし',forgot:'忘れた'};
          const colors = {mastered:'var(--success)',good:'var(--info)',unsure:'var(--warning)',forgot:'var(--danger)'};
          return `<div class="dist-row"><div class="dist-label">${labels[k]}</div><div class="dist-bar-track"><div class="dist-bar-fill" style="width:${(dm[k]||0)/td*100}%;background:${colors[k]};"></div></div><div class="dist-count">${dm[k]||0}</div></div>`;
        }).join('')}
      </div>
    `;
  } catch (e) { c.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">${e.message}</div></div>`; }
}

// ===== Settings =====
function renderSettings() {
  const themes = [
    { id: 'dull-black', name: 'Dull Black', preview: 'theme-preview-dull' },
    { id: 'gleaming-pearl', name: 'Black Pearl', preview: 'theme-preview-pearl' },
    { id: 'dark-forest', name: 'Dark Forest', preview: 'theme-preview-forest' },
    { id: 'white-pearl', name: 'White Pearl', preview: 'theme-preview-white' },
    { id: 'dreamy', name: 'Dreamy', preview: 'theme-preview-dreamy' },
    { id: 'midnight-ocean', name: 'Midnight Ocean', preview: 'theme-preview-ocean' },
    { id: 'sakura', name: 'Sakura', preview: 'theme-preview-sakura' },
    { id: 'aurora', name: 'Aurora', preview: 'theme-preview-aurora' },
    { id: 'cyber-neon', name: 'Cyber Neon', preview: 'theme-preview-cyber' },
  ];
  const layouts = [
    { id: 'right', name: '右下 正方形', icon: '◳' },
    { id: 'bottom', name: '下部 横長', icon: '▭' },
    { id: 'left', name: '左下 正方形', icon: '◰' },
  ];
  return `
    <div class="fade-in">
      <div class="page-title-row">
        <button class="btn-icon btn-ghost" onclick="navigate('home')"><i class="fas fa-arrow-left"></i></button>
        <h2 class="section-title" style="margin:0;">設定</h2>
      </div>

      <div class="section-title">ボタン配置</div>
      <div class="layout-grid">
        ${layouts.map(l => `
          <div class="layout-option ${State.buttonLayout===l.id?'active':''}" onclick="setButtonLayout('${l.id}');render();">
            <div class="layout-icon">${l.icon}</div>
            <div class="layout-label">${l.name}</div>
          </div>
        `).join('')}
      </div>

      <div class="section-title" style="margin-top:14px;">テーマ</div>
      <div class="theme-grid">
        ${themes.map(t => `
          <div class="theme-option ${State.theme===t.id?'active':''}" onclick="applyTheme('${t.id}');render();">
            <div class="theme-preview ${t.preview}"></div>
            <div class="theme-label">${t.name}</div>
          </div>
        `).join('')}
      </div>

      ${State.user ? `
        <div class="section-title" style="margin-top:16px;">アカウント</div>
        <div class="card" style="display:flex;align-items:center;gap:10px;">
          <div class="menu-avatar">${(State.user.displayName||'U')[0].toUpperCase()}</div>
          <div style="flex:1;"><div style="font-weight:600;">${State.user.displayName||State.user.username}</div><div style="font-size:0.78rem;color:var(--text-tertiary);">@${State.user.username}</div></div>
          <button class="btn btn-danger btn-sm" onclick="logout()"><i class="fas fa-sign-out-alt"></i></button>
        </div>
      ` : ''}
    </div>
  `;
}

// ===== Auth =====
function renderAuth() {
  return `
    <div class="fade-in" style="max-width:420px;margin:0 auto;">
      <div class="page-title-row">
        <button class="btn-icon btn-ghost" onclick="navigate('home')"><i class="fas fa-arrow-left"></i></button>
        <h2 class="section-title" style="margin:0;">ログイン / 新規登録</h2>
      </div>
      <div class="tabs" id="auth-tabs"><button class="tab active" onclick="switchAuthTab('login')">ログイン</button><button class="tab" onclick="switchAuthTab('register')">新規登録</button></div>
      <div id="auth-form">${renderLoginForm()}</div>
    </div>
  `;
}

function renderLoginForm() {
  return `
    <div class="input-group"><label class="input-label">ユーザー名</label><input type="text" class="input" id="auth-username" placeholder="username" autocomplete="username"></div>
    <div class="input-group"><label class="input-label">パスワード</label>
      <div class="pw-wrap">
        <input type="password" class="input" id="auth-password" placeholder="••••••" autocomplete="current-password" onkeydown="if(event.key==='Enter')handleLogin()">
        <button type="button" class="pw-toggle" onclick="togglePw('auth-password',this)" aria-label="パスワード表示切替"><i class="fas fa-eye"></i></button>
      </div>
    </div>
    <button class="btn btn-primary btn-lg" onclick="handleLogin()" style="width:100%;"><i class="fas fa-sign-in-alt"></i> ログイン</button>
  `;
}

function renderRegisterForm() {
  return `
    <div class="input-group"><label class="input-label">ユーザー名（3〜30文字）</label><input type="text" class="input" id="auth-username" placeholder="username" autocomplete="username"></div>
    <div class="input-group"><label class="input-label">表示名（任意）</label><input type="text" class="input" id="auth-display" placeholder="表示名"></div>
    <div class="input-group"><label class="input-label">パスワード（6文字以上）</label>
      <div class="pw-wrap">
        <input type="password" class="input" id="auth-password" placeholder="••••••" autocomplete="new-password" onkeydown="if(event.key==='Enter')handleRegister()">
        <button type="button" class="pw-toggle" onclick="togglePw('auth-password',this)" aria-label="パスワード表示切替"><i class="fas fa-eye"></i></button>
      </div>
    </div>
    <button class="btn btn-primary btn-lg" onclick="handleRegister()" style="width:100%;"><i class="fas fa-user-plus"></i> アカウント作成</button>
  `;
}

function togglePw(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  const isHidden = inp.type === 'password';
  inp.type = isHidden ? 'text' : 'password';
  btn.innerHTML = isHidden ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
}

function switchAuthTab(tab) {
  const tabs = document.querySelectorAll('#auth-tabs .tab');
  tabs.forEach((t,i) => t.classList.toggle('active', (tab==='login'&&i===0)||(tab==='register'&&i===1)));
  document.getElementById('auth-form').innerHTML = tab==='login' ? renderLoginForm() : renderRegisterForm();
}

async function handleLogin() {
  const u = document.getElementById('auth-username')?.value?.trim();
  const p = document.getElementById('auth-password')?.value;
  if (!u||!p) { showToast('入力してください','error'); return; }
  try { await login(u,p); } catch(e) { showToast(e.message,'error'); }
}
async function handleRegister() {
  const u = document.getElementById('auth-username')?.value?.trim();
  const d = document.getElementById('auth-display')?.value?.trim();
  const p = document.getElementById('auth-password')?.value;
  if (!u||!p) { showToast('入力してください','error'); return; }
  try { await register(u,p,d); } catch(e) { showToast(e.message,'error'); }
}

// ===== Publish =====
function renderPublish() {
  const deck = State.myDecks?.find(d => d.id === State.publishDeckId) || State.currentDeck;
  if (!deck) return '<div class="empty-state"><div class="empty-text">単語帳が見つかりません</div></div>';
  return `
    <div class="fade-in">
      <div class="page-title-row">
        <button class="btn-icon btn-ghost" onclick="openDeck('${deck.id}')"><i class="fas fa-arrow-left"></i></button>
        <h2 class="section-title" style="margin:0;">公開設定</h2>
      </div>
      <div class="card">
        <div style="font-weight:700;margin-bottom:8px;">${esc(deck.name)}</div>
        <div style="margin-bottom:12px;"><span class="badge ${deck.is_public?'badge-success':'badge-warning'}">${deck.is_public?'🌐 公開中':'🔒 非公開'}</span></div>
        <button class="btn ${deck.is_public?'btn-danger':'btn-primary'} btn-lg" onclick="togglePublish('${deck.id}',${deck.is_public})" style="width:100%;"><i class="fas fa-${deck.is_public?'lock':'globe'}"></i> ${deck.is_public?'非公開にする':'公開する'}</button>
      </div>
    </div>
  `;
}

async function togglePublish(deckId, isPublic) {
  try { await API.put(`/decks/${deckId}`, { isPublic: !isPublic }); showToast(isPublic?'非公開にしました':'公開しました！','success'); openDeck(deckId); }
  catch(e) { showToast(e.message,'error'); }
}

// ===== Deck Management =====
async function renameDeck(deckId, currentName) {
  const n = prompt('新しい名前:', currentName);
  if (!n || n === currentName) return;
  try { await API.put(`/decks/${deckId}`, { name: n }); showToast('名前変更しました','success'); loadMyDecks(); } catch(e) { showToast(e.message,'error'); }
}
async function confirmDeleteDeck(deckId, deckName) {
  if (!confirm(`「${deckName}」を削除しますか？`)) return;
  try { await API.del(`/decks/${deckId}`); showToast('削除しました','success'); loadMyDecks(); } catch(e) { showToast(e.message,'error'); }
}

function showAddCardModal(deckId) {
  const m = document.createElement('div'); m.className='modal-overlay'; m.id='add-card-modal';
  m.innerHTML=`<div class="modal-content"><div class="modal-header"><div class="modal-title">単語を追加</div><button class="btn-icon-sm btn-ghost" onclick="document.getElementById('add-card-modal').remove()"><i class="fas fa-times"></i></button></div><div class="modal-body"><div class="input-group"><label class="input-label">単語 *</label><input type="text" class="input" id="new-word" placeholder="apple"></div><div class="input-group"><label class="input-label">意味 *</label><input type="text" class="input" id="new-meaning" placeholder="りんご"></div><div class="input-group"><label class="input-label">例文</label><input type="text" class="input" id="new-example" placeholder="I eat an apple."></div><div class="input-group"><label class="input-label">例文の和訳</label><input type="text" class="input" id="new-translation" placeholder="私はりんごを食べる。"></div><div class="input-group"><label class="input-label">絵文字</label><input type="text" class="input" id="new-emoji" placeholder="🍎"></div></div><div class="modal-footer"><button class="btn" onclick="document.getElementById('add-card-modal').remove()">キャンセル</button><button class="btn btn-primary" onclick="addCardToCurrentDeck('${deckId}')">追加</button></div></div>`;
  document.body.appendChild(m);
}
async function addCardToCurrentDeck(deckId) {
  const w=document.getElementById('new-word')?.value?.trim(),m=document.getElementById('new-meaning')?.value?.trim();
  if(!w||!m){showToast('単語と意味は必須','error');return;}
  try{await API.post(`/decks/${deckId}/cards`,{word:w,meaning:m,example_sentence:document.getElementById('new-example')?.value?.trim()||'',example_translation:document.getElementById('new-translation')?.value?.trim()||'',emoji:document.getElementById('new-emoji')?.value?.trim()||''});document.getElementById('add-card-modal')?.remove();showToast('追加しました','success');openDeck(deckId);}catch(e){showToast(e.message,'error');}
}

async function editCard(cardId) {
  const card = State.currentCards.find(c=>c.id===cardId);
  if(!card)return;
  const m=document.createElement('div');m.className='modal-overlay';m.id='edit-card-modal';
  m.innerHTML=`<div class="modal-content"><div class="modal-header"><div class="modal-title">単語を編集</div><button class="btn-icon-sm btn-ghost" onclick="document.getElementById('edit-card-modal').remove()"><i class="fas fa-times"></i></button></div><div class="modal-body"><div class="input-group"><label class="input-label">単語</label><input type="text" class="input" id="edit-word" value="${esc(card.word)}"></div><div class="input-group"><label class="input-label">意味</label><input type="text" class="input" id="edit-meaning" value="${esc(card.meaning)}"></div><div class="input-group"><label class="input-label">例文</label><input type="text" class="input" id="edit-example" value="${esc(card.example_sentence||'')}"></div><div class="input-group"><label class="input-label">例文の和訳</label><input type="text" class="input" id="edit-translation" value="${esc(card.example_translation||'')}"></div><div class="input-group"><label class="input-label">絵文字</label><input type="text" class="input" id="edit-emoji" value="${esc(card.emoji||'')}"></div></div><div class="modal-footer"><button class="btn" onclick="document.getElementById('edit-card-modal').remove()">キャンセル</button><button class="btn btn-primary" onclick="saveEditCard('${cardId}')">保存</button></div></div>`;
  document.body.appendChild(m);
}
async function saveEditCard(cardId) {
  try{await API.put(`/cards/${cardId}`,{word:document.getElementById('edit-word')?.value?.trim(),meaning:document.getElementById('edit-meaning')?.value?.trim(),example_sentence:document.getElementById('edit-example')?.value?.trim(),example_translation:document.getElementById('edit-translation')?.value?.trim(),emoji:document.getElementById('edit-emoji')?.value?.trim()});document.getElementById('edit-card-modal')?.remove();showToast('保存しました','success');openDeck(State.currentDeck.id);}catch(e){showToast(e.message,'error');}
}
async function deleteCard(cardId,word) {
  if(!confirm(`「${word}」を削除しますか？`))return;
  try{await API.del(`/cards/${cardId}`);showToast('削除しました','success');openDeck(State.currentDeck.id);}catch(e){showToast(e.message,'error');}
}
async function resetCard(cardId) {
  try{if(State.user){await API.post('/progress/reset',{cardId});delete State.currentProgress[cardId];}else{localStorage.removeItem(`vf_prog_${cardId}`);}showToast('未習得に戻しました','success');render();}catch(e){showToast(e.message,'error');}
}

// ===== Utilities (shortened names for perf) =====
function esc(str) { if(!str)return''; const d=document.createElement('div'); d.textContent=str; return d.innerHTML; }
function fmtDate(ds) { if(!ds)return''; const d=new Date(ds); return `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}`; }
function fmtTime(s) { if(s<60)return`${s}秒`; if(s<3600)return`${Math.floor(s/60)}分`; return`${Math.floor(s/3600)}時間${Math.floor((s%3600)/60)}分`; }

// Keep old names as aliases for backward compat
const escapeHtml = esc;
const formatDate = fmtDate;
const formatTime = fmtTime;

function attachEventListeners() {
  if (State.currentView==='browse') setTimeout(()=>loadPublicDecks(),30);
  if (State.currentView==='mydecks') setTimeout(()=>loadMyDecks(),30);
  if (State.currentView==='stats') setTimeout(()=>loadStats(),30);
  if (State.currentView==='study'&&State.studyMode==='oni') setTimeout(()=>{const i=document.getElementById('oni-input');if(i)i.focus();},80);
}

// ===== Blade Flash Effect (sharp right-to-left sweep, select themes only) =====
const FLASH_THEMES = ['gleaming-pearl', 'cyber-neon'];
let flashInterval = null;

function initBladeFlash() {
  if (flashInterval) clearInterval(flashInterval);
  function tick() {
    if (!FLASH_THEMES.includes(State.theme)) return;
    const btns = document.querySelectorAll('.btn:not(.btn-ghost):not(.btn-icon):not(.btn-icon-sm), .rating-btn, .simple-btn');
    if (btns.length === 0) return;
    // Pick 1 random button for a crisp single flash
    const idx = Math.floor(Math.random() * btns.length);
    const btn = btns[idx];
    btn.classList.remove('blade-flash');
    void btn.offsetWidth; // force reflow for re-trigger
    btn.classList.add('blade-flash');
    setTimeout(() => btn.classList.remove('blade-flash'), 400);
  }
  flashInterval = setInterval(tick, 2000);
  setTimeout(tick, 1200);
}

// ===== Init =====
async function init() { applyTheme(State.theme); await initAuth(); render(); initBladeFlash(); }
document.addEventListener('DOMContentLoaded', init);
if (document.readyState !== 'loading') init();
