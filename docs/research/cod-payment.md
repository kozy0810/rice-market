# 代引き（COD）注文の管理者側運用フロー

関連: Issue #2、[komoju-payment.md](./komoju-payment.md)（同種の検証をコンビニ決済で実施済み）

## 目的

代引き（Cash on Delivery, COD）で顧客が購入した場合、管理者側では発送までどのような運用になるかを検証する。あわせて、顧客が代金を支払わなかった（受取拒否・不在）場合の扱いも調査する。

## 検証手法

ブラウザ操作（実際のチェックアウトを通す、管理画面のUIを見る）はこのセッションでは行えないため、`shopify store execute`（Admin GraphQL）での挙動確認にとどめた。**UIの実際のボタン配置・文言はAPIからは分からない**ため、別途実機（ブラウザ）での確認が必要な項目は末尾にまとめる。検証用に作成した注文・下書き注文はすべて `orderDelete`/`draftOrderDelete` で削除済み。

## 実機確認できたこと

### 1. 代引き注文の作り方・gateway名の扱い

- `draftOrderComplete` を引数なしで実行すると `paymentGatewayNames: ["manual"]` かつ `displayFinancialStatus: PAID`（即時決済済み）になる。CODは自動選択されない
- `draftOrderComplete(paymentPending: true)` のみを指定すると、KOMOJU検証時と同じ汎用 `"manual"` gatewayで `displayFinancialStatus: PENDING` の注文が作れる
- ストア内の既存注文 `#1006` は `paymentGatewayNames: ["Cash on Delivery (COD)"]` というCOD固有のgateway名を持っていた。これは `draftOrderComplete` に `paymentGatewayId` を明示的に渡した場合にのみ得られる結果と判明したが、**このIDをAdmin GraphQLのどのクエリからも取得する方法は見つからなかった**（`PaymentGateway` という型自体がスキーマに存在しない）。本番でこのIDをアプリから扱う必要が生じた場合は別途調査が必要

### 2.「支払い済みとしてマーク」に相当するAPI操作は2種類ある

| ミューテーション | 挙動 | タイムライン文言 |
|---|---|---|
| `orderMarkAsPaid` | PENDING注文を一括で支払い済みにする。新規`SALE`トランザクションが元のgatewayを継承して追加される | 「〜を支払い済みとして手動でマークしました。」（決済方法名は出ない） |
| `orderCreateManualPayment` | `paymentMethodName` を指定して記録する。新規トランザクションのgatewayが指定した名前になる | 「Cash on Delivery (COD)によって〜を支払い済みとして手動でマークしました。」（決済方法名が明記される） |

どちらも `userErrors: []` で成功し、`displayFinancialStatus` は `PAID` に変化した。**`orderCreateManualPayment` の方が、どの決済方法で支払い済みにしたかがタイムラインに残るため、代引きの運用実態に合っている。** `orderCreateManualPayment` のドキュメントには「`write_orders`スコープ + `mark_orders_as_paid`権限が必要」「`amount`フィールドの利用はShopify Plusストア限定」との記載がある。

管理画面の「支払い済みとしてマーク」ボタンが内部的にどちらを呼んでいるかはAPIからは分からないが、文言の一致度から `orderCreateManualPayment` 相当の可能性が高いと推測される（未実証）。

### 3.「追加情報」「決済手順」の文言はどこにも保存されない

決済方法設定（設定 > 決済 > 手動の決済方法）で入力する「追加情報」「決済手順」のテキストは、注文データのどこにも保存されないことを確認した。

- COD gatewayを持つ既存注文 `#1006` を調査: `note: null`、`customAttributes: []`、`lineItems[].customAttributes: []`、トランザクションの `paymentDetails: null`、`receiptJson: "{}"`
- `PaymentDetails` インターフェースをintrospectionで確認したところ、実装している型は `CardPaymentDetails` / `LocalPaymentMethodsPaymentDetails` / `PaypalWalletPaymentDetails` / `ShopPayInstallmentsPaymentDetails` のみで、**手動決済方法用のバリアントは存在しない**

