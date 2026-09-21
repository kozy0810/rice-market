# rice-market

技能実習生向けお米販売サイト。Shopify（カスタムアプリ + テーマ）で構築する。

## ディレクトリ構成

`rice-market-app/`・`rice-market-app-extonly/` はDevストアでの検証用サンドボックスで、Git管理しない（`.gitignore`対象）。本番実装は以下のモノレポ構成で進める。

```
apps/
  shopify-app/    # カスタムアプリ本体（Admin API・App Proxy・Cart Validation Functionなど）
themes/
  storefront/     # Shopifyテーマ（公式テーマ「Dawn」をベースにカスタマイズ）
docs/
  human/          # 人間向けドキュメント
  specs/          # 機能ごとの仕様書
  research/       # 調査メモ
mise.toml         # 言語・ツールのバージョン管理
```

言語・ツールのバージョンは `mise` で管理する。各アプリ配下のパッケージ管理はそれぞれの `package.json`（pnpm）に従う。

## 作業の進め方

- Shopify の実装・調査は `shopify-dev-verification` スキルに従う
- Issue の作成・更新は `issue-conventions` スキルに従う
- 何が決まっていて何が未定かは、まず `docs/shopify-verification-log.md` を確認する

