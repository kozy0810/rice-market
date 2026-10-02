# 顧客自身による卒業・転籍ステータス変更の仕様

Issue #45 の実装仕様。実現方式の調査経緯は [docs/research/self-service-status-change.md](../research/self-service-status-change.md)、タグの命名規則は [dispatch-org-tagging.md](./dispatch-org-tagging.md) を参照。

## 背景

Customer Account API（顧客自身が使うAPI）には顧客タグを直接変更する手段が存在しない。顧客自身によるメタフィールド書き込みは公式にサポートされているため、顧客メタフィールドを「所属先の最新の自己申告値」として扱う方式を採る。Flowのような仲介は使わない（調査の結果、Shopify純正のFlowにはメタフィールド更新を検知するトリガーが存在しないため）。

**卒業・転籍は、どちらも「所属派遣元（`org:<org_code>`相当）の変更」という同じ操作軸の特殊ケース。** 卒業は所属先を空にすること、転籍は別の派遣元コードに変更すること。どちらも**購入可否（`member`タグ）には影響しない**（卒業しても購入は可能、という運用方針。[dispatch-org-tagging.md](./dispatch-org-tagging.md)の既存記述「卒業による購入可否の切替は可。購入可のまま残す運用も可能」と整合する）。

## 顧客メタフィールド

| キー | 型 | 用途 |
|---|---|---|
| `custom.self_org_code` | 単一行テキスト（空文字列可） | 顧客自身による所属先の自己申告。転籍は新しい`org_code`に変更、卒業は空文字列にする。値があれば（空でなければ）タグの`org:<org_code>`より優先される |

Customer Account API から顧客自身が読み書きできるよう、Admin側のメタフィールド定義で `MetafieldCustomerAccountAccess` を `READ_WRITE` に設定する（`docs/research/self-service-status-change.md`参照）。

## 購入ゲート（Cart Validation Function）への影響

**変更不要。** `apps/shopify-app/extensions/org-tag-gate/src/cart_validations_generate_run.ts` は `member` タグのみで判定する既存ロジック（[cart-validation-function.md](../research/cart-validation-function.md)）のまま維持する。卒業・転籍操作は所属先情報のみを変更し、購入可否には影響しない。

## 転籍先の解決ロジック（注文スナップショット、Issue #8）

Issue #8（nice to have、[royalty-snapshot.md](../research/royalty-snapshot.md)参照）で実装予定の、注文作成時点の派遣元スナップショット処理に、次の優先順位を追加する。

```
org_code = 顧客メタフィールド self_org_code（空でなければ）、なければタグ org:<org_code>
```

卒業済み（`self_org_code`が空文字列）の顧客が注文した場合、org_codeなし（≒どの派遣元のロイヤリティ集計対象にもならない）として扱う。

## Customer Account UI Extension（新規実装）

Profileページ等に「所属先を変更する」操作を1つ配置する。卒業・転籍は同じ操作のバリエーションとして扱う（所属先選択肢に「所属なし（卒業）」を含める）。

- `dispatch_org` メタオブジェクト（[dispatch-org-tagging.md](./dispatch-org-tagging.md)参照）から `active: true` の派遣元一覧を取得し、選択肢として表示する（「所属なし」を含む）
- 選択内容を確認する画面を挟んでから `self_org_code` に書き込む（確認ステップあり。即時反映はしない）
- 書き込み後、何度でも再変更できる（卒業から復帰、転籍し直し、いずれも同じ操作で可能。取り消し専用の仕組みは設けない）

## 未確定事項

- 顧客が裏付けなく自由に所属先を選べることの業務上の妥当性（`docs/research/self-service-status-change.md`の残課題を参照。Issue #2の事業判断事項に近い論点）
