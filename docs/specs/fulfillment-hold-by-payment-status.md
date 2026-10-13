# 決済方法に応じた発送保留の自動化（Shopify Flow）

関連: Issue #2（コンビニ決済の採用検討）、[docs/research/komoju-payment.md](../research/komoju-payment.md)、[docs/research/cod-payment.md](../research/cod-payment.md)

## 目的・背景

決済方法によって、注文確定後に「誰が次のアクションを起こすべきか」が異なる。

- **代引き・クレジットカード**: 支払いは発送後（代引きは配達時、クレジットカードはチェックアウト時点でほぼ確定）に成立する。つまり注文が来た時点で、次に動くのは**管理者**（発送してよい）
- **コンビニ決済（KOMOJU）・銀行振込**: 顧客が実際に支払いを完了するまで、発送してはいけない。次に動くのは**顧客**（入金待ち）

Shopify標準の注文一覧には、この「どちらのターンか」を一目で判別する機能がない。また、[komoju-payment.md](../research/komoju-payment.md)・[cod-payment.md](../research/cod-payment.md)で確認した通り、Shopifyは支払いが保留中（Pending）の注文であっても、発送（fulfillment）操作をシステム的にブロックしない。つまり何もしなければ、入金前の注文をうっかり発送してしまう事故を防ぐ仕組みが存在しない。

この仕様では、Shopify Flow（無料・サーバー不要）を使って以下の2つを同時に実現する。

1. **事故防止**: 前払い型の決済方法（コンビニ決済・銀行振込）の注文は、入金が確定するまで自動的に発送をブロックする
2. **可視化**: 注文にタグを自動付与し、一覧の「タグ」列やフィルタで「入金待ち」か「発送可」かを一目で判別できるようにする

## 全体設計

### 対象の分類

| 決済方法 | 分類 | 理由 |
|---|---|---|
| 代引き (COD) | 発送可（Hold対象外） | 配達時に代金を回収するため、発送自体が回収プロセスの一部 |
| クレジットカード（Shopify Payments） | 発送可（Hold対象外） | チェックアウト時点でほぼ即座に決済が確定する |
| コンビニ決済（KOMOJU） | 入金待ち（Hold対象） | 顧客が実際にコンビニで支払うまで資金が確定しない（[komoju-payment.md](../research/komoju-payment.md)参照） |
| 銀行振込 | 入金待ち（Hold対象） | 顧客が実際に振り込むまで資金が確定しない |

### タグの命名規則

| タグ | 意味 | 付与タイミング |
|---|---|---|
| `入金待ち` | 顧客の支払いを待っている状態。発送してはいけない | コンビニ決済・銀行振込の注文が作成された時 |
| `発送可` | 管理者が発送してよい状態 | 上記以外の注文が作成された時、または入金待ちの注文の支払いが確定した時 |

### 発送保留（Fulfillment Hold）の理由

Shopify標準の `FulfillmentHoldReason` には、ちょうど「支払い待ちのため保留」を意味する `AWAITING_PAYMENT` という定義済みの値がある。これを使うことで、保留中の注文を開いたときに表示される理由も適切な内容になる（カスタムの自由記述理由より分かりやすい）。

## Flow①: 前払い型の注文を保留＋タグ付けする

**トリガー**: Order created（注文作成）

**条件**: 決済ゲートウェイ（Payment gateway）が「コンビニ決済（KOMOJUで設定した名称）」または「銀行振込」のいずれかと一致する

**アクション**:
1. Hold fulfillment order（発送保留）
   - Reason: `AWAITING_PAYMENT`（画面上の選択肢に該当するものがあれば選ぶ。なければ一番近いものを選び、Reason notesに「入金確認まで発送保留」等を補記する）
   - Notify merchant: 任意（保留をかけたことをメール通知したい場合はON）
2. Add order tags（タグ追加）
   - Tags: `入金待ち`

### 作成手順（Shopify管理画面）

