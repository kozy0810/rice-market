# 顧客自身によるステータス変更（Issue #45）の実現方式

## 目的

Issue #45「卒業・転籍ステータスをユーザー自身が変更できるようにする」の実現方式を調査する。購入ゲート（[cart-validation-function.md](./cart-validation-function.md)）は顧客タグ（`member`, `org:<org_code>`）を見て判定しており（[dispatch-org-tagging.md](../specs/dispatch-org-tagging.md)）、管理者がAdmin側でタグを付け替える経路はIssue #7で実装済み。今回は「顧客自身がログイン後の画面から、自分でこのタグ相当のステータスを変更できるか」を調べる。

**前提の確認（2026-10-04）: 「転籍」という概念は存在しない。** 会員登録時に組織（派遣元ごとの専用サインアップURL経由）が割り当てられ、顧客が自分でできる操作は「卒業」（所属組織からの削除、アカウントは存続）のみ。顧客が後から別の組織を自分で選ぶ手段はない。以下の調査・結論は当初「転籍先を自己申告で変更できる」という前提で進めた部分を含むが、最終的な設計は「卒業のみ」に基づく（[self-service-status-change.md（仕様）](../specs/self-service-status-change.md)参照）。

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

## 結論: 卒業は「所属組織からの削除の自己申告」であり、購入可否には影響しない

ここで重要な認識の訂正が2つあった。

1. 「卒業」は`member`タグ（購入可否）を外す操作ではない。**卒業しても購入は可能、という運用方針**（[dispatch-org-tagging.md](../specs/dispatch-org-tagging.md)の既存記述「卒業による購入可否の切替は可。購入可のまま残す運用も可能」と同じ）
2. 「転籍」という概念は存在しない。顧客が自分でできる操作は「卒業」のみで、所属組織は会員登録時（専用サインアップURL経由）にのみ割り当てられる

これにより、**購入ゲート（Cart Validation Function）は一切変更不要**になり、UIも「派遣元を選ぶ」のではなく「卒業するボタン」1つのシンプルな実装で済む。

```
顧客（Customer Account UI Extension）
  → 「卒業する」操作で self_graduated メタフィールドを true にする
  → 注文作成時のスナップショット処理（Issue #8）が true なら所属組織なしとして扱う
```

却下した代替案:
- アプリが自前のFlow Triggerを作る／Admin APIを直接叩くサーバーを持つ → 「サーバー不要」方針と衝突するため却下
- タグを完全に廃止しメタフィールドに全面移行する → 既存のForms自動タグ付与・ロイヤリティ集計の実装を全て作り直すことになり影響範囲が大きすぎるため却下
- 購入ゲートに`self_active`相当のメタフィールド判定を追加する → 「卒業しても購入可能」という運用方針と矛盾するため不要と判明し却下
- 顧客が転籍先（派遣元一覧）を自由に選べるUI → 「転籍」という概念自体が存在しないため不要と判明し却下

具体的なメタフィールド設計の実装詳細は [self-service-status-change.md（仕様）](../specs/self-service-status-change.md) を参照。

## 追補（2026-10-06）: 「組織名」の表示には、既存のビルトイントリガーで足りる

Issue #45実装後、「派遣元」という表示をユーザーごとの具体的な組織名（例:「さくら協同組合」）にしたいという追加要望が出た。顧客は `org:<org_code>` タグを持つが、`org_code` は短い識別子でしかなく、人間が読む組織名（`dispatch_org` メタオブジェクトの `org_name` フィールド）とは別物。UI表示用に、`org_code` → `org_name` の変換結果を顧客メタフィールドとして持たせたい。

上の「却下」節では「メタフィールド更新→Flow→タグ変更」という方向（メタフィールドの変更を検知するトリガーがない）を検討して却下したが、**今回は向きが逆**で「タグ追加→Flowでメタフィールド更新」。この向きなら `Customer tags added` というビルトイントリガーが最初から存在し（却下節の調査で既に確認済み）、サーバーも不要なため、構成Bの前提と衝突しない。

### 採用した設計

```
顧客タグに org:<org_code> が追加される（Forms等、既存の仕組み）
  → Flowトリガー: Customer tags added
  → アクション: Get metaobject entries（dispatch_org を全件取得）
  → アクション: Update customer metafield（Liquidでタグから org_code を抽出し、
                 一致する dispatch_org エントリの org_name を書き込む）
```

**メタオブジェクトのフィルタリング機能はTOML宣言的定義では使えない。** 管理画面の「派遣元組織」定義ページで「フィルターとして使用されるフィールド」欄がグレーアウトし編集不可だった。`shopify-dev`スキルで調査した結果、TOML宣言的メタオブジェクト定義がサポートする capability は `Publishable` / `Translatable` / `Renderable` のみで、`adminFilterable` は非対応と判明（[metaobjects.md](./metaobjects.md)の設計に追加の制約）。そのため `Get metaobject entries` はクエリなしで全件取得し、絞り込みは後続の `Update customer metafield` の Value 欄で Liquid を使って行う。

Value欄のLiquid（`tags`・`getMetaobjectEntries` が利用可能な変数として渡される）:

```liquid
{% assign found = "" %}{% for t in tags %}{% if t contains 'org:' %}{% assign found = t | remove: 'org:' %}{% endif %}{% endfor %}{% for e in getMetaobjectEntries %}{% if e.orgCode == found %}{{ e.orgName }}{% endif %}{% endfor %}
```

Devストアでテスト実行し、テスト顧客（タグ `member`, `org:sakura`）に対して `org_name` メタフィールドが正しく「さくら協同組合」に評価されることを確認済み。ワークフロー（「顧客タグ追加時に組織名を同期」）は本番運用でオンにした。

### ハマりどころ: Flowのコードエディタでの `{% %}` 入力がブラウザ自動操作で壊れる

Flowの `Update customer metafield` アクションの Value 欄は Liquid用のコードエディタ（CodeMirror系）で、**`{%` や `{{` を入力すると自動的にスニペット補完ポップアップが開く**。ブラウザ自動操作で文字列をまとめて1回の `type` 操作として送ると、途中のスペースキー入力がポップアップの確定操作として誤認識され、`{% assign variable_name = value %}` のようなテンプレート片が無関係に挿入される。結果、末尾に `%}` が大量に重複した壊れたコードになる（評価結果が `さくら協同組合 %} %} %} ...` のようになる）。

対処: `{%` や `{{` を打つたびに `Escape` キーを挟んでポップアップを閉じてから続きを入力する。この方式なら自動クローズされた `%}` / `}}` をそのまま使え、`End` キーで行末（自動補完された閉じ括弧の後）に移動してから次のタグを追記していける。人間が手でタイプする場合はこの問題は起きにくいが、自動入力・コピペ系のツールでこのエディタを操作する際は要注意。
