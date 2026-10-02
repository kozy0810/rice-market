# App Home UI Extension — バックエンドなしでロイヤリティ画面を作れるか

## 背景

Issue #44（ロイヤリティ機能）で、「サーバーは運用したくない。Lambda/ECSのようなサーバーレスも使いたくない。Shopifyにデプロイしたら、それだけで完結するアプリを作りたい」という要件が出た。Admin APIで注文データを取得する必要があるが、Admin APIのアクセストークンをブラウザから直接叩くのは通常は危険（トークン露出・CORS）であり、素朴には「バックエンドが要る」ように見える。これが技術的に可能かを公式ドキュメントで確認した。**まだDevストアでの実機検証はしていない（ドキュメント確認のみ）。**

## 分かったこと（shopify.dev ドキュメント確認、2026-10-02）

Shopifyには **App Home UI Extension**（`admin.app.home.render`ターゲット）という仕組みがある。

- アプリのメイン画面（App Home）を、独自ホスティングのiframeアプリではなく、他のAdmin UI Extensionと同様に **Shopify側がホストする拡張機能として作れる**
- `shopify app deploy` でデプロイするだけで完結し、**デプロイすべき自前のWebサーバーが存在しない**
- Preactベース、UIはPolaris web components
- 拡張機能のランタイムAPIとして `shopify.query()` が使え、**GraphQL Admin APIを拡張機能のフロントエンドコードから直接呼べる**（Direct API access）。バックエンドへの往復が発生しない
- 認証はShopifyが自動的に行う（開発者が自分でトークンを扱う必要がない）

出典:
- https://shopify.dev/docs/apps/build/app-home
- https://shopify.dev/docs/apps/build/app-home/app-home-ui-extensions
- https://shopify.dev/docs/api/app-home-ui-extension/2026-07
- https://shopify.dev/changelog/blog/build-app-home-as-a-ui-extension

## 制約

- **custom distribution専用。** Shopify App Storeでの公開配布はできない（rice-marketは単一ストア向けの友人用カスタムアプリなので問題にならない）
- ランタイムがPreactに限定され、ブラウザAPIは通常のWebアプリより制限される
- 圧縮後バンドルサイズの上限が64KB
- webhookやバックグラウンドジョブなど、サーバーサイドの処理が必要な機能はこのモデルでは実現できない（別途バックエンドが要る）。ロイヤリティ画面自体は「開いたときにAdmin APIへ問い合わせて集計する」オンデマンド処理なので、この制約には抵触しない

## このプロジェクトへの示唆

- `apps/shopify-app/shopify.app.toml` には既に `[access.admin] direct_api_mode = "online"` と `embedded_app_direct_api_access = true` が設定済み。Direct API accessを使う前提は既にある
- ただし `access_scopes` に `read_orders` が含まれていない（現状: `write_products,read_customers,write_customers,read_metaobjects,write_metaobjects`）。ロイヤリティ画面で注文を読むには追加が必要
- #8（注文時点の派遣元スナップショット）は引き続きShopify Flowが候補のまま変わらない。Flowもサーバーを運用する必要がない（Shopify側のインフラで動く自動化）ため、「サーバー・サーバーレス基盤を自分で持たない」という今回の方針と矛盾しない

## 判定: 条件付きで可（未実証）

ドキュメント上は、#44を「App Home UI Extension + `shopify.query()`によるDirect API access」で、サーバーもLambda/ECSのようなサーバーレス基盤も一切使わずに実装できる見込みが高い。ただし実際にDevストアで `shopify.query()` から注文データを取得できるか、月次・組織別の集計に必要なクエリ量がランタイム制約（バンドルサイズ・レート制限）に収まるかは未検証。#44着手時に実機で確認する。