1. 管理画面左メニューの「アプリ」→「Flow」を開く（未インストールなら先にShopify Flowアプリを追加する。無料の標準アプリ）
2. 「ワークフローを作成」→「一から作成」を選ぶ
3. トリガーとして「Order created」を選択
4. 条件（Condition）ブロックを追加し、変数ピッカーで `order / paymentGatewayNames` を選択する。この変数は `String[]`（リスト）型のため、選択すると条件が自動的に「At least one of order / payment gateway names」という量化子でラップされ、その下にリスト項目1件分の比較（`paymentGatewayNames_item` 等しい／値）が1つ用意される（2026-10-10に実機確認済み、詳細は本ドキュメント末尾の「実装・実機検証の試行結果」参照）。コンビニ決済・銀行振込の2値をORでまとめて指定する具体的な操作（演算子に「is one of」相当があるか、`条件を追加`でANDではなくORとして2つ目の条件を足せるか）は実機で確認できておらず未解決（下記参照）
   - **重要な注意**: ゲートウェイ名は**設定 > 決済ページに表示されている名称をそのまま使ってはいけない**。実際に注文に保存される `paymentGatewayNames` の値と、設定画面の表示名が一致しない決済方法がある（下記「実装・実機検証の試行結果」の表を参照）。必ず実在する注文をGraphQLで取得し、`paymentGatewayNames` の実際の文字列をコピーして使うこと
5. 条件の「真（Yes）」側に「Hold fulfillment order」アクションを追加し、Reasonで該当する選択肢を選ぶ（`AWAITING_PAYMENT`に相当するもの。画面上の表記は英語名と異なる場合がある）
6. 同じく「真（Yes）」側に「Add order tags」アクションを追加し、Tagsに `入金待ち` と入力する
7. ワークフロー名を分かりやすく付ける（例: `前払い注文の発送保留`）
8. 「有効にする」で保存・ONにする

## Flow②: 入金確定で保留解除＋タグ更新する

**トリガー**: Order paid（注文の支払い状況が「支払い済み」に変化した時）

**条件**: 注文のタグに `入金待ち` が含まれる

**アクション**:
1. Release fulfillment order holds（発送保留の解除）
2. Remove order tags（タグ削除）
   - Tags: `入金待ち`
3. Add order tags（タグ追加）
   - Tags: `発送可`

### 作成手順

1. Flowで新しいワークフローを作成し、トリガーに「Order paid」を選ぶ
2. 条件ブロックで「Tags」を選び、「contains」や「has tag」に相当する演算子で `入金待ち` を指定する
   - **注意**: `Order paid` トリガーは、クレジットカードの自動キャプチャだけでなく、代引きなどの手動決済方法で管理者が「支払い済みとしてマーク」した場合にも発火する（[cod-payment.md](../research/cod-payment.md)で確認済みの `orderMarkAsPaid` / `orderCreateManualPayment` のどちらでも発火すると推測される）。この条件（タグに`入金待ち`が含まれる）を必ず入れることで、代引きの注文（そもそも`入金待ち`タグが付いていない）には誤って反応しないようにする
3. 条件の「真（Yes）」側に「Release fulfillment order holds」アクションを追加する
4. 続けて「Remove order tags」（`入金待ち`を削除）、「Add order tags」（`発送可`を追加）を追加する
5. ワークフロー名を付ける（例: `入金確定で発送保留を解除`）
6. 「有効にする」で保存・ONにする

## 動作確認の手順（テストモードで実施）

1. KOMOJUのテストモードでコンビニ決済のテスト注文を作成する（[komoju-payment.md](../research/komoju-payment.md)の手順）
2. 注文詳細を開き、以下を確認する
   - タグに `入金待ち` が付いている
   - フルフィルメントのセクションに「保留中」の表示があり、理由が確認できる
   - この状態で発送（フルフィルメント）ボタンを押そうとすると、保留が外れるまで操作できない、または保留の解除を促す表示が出ることを確認する
