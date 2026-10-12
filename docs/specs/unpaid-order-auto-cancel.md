# 未入金注文の自動キャンセル（Shopify Flow）

関連: Issue #46、[docs/specs/fulfillment-hold-by-payment-status.md](./fulfillment-hold-by-payment-status.md)（Flow①・②、Issue #71）

## 目的・背景

コンビニ決済（KOMOJU）・銀行振込は前払い型で、顧客が実際に支払うまで入金が確定しない。[fulfillment-hold-by-payment-status.md](./fulfillment-hold-by-payment-status.md)のFlow①・②により、入金が確定するまで発送を保留し、タグ（`入金待ち`／`発送可`）で状態を可視化する仕組みは実装済み。

しかし、顧客がいつまでも支払わない注文がそのまま残り続けると、在庫を確保したまま放置される。Issue #2のコメントに基づく事業判断として、**未入金のまま一定日数（デフォルト7日）が経過した注文は自動的にキャンセルする**。この日数は管理者が管理画面から変更できる必要がある。

## 事前調査で確認した事実（2026-10-13）

- Shopify FlowのWaitアクションは、**1ワークフローあたり最大90日**まで待機できる（[Shopify Help Center](https://help.shopify.com/en/manual/shopify-flow/reference/actions/wait)）。デフォルト7日は問題なく収まる
- Waitで待機している間にストアのデータ（タグ等）が変化した場合、**Wait終了後は最新の状態に更新されたデータを使って以降のステップが実行される**。つまりWaitの後に置いた条件ブロックは「待機完了時点の最新のタグ」を見て判定できる
- `Cancel order`アクションには以下のフィールドがある（[Shopify Help Center](https://help.shopify.com/en/manual/shopify-flow/reference/actions/cancel-order)）
  - **Reason**（必須。デフォルトは「Customer changed/canceled order」）
  - **Send a notification to the customer**（顧客への通知）
  - **Refund**（支払い済み金額の返金。未入金のPENDING注文では課金自体が発生していないため対象外）
  - **Restock items**（在庫に戻す）
  - **Staff note**（管理画面タイムラインに残すメモ）

## 設計: 既存Flow①への追記

新しいワークフローを作るのではなく、既存の**Flow①「前払い注文の発送保留」**（[fulfillment-hold-by-payment-status.md](./fulfillment-hold-by-payment-status.md)参照）の末尾に、以下のステップを追記する。トリガー・決済ゲートウェイの条件分岐をそのまま再利用できるため。

```
Order created
→ Condition: 決済ゲートウェイが "KOMOJU - コンビニ決済 (Convenience Store)" または "Bank Deposit"
  Yes:
    1. Hold fulfillment order（Reason: AWAITING_PAYMENT）         … 既存
    2. Add order tags: 入金待ち                                   … 既存
    3. Wait: 7日                                                  … 追加
    4. Condition: タグに `入金待ち` が含まれる（＝まだ入金未確定） … 追加
       Yes:
         5. Cancel order                                          … 追加
            - Reason: Other
            - Staff note: 「入金確認期限（7日）を超過したため自動キャンセル」
            - Restock items: ON
            - Send a notification to the customer: ON
            - Refund: OFF（未入金のため課金自体が発生していない）
       No: 何もしない（Flow②が入金確定時に `入金待ち` → `発送可` へ切り替えているので、ここに来た時点で入金済みなら `入金待ち` タグは既に外れている）
```

Flow②（入金確定で保留解除＋タグ更新）は変更不要。

### 「管理者が管理画面から日数を変更できる」の実現方法

Flow①の**Waitアクションの日数欄をデフォルト7日で設定**し、管理者が日数を変えたい場合はFlow画面を開いてこの数値を直接書き換える方式を採る（ユーザー判断、2026-10-13）。Shop metafieldに日数を持たせて動的に参照する方式も技術的に可能だが、Waitアクションの待機期間に変数を渡せるかが未確認で実装が複雑になるため見送った。

## 作成手順（Shopify管理画面）

**注意（重要）: Flowの編集画面（埋め込みiframe）はブラウザ自動操作（CDP）との相性が悪く、過去2回の検証でテキスト入力やノードのクリックが安定しないことが分かっている（[fulfillment-hold-by-payment-status.md](./fulfillment-hold-by-payment-status.md)の「ブロッカー①」参照）。この作業は自動化を試みず、人の手での操作を優先する。**

**注意（重要）: 編集対象は稼働中のFlow①。** Flow①はIssue #71で実機検証済み・本番運用中の発送保留機能（コンビニ決済・銀行振込の注文を自動でHold＋タグ`入金待ち`付与）を担っている。これから追記する3ステップはこの既存ワークフローの続きに追加する形になるため、作業中の保存ミスで既存部分を壊すと発送保留機能ごと止まるリスクがある。

- 編集を始める前に、Flow①の現在の構成（トリガー・条件・既存2アクション）をスクリーンショット等で記録しておく
- 保存・有効化した後は、新しいステップだけでなく既存部分（Hold fulfillment order / Add order tags `入金待ち`）が壊れていないかも、新規の前払いテスト注文1件で確認する（下記の動作確認手順と合わせて実施でよい）

1. 管理画面 > アプリ > Flow を開き、既存のワークフロー「前払い注文の発送保留」（Flow①）を編集
2. 既存の「Add order tags（`入金待ち`）」アクションの下に、新しいステップとして「Wait」を追加
   - 待機期間: 7日
3. その下に「Condition」を追加
   - 比較対象: `order / tags`
   - 演算子: 「含む」（contains）に相当するもの
   - 値: `入金待ち`
4. 条件の「真（Yes）」側に「Cancel order」アクションを追加
   - Reason: Other（該当する選択肢がなければ一番近いもの）
   - Staff note: `入金確認期限（7日）を超過したため自動キャンセル`
   - Restock items: ON
   - Send a notification to the customer: ON
   - Refund: OFF
5. 保存して「有効にする」

## 動作確認の手順（日数を一時的に短縮して検証する）

完了条件「設定した日数のとおりに自動キャンセルされること」を確認するために7日間待つのは現実的でないため、検証時だけWaitの期間を短縮し、確認後に7日へ戻す。

**事前に確認すること**: Waitアクションの期間入力で選べる単位（分・時間・日のどれが最小か）は未確認。画面を開いて実際に選べる最小単位を見てから検証時間を決めること。分または時間単位が選べれば数分〜数十分で検証が終わるが、日単位しか選べない場合は最短でも1日（例: 1日）かかる前提でスケジュールする。

1. Flow①を開き、Waitの期間を一時的に最小単位（例: 5分、または画面上で選べる最小値）に変更して保存
2. 銀行振込（`Bank Deposit`）またはKOMOJUコンビニ決済でテスト注文を作成し、**支払いを完了させずに放置**する
3. 設定した待機時間が経過するのを待つ
4. Flowの「実行履歴」（ワークフロー詳細画面）で、該当注文に対してWait→Condition→Cancel orderが実行されたことを確認する
5. 対象の注文を開き、以下を確認する
   - 注文のステータスが「キャンセル済み」になっている
   - 在庫が元に戻っている（商品のバリエーション在庫数を確認）
   - 顧客への通知（Shopifyが自動送信するキャンセルメール）が送られたこと（自分のテストメールアドレスで確認できる場合）
6. 確認後、Waitの期間を**7日に戻す**のを忘れないこと
7. 別のテスト注文で、待機中に支払いを完了させた場合はキャンセルされず、Flow②によって `発送可` タグに切り替わることも確認する（Flow①・②の既存の組み合わせ動作の再確認）

確認結果は本ドキュメントまたは[docs/research/unpaid-order-auto-cancel.md](../research/unpaid-order-auto-cancel.md)に追記する。

## 今後の検討事項

- 分割発送等で1注文に複数のFulfillment Orderがある場合、Cancel orderアクションがすべてのFulfillment Orderを正しくキャンセルするかは未確認
- 「Reason」に未入金キャンセルに適した選択肢がなければ「Other」で運用するが、本番導入後に選択肢が増えていないか都度確認する
