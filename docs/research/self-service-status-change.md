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

## 却下: メタフィールド→Flow→タグ変更

当初はこのアーキテクチャを推奨していたが、**Shopify純正のFlowにはメタフィールド更新を検知するトリガーが存在しない**ことが判明したため却下した。

- Devストアの管理画面でFlowのトリガー一覧を確認したところ（ユーザーによる手動確認）、`Customer tags added` / `Customer tags removed`（逆方向＝タグ変更を検知するもの）はあったが、メタフィールド更新を検知するトリガーはShopify純正には存在しなかった
- 見つかった `Customer metafield value changed` はサードパーティアプリ「Accentuate Custom Fields」が提供するものだった。無料プランもあるが商用ストアでの恒久利用が対象かは不明瞭で、新たなアプリ依存が発生する
- Shopify Developer Community で Shopify公式スタッフ（paul_n氏）が「メタフィールド更新トリガーは開発中だが、基盤のAPIが不安定でFlow向けにまだ提供できていない」と回答している（2026-10-02時点）。ロードマップ上の機能であり、現時点では存在しない

出典:
- https://community.shopify.dev/t/feature-request-metafield-value-changed-trigger-in-shopify-flow/36334
- https://help.accentuate.io/flow-integration/using-metafield-value-change-as-a-shopify-flow-tigger

## 結論: 卒業・転籍は「所属先（org_code）の自己申告」であり、購入可否には影響しない

ここで重要な認識の訂正があった。「卒業」は`member`タグ（購入可否）を外す操作ではない。**卒業しても購入は可能、という運用方針**（[dispatch-org-tagging.md](../specs/dispatch-org-tagging.md)の既存記述「卒業による購入可否の切替は可。購入可のまま残す運用も可能」と同じ）。卒業・転籍はどちらも「所属派遣元（`org:<org_code>`相当）の変更」という同じ操作軸の特殊ケースで、卒業は所属先を空にすること、転籍は別のorg_codeに変更すること。

これにより、**購入ゲート（Cart Validation Function）は一切変更不要**になった。`member`タグのみで判定する既存ロジックをそのまま維持する。

```
顧客（Customer Account UI Extension）
  → 自分で書き込めるメタフィールド（self_org_code）に所属先を書く（空＝卒業）
  → 注文作成時のスナップショット処理（Issue #8）がこのメタフィールドを優先的に参照する
```

却下した代替案:
- アプリが自前のFlow Triggerを作る／Admin APIを直接叩くサーバーを持つ → 「サーバー不要」方針と衝突するため却下
- タグを完全に廃止しメタフィールドに全面移行する → 既存のForms自動タグ付与・ロイヤリティ集計の実装を全て作り直すことになり影響範囲が大きすぎるため却下
- 購入ゲートに`self_active`相当のメタフィールド判定を追加する → 「卒業しても購入可能」という運用方針と矛盾するため不要と判明し却下

具体的なメタフィールド設計の実装詳細は [self-service-status-change.md（仕様）](../specs/self-service-status-change.md) を参照。

## 残課題

- 顧客が転籍先を自由に選べることの業務上の妥当性（裏付けのない自己申告でよいか）はIssue #2の事業判断事項に近い論点。今回は完了条件に明記された通り実装するが、運用開始後に見直しの余地がある