3. KOMOJU管理画面で「Simulate Capture」を実行し、支払いを完了させる
4. Shopify側の注文を再確認し、以下を確認する
   - 決済ステータスが「支払い済み」に変わる
   - タグが `入金待ち` → `発送可` に変わる
   - フルフィルメントの保留が解除され、通常通り発送操作ができる
5. 代引きでも同様にテスト注文を作成し、最初から `発送可` 相当の状態（保留なし）であること、`入金待ち` タグが付かないことを確認する

## 未確定・要検証の事項（2026-10-11 更新）

Issue #71で実機検証を試みたが、後述の理由によりFlow①・Flow②とも最後まで組み上げられなかった。以下は実機で確認できなかった、またはそもそも到達できなかった事項。

- ~~銀行振込の `paymentGatewayNames` の実際の文字列~~ → **2026-10-11、ユーザーが実際に銀行振込でテスト注文（#1015）を作成し確定した。`Bank Deposit`（英語）。** CODと同様、設定画面の表示名（`銀行振込`）とは一致しない。Flow①の条件には `Bank Deposit` と `KOMOJU - コンビニ決済 (Convenience Store)` の2値を使うこと
- 「Payment gateway」条件で複数ゲートウェイをOR条件で一括指定できるか、個別の条件をORでつなぐ必要があるか（`order/paymentGatewayNames` が `String[]` であることと、選択すると「At least one of」量化子が自動で付くことまでは確認できたが、2値をORで比較する具体的なUI操作は未確認）
- 条件の演算子ドロップダウン（「等しい」の他に「is one of」「contains」等の選択肢があるか）は、ドロップダウンを開けず中身を確認できなかった
- 「条件を追加」ボタン（IFブロック直下にある、リスト項目用とは別のもの）で追加した2つ目の条件が、AND/ORどちらで結合されるのか、選択できるのか
- 「Hold fulfillment order」アクションのReason選択肢に、`AWAITING_PAYMENT` に相当する項目が実際に表示されるか（Hold fulfillment orderアクション自体を追加するところまで到達できなかった）
- `Order paid` トリガーが、代引きの「支払い済みとしてマーク」操作（`orderCreateManualPayment`）で確実に発火するか（Flow②は未着手）
- 複数のFulfillment Order（分割発送等）がある注文で、Hold・Releaseがどう扱われるか

## 実装・実機検証の試行結果（2026-10-10、Issue #71）

Devストアの管理画面でFlowアプリを開き、Flow①の構築を試みた。トリガーの設定とConditionアクションの追加・変数選択までは進んだが、条件の値（ゲートウェイ名の文字列）を入力する手前でブラウザ自動操作が機能しなくなり、Flow①・Flow②とも完成させられなかった。KOMOJU実機テスト（Simulate Capture）は別の理由で最初から実行不可だった。以下に確認できた事実とブロッカーを記録する。

### 確認できた事実

**Flowはこの開発ストアで問題なく開け、ワークフローを最後まで作れる見込みがある。** [serverless-options.md](./serverless-options.md)で残っていた懸念（開発ストアのプランでFlowが使えるか）は解消した。既存のアクティブなワークフロー「顧客タグ追加時に組織名を同期」（Issue #45関連）が実際に本番運用されていることもその傍証。

**決済ゲートウェイの実際の保存値をGraphQLで確認した（2026-10-10、`shopify store execute` で全注文を取得）。**

| 決済方法 | 設定画面（設定 > 決済）での表示名 | 注文の `paymentGatewayNames` に実際に保存される値 | 一致するか |
|---|---|---|---|
| コンビニ決済（KOMOJU） | `KOMOJU - コンビニ決済 (Convenience Store)` | `KOMOJU - コンビニ決済 (Convenience Store)`（注文#1009で確認） | 一致 |
| 代引き (COD) | `代引き (COD)` | `Cash on Delivery (COD)`（注文#1006・#1014で確認、英語） | **不一致** |
| 銀行振込 | `銀行振込` | `Bank Deposit`（注文#1015で確認、英語） | **不一致** |

