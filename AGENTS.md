# rice-market

技能実習生向けお米販売サイト。Shopify（カスタムアプリ + テーマ）で構築する。

## ディレクトリ構成

`tmp/rice-market-app/`・`tmp/rice-market-app-extonly/` はDevストアでの検証用サンドボックス（Git管理外）。実装コードは検証しながら `apps/`・`themes/` 配下へ移していく。

```
apps/
  shopify-app/    # カスタムアプリ本体（Cart Validation Function・派遣元メタオブジェクト定義）
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

## アーキテクチャ制約

- **管理者側でサーバーは運用しない。** Lambda・Fargateのようなサーバーレスサービスも含め、HTTPエンドポイントを自前でホストする構成は取らない（保守を続ける予定がないため。経緯は `docs/shopify-verification-log.md` の「決定: 購入導線の構成はB」を参照）
- 実装を検討する過程でサーバー（サーバーレス含む）が必要になりそうな場合は、それを採用する前に、多少実装が複雑になってもサーバーを使わない代替案を検討する