**結論（未実証・推論を含む）**: 「追加情報」「決済手順」はチェックアウト画面・注文確認ページ側で、設定内容がその場で動的にレンダリングされる表示専用の文言であり、注文データとしては永続化されない。つまり、設定を変更した後に過去の注文を見返しても、注文確定時点の文言は残っていない可能性が高い（この動的レンダリングの挙動自体はブラウザUIでの確認ができず未実証）。

### 4. 発送（fulfillment）はPENDINGのままでも可能 — KOMOJU検証と同じ結論

PENDING状態の代引き注文に対して `fulfillmentCreate` を実行したところ、`userErrors: []`、`fulfillment.status: SUCCESS` で成功した。実行後、注文は `displayFinancialStatus: PENDING` かつ `displayFulfillmentStatus: FULFILLED` の状態で両立し、タイムラインには発送成功のメッセージのみが記録され、**未入金に関する警告は一切出ない**。

→ [komoju-payment.md](./komoju-payment.md)で確認した「Shopifyは支払い未確定の注文でも発送をシステム的にブロックしない」という結論は、代引きにもそのまま当てはまる。決済方法によらずShopify共通の挙動であり、未入金のまま発送してしまうのを防ぐ仕組みはシステム上存在しない。

### 5. タイムラインに記録される文言（実機確認）

| 段階 | action | message |
|---|---|---|
| 注文作成（PENDING） | `sale_pending` | 「manualで¥5,500 JPYの決済が保留中です。」 |
| `orderMarkAsPaid` 実行後 | `sale_success` | 「〜この注文について、¥5,500 JPYを支払い済みとして手動でマークしました。」（方法名なし） |
| `orderCreateManualPayment`（`paymentMethodName`指定）実行後 | `sale_success` | 「〜Cash on Delivery (COD)によって¥5,500 JPYを支払い済みとして手動でマークしました。」（方法名あり） |
| `fulfillmentCreate` 実行後 | `fulfillment_success` | 「〜1個のアイテムをShop locationから発送済みとしてマークしました。」 |

※ `sale_pending` の文言は `paymentPending: true` 経由で作った汎用 `"manual"` 注文のものであり、実際にストアフロントでCODを選んで決済したPENDING注文の文言が同一かどうかは未確認（ブラウザ操作が必要）。

## 購入者が代金を支払わなかった場合（配送業者側の実務、公式FAQ・ベンダー記事調査）

Shopify・KOMOJUいずれとも独立した、配送業者（ヤマト運輸の「宅急便コレクト」等）の実務。詳細は[checkout.mdの該当節](./checkout.md#代引きで購入者が支払わなかった場合公式faqベンダー記事調査未実証)に記録した。要点のみ再掲する。

- 発生パターンは「不在」「受取拒否」「保管期限切れ（最大7日間）」の3つ。いずれも商品は発送元へ返送される
- **受け取られなかった場合でも代引き手数料は発生する**。往復送料も発生する
- 顧客に返送料・手数料を請求するのが一般的な対応だが、連絡が取れない・応じない場合は店舗側の負担で終わるケースが多い
- 配送業者の保管期限（最大7日）は、[Issue #46で決定済みの未入金注文自動キャンセル期限（デフォルト7日）](https://github.com/kozy0810/rice-market/issues/46)とほぼ一致しており、運用上噛み合う
- Shopify側で「発送済みの注文が受取拒否で返送されてきた場合」にどう処理するか（返品・在庫戻し・キャンセル）は、システムが自動で面倒を見てくれるわけではなくマーチャントの手動判断になる（未実証・推論）

## 未確認のまま残っている項目（ブラウザでの実機確認が必要）

- 管理画面の「支払い済みとしてマーク」ボタンが実際にどちらのAPI操作を呼んでいるか
- 実際にストアフロントでCODを選んでチェックアウトした場合の、タイムライン文言・注文詳細画面の実際の見た目
- 「追加情報」「決済手順」が注文確認ページ・確認メールにどう表示されるか、設定変更後に過去注文の表示がどうなるか
- COD固有の `paymentGatewayId` を正規に取得する方法（UI上でのみ得られるのか、別のAPIがあるのか）