**代引きで表示名と保存値が食い違う事実は重要な学び。** Flowの条件（決済ゲートウェイ名の文字列比較）を設定するときは、設定画面に表示されている名称を鵜呑みにせず、**必ず実際の注文データ（`paymentGatewayNames`）を確認してから使う**という運用ルールをここに明記する。今回COD自体はFlow①の対象外（Hold対象外の決済方法）なので実害はなかったが、気づかずに設定画面の表示名を使っていたら、Flowの条件が静かに一致せず機能しないという事故になっていた。

**Flowの条件エディタで `order/paymentGatewayNames` を選ぶと、自動的に「At least one of order / payment gateway names」という量化子（リストの要素のうち少なくとも1つが条件を満たせばtrue）でラップされ、配下にリスト項目1件分の比較ブロック（`paymentGatewayNames_item` / 演算子 / 値）が生成される。** 変数ピッカーには他に `order/transactions/gateway`（String）、`order/transactions/formattedGateway`（String）という代替フィールドも存在する。

### ブロッカー①: ブラウザ自動操作が途中から機能しなくなった

Flow①の構築中、以下の手順までは正常に進んだ。

1. 「ワークフローを作成」→トリガー検索で「Order created」を選択（検索ボックスへの入力・候補クリックとも正常動作）
2. 条件（Condition）ブロックを追加し、「変数を追加」から `order/paymentGatewayNames` を検索・選択（これも正常動作、上記の「At least one of」量化子が自動生成された）

ここから条件の値（ゲートウェイ名の文字列）を入力しようとした段階で、2種類の不具合が再現性をもって発生し、それ以降は回復しなかった。

- **(a) テキスト入力欄にフォーカスが当たっても、キー入力が管理画面本体（Flowの埋め込みiframeの外側）に流れてしまう。** 一度は値欄をクリックした際に青いフォーカスリングが表示されたことを確認したが、続けて `KOMOJU - コンビニ決済 (Convenience Store)` と入力すると、画面上部の管理画面共通の「バーコードスキャン」機能が反応し、「バーコード『KOMOJU - (Convenience Store)』が見つかりませんでした」というダイアログが表示された（日本語部分の文字が欠落していた点も含め、複数回・複数パターンで再現）。別の試行では、入力した文字列がそのまま管理画面の「在庫」ページへの遷移（`?query=has_barcode%3A%22false%22` というバーコード未設定商品の絞り込みフィルタ）を引き起こした。いずれも、フォーカスの見た目とは裏腹に、実際のキーイベントがFlowのiframe内部ではなく管理画面のシェル（親フレーム）側のグローバルなバーコードスキャン検知ロジックに渡ってしまっていることを示している
- **(b) Flowのワークフローキャンバスやテーブル系UI（注文一覧など）で、スクリーンショットを撮った時点の見た目と、実際にクリックが届く座標がズレることがある。** 一度選択済みの条件ノードをクリックしても、ノードが選択状態（確認バッジ表示）にはなるが詳細編集パネルが開かない、という状態に固定され、ページの再読み込み・新しいタブでの再読み込み・ウィンドウリサイズを試しても再現し続けた。関係ない注文一覧ページでも、行をクリックしたらテーブルのソート（列ヘッダー）やチェックボックスが代わりに反応する、という事象を複数回確認しており、クリック対象そのものが描画更新によって動いた後にクリックイベントが届いている可能性が高い

