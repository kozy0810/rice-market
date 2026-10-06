# Shopify 実現可能性 検証ログ

最終更新: 2026-10-06

対象要件は `docs/human/requirements.md`。個別の調査結果は `docs/research/` 配下にトピックごとに分けてある。**Shopifyの仕様について不明点があれば、まずこのページの一覧から該当する研究ファイルを確認する。**

## 検証環境

| 項目 | 値 |
|---|---|
| 開発ストア | `rice-market-dev.myshopify.com` |
| Shop GID | `gid://shopify/Shop/76593725526` |
| プラン | Basic App Development（`partnerDevelopment: true`） |
| 国 | JP |
| ストアフロントパスワード | `rteild` |
| 組織（Dev Dashboard） | `kozy` / `231816619` |
| 組織（Partner） | `5130284` |
| Shopify CLI | 4.8.0 |

CLI は `shopify store auth` で以下のスコープを付与済み。

```
read_products, write_products, read_customers, write_customers,
read_orders, read_themes, read_shipping, read_discounts,
read_translations, write_translations
```

`read_publications` は未付与のため、販売チャネルの公開状態を API から読む場合は再認証が必要。

## 調査結果一覧（docs/research/）

| ファイル | 内容 |
|---|---|
| [customer-accounts.md](./research/customer-accounts.md) | customer accountsの仕様、セルフサービス登録では購入者を限定できないこと、事前作成顧客と初回サインインの結合 |
| [app-proxy-signup.md](./research/app-proxy-signup.md) | App ProxyによるURL制約と派遣元別登録URLの実装、保護された顧客データ、配信方法（カスタム配布） |
| [cart-validation-function.md](./research/cart-validation-function.md) | Cart and Checkout Validation Functionによる購入ゲート、Buy Nowでのバグと対処 |
| [client-transfer-store.md](./research/client-transfer-store.md) | 開発ストアとclient transfer storeの違い、カスタムアプリのインストールタイミング |
| [plan-dependent-features.md](./research/plan-dependent-features.md) | プラン依存機能の判定に関する注意、Basicの同時利用言語数 |
| [serverless-options.md](./research/serverless-options.md) | Shopify Forms / Flowによるサーバーレス構成の可否、構成A/B/Cの比較 |
| [metaobjects.md](./research/metaobjects.md) | 派遣元マスタの設計、管理画面からの追加、ハンドル自動生成問題 |
| [checkout.md](./research/checkout.md) | 決済手段・重量別送料・多言語のチェックアウト実機確認 |
| [royalty-snapshot.md](./research/royalty-snapshot.md) | 注文時点の派遣元スナップショットとロイヤリティ集計 |
| [git-management.md](./research/git-management.md) | Shopifyのコード・設定のGit管理可否、テーマ+アプリ構成の制約 |
| [signup-url-handle.md](./research/signup-url-handle.md) | 会員登録ページのURLハンドル推測困難化、handleへのスラッシュ不可、sitemap自動掲載とseo.hiddenメタフィールドによる除外 |
| [self-service-status-change.md](./research/self-service-status-change.md) | 顧客自身によるタグ変更は技術的に不可能なこと、顧客によるメタフィールド書き込みは公式サポートされていること、卒業は所属組織からの削除の自己申告であり購入可否には影響しないこと。実装・実機検証済み（Issue #45、仕様は`docs/specs/self-service-status-change.md`）。組織名の自動同期（`Customer tags added`トリガー + Shopify Flow）も追加実装・実機検証済み（2026-10-06） |

## 可否判定のまとめ

| 要件 | 判定 | 根拠 |
|---|---|---|
| 限定販売（登録者のみ購入） | 可 | [cart-validation-function.md](./research/cart-validation-function.md) |
| 卒業による購入可否の切替 | 可 | タグ操作。購入可のまま残す運用も可能 |
| 派遣元ごとの登録URL | 可 | [app-proxy-signup.md](./research/app-proxy-signup.md) |
| 素の `/signup` を塞ぐ | 可 | 同上 |
| 管理画面から派遣元を追加 | 可 | [metaobjects.md](./research/metaobjects.md) |
| 顧客自身による卒業（所属組織からの削除） | 可 | [self-service-status-change.md](./research/self-service-status-change.md)。「転籍」という概念はなく、顧客ができるのは卒業のみ |
| 注文時点の派遣元スナップショット | 可 | [royalty-snapshot.md](./research/royalty-snapshot.md) |
| ロイヤリティ集計 | 可 | 同上 |
| 代引き・銀行振込 | 可 | [checkout.md](./research/checkout.md)。手動決済方法。消込は手作業 |
| 多言語（日英越中） | 可 | 同上。137言語から選択、Basicで20言語まで同時利用可 |
| 重量別・地域別送料 | 可 | 同上 |
| 重量バリエーション | 可 | 同上 |
| 産地情報の保持・表示 | 可 | 商品メタフィールド |

**要件定義に書かれた項目はすべて Shopify 上で実現可能**であることを確認済み。

### ただし可否とは別に残る事実

- 日常運用（派遣元追加、卒業処理、商品・在庫、発送）は管理画面で完結する
- 銀行振込の消込は毎日の手作業になる
- 開発ストアでは実決済を通せないため、代引き・銀行振込のエンドツーエンドは移管・契約後にしか確認できない

## 決定: 購入導線の構成は B（2026-09-21、Issue #1）

**サーバー不要の構成B（Shopify Forms による登録 + Validation Function による購入ゲート）を採用する。** 保守を続ける予定がないため、自社サーバーを持つ構成A・Cは除外した。注文スナップショット（ロイヤリティ集計の自動化・Shopify Flow）は nice to have に格下げし、Flowが本番プランで動くかどうかは構成選択のブロッカーではなくなった。詳細と理由は [serverless-options.md](./research/serverless-options.md) の「決定」節を参照。

## 未検証・推論で代替している項目

- Shopify Forms経由の顧客作成 → 初回サインインの結合（[customer-accounts.md](./research/customer-accounts.md)。開発環境のUI不安定により未実証、推論で「成立する」とみなして先に進んでいる。中核機能に関わるため引き続き本番構築時の確認を推奨）
- Shopify Flowでの注文スナップショット自動化（[serverless-options.md](./research/serverless-options.md)。nice to have に格下げ済みのため、動かなくても構築は止まらない）

## 現状のタスク管理

技術検証はほぼ完了している。残作業（事業側の決定、構築、納品）は GitHub Issues + Project「Rice Market」（`gh project view 5 --owner kozy0810`）で管理しており、このログでは重複して管理しない。
