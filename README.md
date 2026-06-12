# 🐤 Chirp — シンプルなつぶやきSNS

X（旧Twitter）風の、とてもシンプルなつぶやき投稿アプリです。
メール+パスワードでログインし、つぶやきを投稿・閲覧・削除できます。

- **フロントエンド**: 素のHTML / CSS / JavaScript（ビルド不要）
- **バックエンド**: [Supabase](https://supabase.com)（認証 + データベース）
- **ホスティング**: GitHub Pages（GitHub Actions で自動デプロイ）

## 機能

- 📝 つぶやきの投稿（最大280文字）
- 🔐 メールアドレス + パスワードでのログイン / 新規登録（2段階認証なし）
- 🗑️ 自分のつぶやきの削除
- ⚡ リアルタイム更新（他の人の投稿も自動で表示）
- 🌙 ダークテーマのシンプルUI

## アーキテクチャ

```
ブラウザ (index.html / app.js)
      │  supabase-js (CDN)
      ▼
Supabase
  ├─ Auth        … メール+パスワード認証
  └─ posts テーブル … Row Level Security で保護
```

### posts テーブル

| カラム       | 型            | 説明                         |
| ------------ | ------------- | ---------------------------- |
| `id`         | uuid          | 主キー                       |
| `user_id`    | uuid          | 投稿者（auth.users への参照）|
| `author`     | text          | 表示名                       |
| `content`    | text          | 本文（1〜280文字）           |
| `created_at` | timestamptz   | 投稿日時                     |

RLS ポリシー:
- 閲覧: 誰でも可
- 投稿: ログイン中の本人のみ
- 削除: 投稿者本人のみ

## セキュリティと環境変数について

接続情報（Supabase の URL と publishable key）は **リポジトリにコミットしません**。

- `config.js` … 実際のキーを入れるファイル。`.gitignore` で除外済みなので GitHub には上がりません。
- `config.example.js` … テンプレート（こちらはコミットされます）。
- 本番（GitHub Pages）では、**GitHub Secrets** に保存した値を
  GitHub Actions がビルド時に `config.js` として生成します。

> ℹ️ publishable key（旧 anon key）はブラウザに公開される前提の公開鍵で、
> Row Level Security によって保護されています。
> **service_role キーはクライアントに置かないでください**（このアプリは使用していません）。

## ローカルで動かす

```bash
# 1. 接続情報を用意
cp config.example.js config.js
# config.js を編集して Supabase の URL と publishable key を入れる

# 2. 任意の静的サーバで起動（例）
python3 -m http.server 8000
# → http://localhost:8000 を開く
```

## GitHub Pages へのデプロイ手順

1. **GitHub Secrets を登録**
   リポジトリの `Settings → Secrets and variables → Actions → New repository secret` で
   以下の2つを登録します。
   - `SUPABASE_URL` … `https://xxxx.supabase.co`
   - `SUPABASE_ANON_KEY` … publishable key（`sb_publishable_...`）

2. **GitHub Pages を有効化**
   `Settings → Pages → Build and deployment → Source` を **GitHub Actions** に設定。

3. **`main` ブランチへマージ**
   `.github/workflows/deploy.yml` が `main` への push で起動し、
   Secrets から `config.js` を生成して Pages に公開します。

4. 公開URL: `https://<ユーザー名>.github.io/<リポジトリ名>/`

## Supabase 側の補足

- 新規登録時、デフォルトでは確認メールが送信されます。すぐに試したい場合は
  Supabase ダッシュボードの `Authentication → Sign In / Providers → Email` で
  **Confirm email** をオフにすると、登録後すぐログインできます。
