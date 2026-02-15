# VocabFlash - 英単語フラッシュカード

## 概要
科学的な間隔反復法 (SRS) を使った英単語学習Webアプリケーション。公開単語帳の共有機能付き。

## 本番URL
**https://vocabflash.pages.dev**

## 主な機能

### 完了済み
- **ユーザー認証** - 登録/ログイン (SHA-256ハッシュ)
- **単語帳管理** - 作成/編集/削除/名前変更
- **CSVインポート** - 複数ファイル同時インポート対応
  - 形式: `No,単語,意味,例文,例文の和訳,絵文字` (例文以降は任意)
- **公開単語帳** - 匿名でも公開可能、検索/ブラウジング
- **フラッシュカード学習** - 3モード
  - **ノーマルモード**: 表面=番号+単語、裏面=意味+例文+絵文字
  - **シンプルモード**: ⭕️/❌ の2択
  - **鬼モード**: 意味を見てスペルを入力
- **SRS (間隔反復)**: 
  - 完全に覚えた → 2度と出題しない (統計には含む、未習得に戻すことも可能)
  - 普通 → 2日後に再出題
  - 自信なし → 1日後に出題
  - 完全に忘れた → 20枚後に再出題
- **出題順切り替え** - SRS順/ランダム/番号順を即時切り替え
- **戻るボタン** - 前の単語の評価を取り消し
- **統計情報** - 正答率、学習日数、週次グラフ、習熟度分布、学習時間
- **連続学習日数** - エフェクト付き (🔥⚡👑🏆)
- **5つのテーマ**:
  1. Dull Black - くすんだ目に優しいダーク
  2. Gleaming Black Pearl - 黒真珠の輝き
  3. Dark Forest & Bonfire - 暗い森と焚き火
  4. White Pearl - 白真珠の輝き
  5. Dreamy - 夢の中の可愛いモード
- **iPad/iPhone対応** - レスポンシブUI、Safe Area対応

### APIエンドポイント
| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/auth/register` | ユーザー登録 |
| POST | `/api/auth/login` | ログイン |
| GET | `/api/auth/me` | ログインユーザー情報 |
| GET | `/api/decks/public?q=検索語` | 公開単語帳検索 |
| GET | `/api/decks/mine` | マイ単語帳一覧 |
| GET | `/api/decks/:id` | 単語帳詳細+カード |
| POST | `/api/decks` | 単語帳作成 |
| PUT | `/api/decks/:id` | 単語帳更新 |
| DELETE | `/api/decks/:id` | 単語帳削除 |
| POST | `/api/decks/:id/cards` | カード追加 |
| PUT | `/api/cards/:id` | カード編集 |
| DELETE | `/api/cards/:id` | カード削除 |
| POST | `/api/progress` | 学習進捗保存 |
| POST | `/api/progress/reset` | 習得済みをリセット |
| GET | `/api/progress/:deckId` | デッキの進捗取得 |
| POST | `/api/sessions` | 学習セッション保存 |
| GET | `/api/stats` | 統計情報取得 |

## 技術スタック
- **Runtime**: Cloudflare Workers (Edge)
- **Framework**: Hono v4
- **Database**: Cloudflare D1 (SQLite)
- **Frontend**: Vanilla JS + Tailwind-inspired CSS
- **Build**: Vite
- **Deploy**: Cloudflare Pages

## データモデル
- `users` - ユーザー
- `decks` - 単語帳
- `cards` - 単語カード
- `card_progress` - 学習進捗 (SRS)
- `study_sessions` - 学習セッション
- `daily_streaks` - 連続学習日数

## デプロイ
```bash
npm run build
npx wrangler pages deploy dist --project-name vocabflash
```