これらはクロスオリジンiframeに起因する既知の制約（`docs/shopify-verification-log.md`・`self-service-status-change.md`に既出の「埋め込みiframeの座標クリックが不安定」）よりも広い症状である。具体的には、`find`・`read_page`・`javascript_tool` のいずれもFlowのiframe内部を認識できないことを本検証で確認した（`javascript_tool` で `document.querySelectorAll('select')` を実行しても空配列が返る＝親フレームのDOMしか見えない）。一方でキーボードの `Escape` キーは常に機能し、Flowエディタのパネルを閉じてオーバービュー画面に戻る、という動作が安定して起きた（編集中に誤って `Escape` を押すと保存済みの下書きのまま編集パネルが閉じるため注意）。

このブロッカーにより、Flow①は「トリガー: Order created」＋「Condition: At least one of order/paymentGatewayNames equals （値未入力）」という未完成の下書き状態までしか作成できていない。Flow②は未着手。

**この下書きワークフローはDevストアに残っている**（ワークフロー名: `New Workflow`、内部ID `01a1249c-0081-7e7d-a871-b13c218de442`、ステータス: 非アクティブ＝実行されない安全な状態）。人間の手でFlow画面から直接編集するか、不要であれば削除してよい。

### ブロッカー②: KOMOJU管理画面の認証情報がない

動作確認の手順のうち「KOMOJU管理画面で『Simulate Capture』を実行する」は、KOMOJU管理ダッシュボードへのログインが必要になる。[komoju-payment.md](../research/komoju-payment.md)に記録の通り、KOMOJUのアカウント作成・Shopifyとの連携は前回のセッションで**ユーザー本人がブラウザで実施**しており、そのログイン認証情報（KOMOJU側のアカウント）はこのリポジトリのどこにも記載されていない。今回のセッションであらためて探したが見つからず、ブラウザでKOMOJU管理画面にアクセスする手段がないため、Simulate Captureの実行はブロッカー①とは独立に実行不可だった。

### 今回の検証で判明した副次情報

- ストアの表示名が検証中に `rice-market-dev` から `dev-rice-rakuraku-delivery` に変化していることに気づいた。ただしドメイン（`rice-market-dev.myshopify.com`）・ビジネスエンティティ（`rice-market-dev - entity`、作成日2026年9月20日）は変化しておらず、**同一ストアであることは設定 > 一般で確認済み**。表示名変更はユーザーが意図的に行ったもの（Issue #72）。今後このストアを `dev-rice-rakuraku-delivery` という名称で見かけても、`rice-market-dev` と同じストアである

## Flow②での追加の落とし穴: 「Release fulfillment order holds」は単体のFulfillmentOrderを要求する（2026-10-11）

Flow②を手動で組んだところ、`Release fulfillment order holds`アクションの Fulfillment order 欄で以下のエラーが出た。

```
FulfillmentOrder が必要です
トリガーまたは前のステップから取得できる FulfillmentOrder がありません。FulfillmentOrder を取得するには、以下の操作を行ってください。
・FulfillmentOrder を含むトリガーに変更する
・「For each」ステップを使用して、FulfillmentOrder オブジェクトのリストをループ処理する
・「Run code」ステップを使用して FulfillmentOrder を定義する
```

**原因**: `Order paid`トリガーが渡すのは注文（`order`）であり、`order.fulfillmentOrders`は**リスト**（複数件になりうる）。`Release fulfillment order holds`は単体のFulfillmentOrder（1件）を要求するアクションのため、リストをそのまま渡すと型エラーになる。

**解決策**: `Release fulfillment order holds`の手前に「For each」ステップを追加し、対象リストに `order.fulfillmentOrders` を指定。`Release fulfillment order holds`をそのループの中に移動し、Fulfillment order欄にはループ変数（現在のアイテム）の `id` を選ぶ。`Remove order tags`・`Add order tags`は注文自体への操作なのでループの外のままでよい。これにより複数のFulfillment Order（分割発送等）がある注文でも、全てのFulfillment Orderに対してRelease処理が行われる設計になる。

