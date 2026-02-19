# Neomemoria

## Project Overview
- **Name**: Neomemoria
- **Goal**: Scientific spaced-repetition English vocabulary learning app
- **Stack**: Hono + TypeScript + Cloudflare Workers + D1 + Tailwind CSS

## URLs
- **Production**: https://neomemoria.pages.dev
- **Sandbox Dev**: https://3000-ikult9poh12fza8xfhic5-2e1b9533.sandbox.novita.ai
- **GitHub**: https://github.com/akauntoguguru795-ux/Neomemoria-mark6 (commit `069c894`)

## Completed Features (v5.0)
- 3 study modes: Normal, Simple, Oni (spelling)
- 3 button layouts: right-bottom square, bottom horizontal, left-bottom square
- Enlarged evaluation buttons (min 72px height, 1.7rem icons)
- Simple mode: same-size buttons pre/post flip (opacity change only)
- 9 premium themes: Dull Black, Black Pearl, Dark Forest, White Pearl, Dreamy, Midnight Ocean, Sakura, Aurora Borealis, Cyber Neon
- **Black Pearl flash effect**: buttons periodically shimmer with theme-specific glow
- **Enhanced theme visuals**: each theme has unique gradient buttons, card shadows, hover effects, accent bars (Aurora/Cyber Neon)
- Password show/hide toggle on login & registration
- Study history (last 50 sessions, localStorage)
- SRS (spaced repetition), random, and sequential card ordering
- Undo last rating during study
- File import: CSV, TSV, and TXT files supported
- Public deck browse with search
- User authentication (register/login)
- Deck CRUD: create, edit, rename, delete, publish/unpublish
- Card CRUD: add, edit, delete within decks
- Statistics: streak, weekly chart, mastery distribution, accuracy
- Performance optimized: reduced transitions, will-change, cached containers

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Current user info |
| GET | `/api/decks/public?q=` | Browse public decks |
| GET | `/api/decks/mine` | My decks (auth) |
| GET | `/api/decks/:id` | Deck with cards |
| POST | `/api/decks` | Create deck |
| PUT | `/api/decks/:id` | Update deck |
| DELETE | `/api/decks/:id` | Delete deck |
| POST | `/api/decks/:id/cards` | Add card |
| PUT | `/api/cards/:id` | Edit card |
| DELETE | `/api/cards/:id` | Delete card |
| GET | `/api/study/:deckId` | Get study data |
| POST | `/api/progress` | Save card progress |
| POST | `/api/progress/reset` | Reset card |
| GET | `/api/progress/:deckId` | Get deck progress |
| POST | `/api/sessions` | Save study session |
| GET | `/api/stats` | User statistics |

## Data Architecture
- **Database**: Cloudflare D1 (SQLite), database name: `vocabflash-production`
- **Tables**: users, decks, cards, card_progress, daily_streaks, study_sessions
- **Client Storage**: localStorage for theme, button layout, study history, anonymous progress

## Deployment
- **Platform**: Cloudflare Pages
- **Project Name**: neomemoria
- **URL**: https://neomemoria.pages.dev
- **Status**: Active
- **D1 Database ID**: 6c41ed24-08ad-4467-b0af-a555fff0612d
- **Last Updated**: 2026-02-19
