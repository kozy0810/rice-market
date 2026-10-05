# 顧客自身による卒業ステータス変更の仕様

Issue #45 の実装仕様。実現方式の調査経緯は [docs/research/self-service-status-change.md](../research/self-service-status-change.md)、タグの命名規則は [dispatch-org-tagging.md](./dispatch-org-tagging.md) を参照。

## 背景

**「転籍」という概念は存在しない。** 会員登録時に組織（派遣元ごとの専用サインアップURL、[dispatch-org-tagging.md](./dispatch-org-tagging.md)参照）経由で組織が割り当てられ、顧客自身が自分でできる操作は「卒業」のみ。卒業は所属組織からの削除を意味し、**顧客アカウント自体は残り続ける**（退会ではない）。卒業しても購入は可能（`member`タグには影響しない運用方針）。

Customer Account API（顧客自身が使うAPI）には顧客タグを直接変更する手段が存在しない。顧客自身によるメタフィールド書き込みは公式にサポートされているため、「卒業したかどうか」を顧客メタフィールドで表現する。

## 顧客メタフィールド

| キー | 型 | 用途 |
|---|---|---|
| `custom.self_graduated` | 真偽値 | 顧客自身による卒業操作。`true`なら卒業済み（所属組織なし）。未設定は`false`相当として扱う |

Customer Account API から顧客自身が読み書きできるよう、Admin側のメタフィールド定義で `MetafieldCustomerAccountAccess` を `READ_WRITE` に設定する（`docs/research/self-service-status-change.md`参照）。

## 購入ゲート（Cart Validation Function）への影響

**変更不要。** `apps/shopify-app/extensions/org-tag-gate/src/cart_validations_generate_run.ts` は `member` タグのみで判定する既存ロジック（[cart-validation-function.md](../research/cart-validation-function.md)）のまま維持する。卒業操作は所属組織情報のみを変更し、購入可否には影響しない。

## 所属組織の解決ロジック（注文スナップショット、Issue #8）

Issue #8（nice to have、[royalty-snapshot.md](../research/royalty-snapshot.md)参照）で実装予定の、注文作成時点の派遣元スナップショット処理に、次の優先順位を追加する。

```
self_graduated が true なら → org_codeなし（どの派遣元のロイヤリティ集計対象にもならない）
false / 未設定なら          → タグ org:<org_code> をそのまま使う
```

## Customer Account UI Extension（新規実装）

Profileページ等に「卒業する」操作を1つ配置する。派遣元を選ぶUIは不要（組織の割り当ては会員登録時のみで、顧客が後から別の組織を選ぶ手段はない）。

- 「卒業する」ボタン → 確認画面を挟んでから `self_graduated` を `true` に書き込む
- 卒業後に取り消す操作は顧客自身には提供しない（管理者がAdmin API経由でタグを操作する既存経路（Issue #7）で対応する）

## 未確定事項

- なし（「転籍先を自由に選べることの妥当性」は転籍という概念自体が存在しないため解消した）