同様の制約はFlow①の`Hold fulfillment order`にも当てはまる可能性があるが、こちらはエラーなく設定できたとの報告だったため、`Order created`トリガー側では単体のFulfillmentOrderが直接取得できる（作成直後は1件しかない前提のため）か、あるいはすでに同様の対応がされているものと推測される（未確認）。

## Issue #71 の完了条件に対する結論（2026-10-11、実機確認完了）

ユーザーがFlow①・Flow②を手動で組み、実際の注文データで動作を確認した。

| 注文 | 決済方法 | 決済ステータス | タグ | Fulfillment Order状態 |
|---|---|---|---|---|
| #1016, #1017 | 銀行振込（`Bank Deposit`） | PENDING | `入金待ち` | `ON_HOLD`（reason: `AWAITING_PAYMENT`） |
| #1018 | KOMOJU（`KOMOJU - コンビニ決済 (Convenience Store)`） | PAID | `発送可` | `OPEN`（保留なし） |
| #1006, #1014 | 代引き（`Cash on Delivery (COD)`） | PAID/PENDING | タグなし | `OPEN`（保留なし） |

（`shopify store execute`でAdmin GraphQLから直接取得、2026-10-11）

| 完了条件 | 状態 |
|---|---|
| コンビニ決済・銀行振込の注文作成時に、自動で発送保留とタグ`入金待ち`が付与されることをDevストアで確認 | **確認できた**。#1016・#1017（銀行振込、PENDING）が`入金待ち`タグ・`AWAITING_PAYMENT`理由のHoldともに付与されている |
| 入金確定時に、発送保留が解除されタグが`入金待ち`→`発送可`に切り替わることをDevストアで確認 | **確認できた**。#1018（KOMOJU、PAID）はタグが`発送可`、Holdが解除され`OPEN`状態 |
| 代引き・クレジットカードの注文は保留がかからず最初から発送可能な状態であることを確認 | **確認できた**。#1006・#1014（代引き）はタグなし・`OPEN`状態。ただしこの2件はFlow有効化前に作成された注文のため、「Flow①の条件に一致せず除外される」ことの直接証拠というより、Flow①の条件（KOMOJU・Bank Depositの2値のみ）の設計上代引きが対象外であることによる論理的な裏付け |

**Issue #71はクローズ可能。** 残課題（代引きでの`Order paid`発火確認、分割発送時の複数FulfillmentOrderでの動作）は「今後の検討事項」に残す。

## 追加確認: 銀行振込の手動「支払い済みとしてマーク」でFlow②が発火することを実機確認（2026-10-13、Issue #46の検証中に実施）

Issue #46（未入金注文の自動キャンセル、[unpaid-order-auto-cancel.md](./unpaid-order-auto-cancel.md)）の動作確認の過程で、銀行振込のテスト注文に対して管理画面の「支払い済みとしてマーク」を実行し、Flow②が正しく発火するかを確認した。

対象: 注文#1025（銀行振込`Bank Deposit`、作成時にFlow①でHold＋`入金待ち`タグ付与済み）

`shopify store execute`でタイムライン（`events`）を取得し、以下を確認した。

```
14:16:47 sale_success: Bank Depositによって￥4,500 JPYを支払い済みとして手動でマークしました。
14:16:50 fulfillment_order_hold_released: Shopify Flowが1個のアイテムに対する自身の保留を解除しました。
14:16:50 fulfillment_order_released: フルフィルメントがリリースされました。
```

- `sale_success`に決済方法名（`Bank Deposit`）が明記されていたことから、管理画面の「支払い済みとしてマーク」ボタンは`orderCreateManualPayment`相当（`paymentMethodName`指定）の操作を呼んでいることが裏付けられた（[cod-payment.md](../research/cod-payment.md)の推測と一致）
- `displayFinancialStatus`が`PAID`に変化し、タグが`入金待ち`→`発送可`に切り替わり、`fulfillmentOrders`のstatusが`ON_HOLD`→`OPEN`になったことも確認済み

