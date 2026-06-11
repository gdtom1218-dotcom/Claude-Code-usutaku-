# としょさが 📚 — 近くの図書館を探す

現在地や住所から近くの図書館を地図上で探せるシンプルなWebサイトです。図書館データは [カーリル(Calil) 図書館API](https://calil.jp/doc/api_ref.html) を利用しています。

## 特徴

- 📍 **現在地から検索** — ブラウザの位置情報を使って近隣の図書館を表示
- 🔎 **住所・地名から検索** — 任意の住所を入力して検索（OpenStreetMap/Nominatimでジオコーディング）
- 🗺️ **地図表示** — [Leaflet](https://leafletjs.com/) + OpenStreetMap で近隣の図書館をマップにプロット
- 📏 **距離順に並べ替え** — 起点からの距離を計算して近い順に一覧表示
- 🔗 公式サイト・Googleマップ経路へのリンク付き
- ビルド不要・サーバー不要の**静的サイト**（HTML / CSS / Vanilla JS のみ）

## 使い方

1. [カーリルのダッシュボード](https://calil.jp/api/dashboard/) で無料の**アプリケーションキー**を取得します。
2. このサイトを開き、右上の ⚙️（設定）からアプリケーションキーを入力して保存します。
   - キーはブラウザの `localStorage` にのみ保存され、外部には送信されません。
3. 「現在地から探す」または住所検索で図書館を探します。

## ローカルで動かす

`file://` で直接開くと位置情報やAPI呼び出しがブロックされる場合があるため、簡易サーバーで起動するのがおすすめです。

```bash
# Python が入っていれば
python3 -m http.server 8000
# → ブラウザで http://localhost:8000 を開く
```

## 技術メモ

- カーリルAPIはCORS非対応のため、**JSONP** で呼び出しています（`app.js` の `jsonp()` ）。
- 図書館の近隣検索には `library` エンドポイントの `geocode`（`経度,緯度` の順）パラメータを使用しています。
- 住所→座標の変換は Nominatim を利用しています（利用ポリシーに従い検索は1リクエスト/操作）。

## ファイル構成

```
.
├── index.html   # 画面構成
├── style.css    # スタイル
├── app.js       # 検索・地図・APIロジック
└── README.md
```

## クレジット

- 図書館データ: [カーリル](https://calil.jp/)
- 地図: [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors / [Leaflet](https://leafletjs.com/)
