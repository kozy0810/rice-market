# 顧客自身によるステータス変更（Issue #45）の実現方式

## 目的

Issue #45「卒業・転籍ステータスをユーザー自身が変更できるようにする」の実現方式を調査する。購入ゲート（[cart-validation-function.md](./cart-validation-function.md)）は顧客タグ（`member`, `org:<org_code>`）を見て判定しており（[dispatch-org-tagging.md](../specs/dispatch-org-tagging.md)）、管理者がAdmin側でタグを付け替える経路はIssue #7で実装済み。今回は「顧客自身がログイン後の画面から、自分でこのタグ相当のステータスを変更できるか」を調べる。

## 確定: 顧客自身は顧客タグを直接変更できない

顧客が使う **Customer Account API** と、マーチャントが使う **Admin GraphQL API** は別のAPIであり、権限が明確に分かれている。

- タグ変更ミューテーション `tagsAdd` / `tagsRemove` は **Admin GraphQL API 専用**。マーチャント権限が必要で、顧客自身（Customer Account API側）からは呼び出せない
- Customer Account API の `customerUpdate` ミューテーションの入力（`CustomerUpdateInput`）は `firstName` / `lastName` のみ。タグに関するフィールドは存在しない

出典:
- https://shopify.dev/docs/api/customer/2026-04/mutations/customerUpdate
- https://shopify.dev/docs/api/customer/2026-04/input-objects/CustomerUpdateInput

検索（`shopify-customer`スキル・`shopify-dev`スキルの `search_docs.mjs`）では、Customer Account API側でタグを操作するミューテーションへの言及が一切見当たらなかった。**顧客が自分でタグを直接書き換える経路は技術的に存在しない。**

## 確定: 顧客自身によるメタフィールド書き込みは公式にサポートされている

Customer Account API は2024-07以降、顧客自身によるメタフィールドの読み書きをサポートしている（ただしCustomer, Order, Company, CompanyLocationオブジェクトのみ）。

- Admin側のメタフィールド定義で `MetafieldCustomerAccountAccess` を `READ_WRITE` に設定する（TOML declarative custom data definitions、または管理画面）
- Customer Account UI Extension（例: Profileページ）から、顧客がその値を書き込める

出典:
- https://shopify.dev/docs/apps/build/customer-accounts/metafields（"Building metafield writes into extensions"）
- https://shopify.dev/docs/api/admin-graphql/2026-04/enums/MetafieldCustomerAccountAccess

## 未実証: Flowの標準（ビルトイン）トリガーに「顧客のメタフィールド更新」があるか

メタフィールドの変更をきっかけに、Admin API側でタグを変更する橋渡しとして Shopify Flow を使えないか調査した。

- 「アプリが独自にFlow Triggerを定義する」方式（`type = "flow_trigger"` extension）は、トリガー発火のためにアプリ側のWebサーバーがShopifyのGraphQL Admin APIへPOSTリクエストを送る必要がある（出典: https://shopify.dev/docs/apps/build/flow/triggers/create）。これは「サーバーを持たない」という構成Bの前提（[serverless-options.md](./serverless-options.md)）と衝突するため、この方式は採用しない
- 一方、マーチャントがFlowエディタでGUIから選ぶ「標準ビルトイントリガー」に「顧客のメタフィールド更新」が存在するかどうかは、`shopify-dev`スキルの文書検索では確認できなかった（検索結果はアプリ開発者向けのEvents API・カスタムFlow Trigger開発ドキュメントに終始し、マーチャント向けトリガー一覧のページには当たらなかった）
- Devストアの管理画面でFlowのワークフローエディタを開き、「トリガーを選択」の一覧を直接確認しようとしたが、**埋め込みiframe内のUIがブラウザ自動操作のクリック・入力を受け付けず、確認できなかった**（`docs/shopify-verification-log.md`に記載済みの既知の制約「管理画面の埋め込みiframeはクロスオリジンで座標クリックに頼らざるを得ず、反応しないことがある」に該当）

**この点は未実証のまま。本番ストア（または手動でのDevストア操作）でのFlowエディタ確認が必要。**

## 結論: 推奨アーキテクチャ

```
顧客（Customer Account UI Extension）
  → 自分で書き込めるメタフィールド（例: customer.graduation_requested）に値を書く
  → Shopify Flow（メタフィールド更新をトリガーに想定）
  → Admin API の tagsAdd / tagsRemove でタグを変更
  → 購入ゲート（Cart Validation Function）は既存のタグ判定ロジックのまま反映される
```

この方式を推奨する理由:
- 購入ゲートのロジック（タグ判定）を一切変更せずに済み、既存のロイヤリティ集計（タグ検索前提、[royalty-snapshot.md](./royalty-snapshot.md)）とも衝突しない
- サーバーを自前で持つ必要がない（Flowのビルトイントリガーが使える前提なら構成Bの方針と整合する）

却下した代替案:
- アプリが自前のFlow Triggerを作る／Admin APIを直接叩くサーバーを持つ → 「サーバー不要」方針と衝突するため却下
- 購入ゲート側の判定をタグからメタフィールド直接参照に変更する → タグとメタフィールドの二重管理になり、ロイヤリティ集計の設計（タグ前提）との整合性が崩れるため却下

## 残課題

- Flowの標準ビルトイントリガーに「顧客のメタフィールド更新」が存在するかの確認（未実証。本番プラン契約後、またはDevストアでの手動確認が必要）
- 顧客が書き込めるメタフィールドの namespace・key 設計、値の取りうる形（例: 卒業希望フラグか、転籍先org_codeの申請か）
- Flowが使えない場合のフォールバック方式の検討（確定後に必要なら追記する）