**→ 銀行振込の手動マーク操作で`Order paid`トリガーが確実に発火することを実機確認した。** 下記「今後の検討事項」にあった同種の未確認事項（代引き版）は、決済方法こそ違うが同じ仕組み（手動決済方法 + 管理画面の「支払い済みとしてマーク」）であるため、確信度が大きく上がった。ただし代引き自体では未検証のまま残す。

## 追加確認: 代引きの手動「支払い済みとしてマーク」でFlow②の条件が正しく代引きを除外することを実機確認（2026-10-13、Issue #83）

代引き相当のテスト注文（#1026、`manual`ゲートウェイでPENDING作成 → `orderCreateManualPayment(paymentMethodName: "Cash on Delivery (COD)")`で支払い済みマーク）で、Flowの「実行の詳細」画面を直接確認した。

```
開始: 2026年10月13日 10:42
ワークフロー: 入金確定で発送保留を解除
実行状況: 完了
結果: なし
フロー: Order paid（発火）→ Condition「Tags is equal to 入金待ち」→ False分岐
```

- **`Order paid`トリガーは代引きでも確実に発火する**（銀行振込と同じ）
- **Conditionが評価され、タグに`入金待ち`を含まないため False に分岐し、後続のアクション（Release fulfillment order holds / Remove order tags / Add order tags）は一切実行されなかった**（「結果: なし」がこれを裏付ける）
- 注文#1026のタグ（`org:sakura`のみ）・Hold状態（元々Holdなし）に変化がないことも`shopify store execute`で確認済み

**→ 代引きの手動マーク操作でもFlow②は正しく動作し、誤動作しないことを実機確認した。** 「今後の検討事項」にあった代引き版の未確認事項は解消。

## 追加確認: 分割発送（複数Fulfillment Order）での動作（2026-10-13、Issue #84、一部）

このDevストアの商品はすべて単一ロケーション（`Shop location`）にしか在庫がなく、自然な分割発送は発生しない。`fulfillmentOrderSplit`ミューテーションで人為的に1つのFulfillment Orderを2つに分割し、複数FO状態を作って検証した。

### 検証手順（共通）

1. 数量2の下書き注文を作成 → `draftOrderComplete(paymentPending: true)`でPENDING注文を作成（この時点ではFulfillment Orderは1件のみ）
2. `fulfillmentOrderSplit(fulfillmentOrderSplits: [{fulfillmentOrderId, fulfillmentOrderLineItems: [{id, quantity: 1}]}])`で2件に分割
   - **ハマりどころ**: この後継ミューテーションは `input:` ではなく `fulfillmentOrderSplits:`（複数形のリスト）を引数に取る。レスポンスも `fulfillmentOrderSplits { remainingFulfillmentOrder, replacementFulfillmentOrder }` という入れ子構造で、ドキュメントの古いサンプル（`originalFulfillmentOrder`等のトップレベルフィールド）をそのまま使うと `undefinedField` で失敗する
3. 分割後、2件のFulfillment OrderそれぞれにFlow①が通常行う処理（`fulfillmentOrderHold` + 注文への`入金待ち`タグ付与）を手動で再現

### 確認できたこと: Flow②のRelease（実際にFlowを通して確認、注文#1027）

`orderCreateManualPayment(paymentMethodName: "Bank Deposit")`で支払い済みにマークしたところ、タイムラインに`fulfillment_order_hold_released`・`fulfillment_order_released`が**それぞれ2回ずつ**記録され、2件のFulfillment Order双方が`OPEN`に戻ったことを確認した。タグも`入金待ち`→`発送可`に正しく切り替わった。**Flow②の`For each`ループは複数Fulfillment Orderに対して設計通り正しく動作する。**

### 確認できたこと（ただしFlow経由ではない）: Cancel orderアクション相当（`orderCancel`直叩き、注文#1028）

