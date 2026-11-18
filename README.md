# Cohabitation Housing Tracker (同棲物件・不動産会社評価ダッシュボード)

`Grimoire-pkb` の同棲物件要件定義書（`03.13`）、設計書（`03.14`）、および不動産会社ディレクトリ（`04.34`）と連携し、各社から届いたマイソクPDF・初期費用見積書・AI診断結果・不動産会社評価を可視化するローカルWebアプリケーション。

## マルチデバイス運用（`Grimoire-pkb` 連携）

- **構造化データの正本**: `../Grimoire-pkb/04_resources/housing_data/housing_db.json`（Git追跡対象）
- **マイソク・見積書PDF**: `../Grimoire-pkb/06_storage/housing/maisoku/`（`sync_all.sh` によりGoogle Drive同期）
- **ローカルSQLite DB**: `./housing.db`（起動時およびWeb UI更新時に `housing_db.json` と双方向自動同期）

## 起動方法（外部パッケージ依存ゼロ）

```bash
python3 server.py
```

ブラウザで `http://localhost:3456` を開くとダッシュボードが表示されます。