自動キャンセルFlowの`Cancel order`アクションを実際にFlow経由で動かす代わりに、同じパラメータ（`reason: OTHER, restock: true, notifyCustomer: true`）で`orderCancel`ミューテーションを直接実行した。結果、2件のFulfillment Order双方が`CLOSED`になり、`refund_restock`「2点のアイテムの在庫を補充しました」・`refund_created`「2点のアイテムを返金しました」と、**複数Fulfillment Orderにまたがる在庫復元・返金処理が注文単位で一括して正しく行われた**（`Cancel order`アクションは`For each`なしの単発ステップとして設計してあるが、`orderCancel`自体が内部的に全Fulfillment Orderを処理するため問題ない）。

**ただし、これはFlow経由ではなくAPI直叩きでの確認。** 実際の自動キャンセルFlowが同じ結果になるかは未検証のまま（ロジック自体は同じ`orderCancel`相当のはずで、信頼度は高い）。

### 構成を確認: Flow①のHoldは単発ステップ。複数Fulfillment Orderでの挙動は未確定のまま（2026-10-13、Issue #84、ユーザーがFlow①の設定パネルを確認）

Flow①「前払い注文の発送保留」の`Hold fulfillment order`ノードの設定パネルを実機で確認した。

```
Order: order.id
FulfillmentOrder: fulfillmentorder が見つかりません
Reason: AWAITING_PAYMENT
```

キャンバス構成は以下の通りで、`Hold fulfillment order`は`For each`ループの外にある単発ステップ。

```
Condition（Payment gateway names is equal to KOMOJU... OR Bank Deposit）
→ True
→ Hold fulfillment order（単発、For eachなし）
→ Add order tags（入金待ち）
→ Wait for 7 days
```

**確定していること**: `Hold fulfillment order`は`For each`の外にある単発ステップで、UI上の`FulfillmentOrder`欄は「見つかりません」という未解決表示になっている。一方で、単一Fulfillment Orderの通常注文（#1016・#1017・#1023・#1025・#1026、これまでの実機テストすべて）ではHoldは実際に正しくかかっている——つまり「欄の表示は未解決だが、実行時には何らかの形で解決されて動いている」状態。

**未確定のまま残ること**: 最初から複数のFulfillment Orderが存在する注文（複数ロケーション在庫等）に対して、このアクションが実行時にどう振る舞うかは今回の確認でも分からなかった。「欄が未解決」という事実から「1件目だけ拾う」「全件を暗黙に処理する」「エラーで何も起きない」のいずれが起きるかは一意に決まらない。欄が空でも単一FOでは動いている以上、Flow側が実行時に自動解決している可能性もあり、複数FO固有の挙動は実機検証なしには判断できない。

このDevストアでは全商品が単一ロケーション（`Shop location`）にしか在庫がなく、通常の注文作成で自然に分割発送が発生することは現状ない。**複数ロケーション運用を具体的に検討する段階（Issue #13の配送設定、Issue #20の本番データ投入等）になったら、改めて複数Fulfillment Orderの注文でFlow①のHoldを実機テストすることを推奨する。** 現時点で構成を変更する必要はない。

## 今後の検討事項

- クレジットカード（Shopify Payments）を導入する場合、決済ゲートウェイ名を正確に把握してFlow①の対象外に含める必要がある
- 決済方法が今後増えた場合（他のAPMアプリ追加等）、Flow①の条件に追加するメンテナンスが必要になる。決済方法の追加・変更時はこのドキュメントとFlowの条件を両方更新すること
- **複数ロケーション運用を始める場合、Flow①のHoldが複数Fulfillment Orderに対して正しく動作するかを改めて実機テストすること（Issue #84で構成は確認済みだが、実際の挙動は未確定のまま）**
- Flowの編集画面（埋め込みiframe）はブラウザ自動操作（CDP）との相性が悪く、テキスト入力やノードのクリックが安定しないことが2回の検証で分かった。今後Flowの画面操作が必要な作業は、自動化を試みるより先に人手での対応を優先する
