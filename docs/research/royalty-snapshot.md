# 注文時点の派遣元スナップショットとロイヤリティ集計

## なぜ必要か

顧客の所属派遣元は転籍・卒業によって変わりうる。したがって「顧客タグだけで派遣元を表現する」と、転籍した時点で過去の所属情報が失われる。ロイヤリティがスコープに含まれる以上、**注文には注文時点の派遣元を別途記録する必要がある**。これを確かめた。

## 手順

1. 下書き注文を作成し、実注文 `#1001` に変換（顧客: `koji.19960810+ricetest2@gmail.com`、当時の所属 `org:test-agency-b`）
2. 注文に `orderUpdate` でタグとメタフィールドを書き込む
3. 顧客の所属タグを `org:test-agency-b` から `org:agency-sakura` に変更（転籍のシミュレーション）
4. 注文を読み直す

## 結果

注文への書き込みは成功した。

```
注文タグ: ["org:test-agency-b"]
注文メタフィールド:
  rice.dispatch_org_handle = test-agency-b
  rice.dispatch_org_name   = テスト協同組合B
  rice.royalty_rate        = 0.015
```

転籍後に読み直しても注文側は変化しなかった。

```
注文 #1001
  注文タグ      : ["org:test-agency-b"]      ← 変わらない
  注文メタ      : dispatch_org_handle=test-agency-b ...  ← 変わらない
  顧客の現在タグ: ["member", "org:agency-sakura"]  ← 転籍済み
```

タグによる絞り込みと集計も機能した。

```
query: tag:'org:test-agency-b'
  #1001  700.0 JPY
合計 700.0 / ロイヤリティ1.5% = 10.5
```

## 判定: 可

**注文時点の派遣元をスナップショットとして保持でき、転籍・卒業によって過去の帰属が書き換わらない。** 派遣元別の集計もタグ検索で成立する。

本番実装では `ORDERS_CREATE` webhook（または Shopify Flow。[serverless-options.md](./serverless-options.md) 参照）で自動的に書き込むことになるが、書き込みそのものが可能であることはここで確認した。注文タグにしておくと管理画面の絞り込みとCSVエクスポートがそのまま使えるため、非エンジニアでも月次集計が回る。

## Flowによる自動化（2026-10-10、Issue #8）：実装未達。変数名の確認のみ完了

Issue #8「注文と派遣元の紐付けを実装する」として、`Order created` トリガー + `Add order tags` アクションのFlowワークフローを構築しようとした。結論から言うと、**ワークフローの構築・テスト実行・本番運用オンのいずれにも到達できなかった。** 以下、確認できたことと、詰まった場所を具体的に記録する。

### 確認できたこと: `Order created` トリガーが公開する変数名

Flowエディタの「変数を追加」ピッカー（Conditionステップの条件設定画面）で、`Order created` トリガー配下の `order` オブジェクトを `customer` → `tags` と辿って検索したところ、以下が確認できた。

```
検索: "customer tags"

tags   String[]            ← order.tags（注文自身のタグ）
  "A comma separated list of tags associated with the order.
   Updating tags overwrites any existing tags t..."

./customer/tags   String[]   ← order.customer.tags（顧客の現在のタグ）
  "A comma separated list of tags that have been added to the customer."

./purchasingEntity/Customer/tags            String[]  （B2B購入者表現、今回は無関係）
./paymentTerms/draftOrder/customer/tags     String[]  （同上）
./purchasingEntity/PurchasingCompany/contact/customer/tags  String[]  （同上）
./lineItems/contract/customer/tags          String[]  （同上）
```

変数ピッカーで選択すると、条件のIF欄には `次のうち少なくとも1つ order / customer / tags` と表示された。つまり **Liquidで使う変数パスは `order.customer.tags`**（前例の`Customer tags added`フローで使っていた、トリガーが顧客自身である場合の裸の `tags` とは異なる）。

注意点として、**注文自身にも独立した `tags` フィールドが存在し、その説明文には「更新すると既存のタグを上書きする」と明記されている。** 生の `tags` フィールドへの代入ではなく、専用の `Add order tags` アクション（追記的にタグを足す）を使うべきという判断の裏付けになった。

抽出用Liquidは、前例（`self-service-status-change.md`追補）の式の変数名を置き換えれば成立するはずである（未検証）。

```liquid
{% assign found = "" %}{% for t in order.customer.tags %}{% if t contains 'org:' %}{% assign found = t | remove: 'org:' %}{% endif %}{% endfor %}{{ found }}
```

### 詰まった場所: Flowエディタのキャンバス操作がことごとく機能しなくなった

1. テンプレート由来の下書き（`特定の商品を含む注文にタグを付ける`。2026-10-04に別セッションが作成したまま放置されていたもの）を流用し、`Order created → Condition（line items条件）→ Add order tags` という既に接続済みの構成から着手した。
2. Conditionノードを選択して中身を書き換えるところまでは順調だった（上記の変数ピッカーの確認もここで行った）。値欄の演算子（「等しい」→「含む」への変更）だけがクリックで反応せず、ネイティブ風セレクトが開かない状態だった。
3. 時間を区切るため、Conditionステップを削除する方針に切り替えた。ノードにホバーすると出るゴミ箱アイコンをクリックし、確認ダイアログの「削除」を押して削除自体は成功した。
4. **しかしCondition削除後、`Order created` トリガーと `Add order tags` アクションが未接続のまま孤立した。** トリガー直下の接続用の丸いピル（添え字のような灰色のカプセル）をクリック・ドラッグしても新しい接続は作成されず、孤立した `Add order tags` ノードはクリックしても設定パネルが開かなくなった（ホバーしてもゴミ箱アイコンすら出ない＝編集不能な状態になったと見られる）。これは本プロジェクトの既知の制約（埋め込みiframeのクリック不安定）とは別種の問題で、**「接続が外れたステップはFlowエディタ上で再接続・削除ができなくなる」という推定の仕様的制約**に見える。
5. この壊れた下書きを諦め、ワークフロー一覧から新規ワークフローを作り直そうとしたところ、**セッションの途中からFlowアプリの埋め込みiframe内のあらゆるクリック・スクロール操作が一切反応しなくなった。** ワークフロー一覧のテンプレートを見る/インポート/ワークフローを作成のボタン、行リンク、検索アイコンなど、最初は機能していた要素を含めて全て無反応になった。タブの作り直し、ページの再読み込み、ブラウザ拡張の再接続（`select_browser`）を試したが改善しなかった。Shopify管理画面のサイドバー（iframeの外側、素のReactページ）側のリンクは最後まで正常にクリックできたため、問題はこの特定のiframeセッションに限定されている。

### 未達のまま残った作業（完了条件1〜3は未検証）

- `Add order tags` アクションの Tags 欄に上記Liquidを設定する
- ワークフローをテスト実行し、トリガーの発火・アクションの出力を確認する
- ワークフローを本番運用でオンにする
- 完了条件1（スナップショット）・2（転籍後も過去注文は不変）・3（`tag_prefix:org:`検索での派遣元別集計）の実機確認

いずれも**手が付けられていない**。`docs/research/royalty-snapshot.md`冒頭の手動API確認（`orderUpdate`でのタグ書き込み）は別の検証であり、これ自体は今回のFlow自動化の進捗ではない。

### 後片付けが必要な残骸（Devストア、Flowアプリ内）

以下はいずれも**非アクティブ（下書き）のため本番挙動には影響しないが**、クリックが機能しなくなった影響で削除できないまま残っている。次回の作業者（または手動操作）で削除してほしい。

- `特定の商品を含む注文にタグを付ける` — 2026-10-04に作成されたテンプレート由来の下書き。今回の作業でCondition削除により `Add order tags` が孤立し、壊れた状態になっている
- `New Workflow` — 今回のセッション中、遅延して発火した「ワークフローを作成」のクリックにより偶発的に作成された空のワークフロー（`Order created`トリガーのみ、アクション無し）

### 判定: 条件付き（変数名は確定、実装は未完了）

**Liquidで使う変数パス `order.customer.tags` は実機のFlow変数ピッカーで確認済み。** ただし `Order created → Add order tags` ワークフローの構築・テスト・本番化は、Flowエディタの操作不能により未達に終わった。前例（`self-service-status-change.md`の`Customer tags added`フロー）は最後まで成功しているため、同じ種類のFlowが原理的に組めないわけではない。今回の失敗はエディタの状態異常（孤立ステップの再接続不可、その後のiframe全体の無反応化）によるものであり、セッションを改めて最初からやり直せば到達できる可能性が高い。

## 完了（2026-10-12、ユーザーが手動構築・Claudeが実機確認）：Issue #8達成

上記の自動操作での行き詰まりを受け、**ユーザー自身がDevストアの管理画面で手動でワークフローを構築した。** 新規ワークフロー `Order created → Add order tags` を作成し、Tags欄に以下のLiquidを設定（変数名`order.customer.tags`は上記で確認した値のまま。ただし`| remove: 'org:'`は付けない。注文に付けたいのは`org:sakura`のようなタグそのものであり、org_codeへの変換は不要なため）。

```liquid
{% assign found = "" %}{% for t in order.customer.tags %}{% if t contains 'org:' %}{% assign found = t %}{% endif %}{% endfor %}{{ found }}
```

ワークフロー名は「注文作成時に派遣元タグを注文へスナップショット」とした（既存の「顧客タグ追加時に組織名を同期」との命名統一）。手動構築は迷いなく完了しており、**自動操作で詰まっていたのはブラウザ自動操作とこのFlowエディタのiframeとの相性問題であり、Flowエディタ自体の不具合ではなかった**と見られる。

### 実機確認（Claude、Admin GraphQL APIで直接検証）

ブラウザでの確認の代わりに、`shopify store execute --allow-mutations`でAdmin GraphQL APIを直接叩き、完了条件1〜3をすべて検証した。

**完了条件1（スナップショット）**: テスト顧客`koji.19960810+ricetest6@gmail.com`（タグ`org:sakura`）で下書き注文を作成・実注文化（`#1019`）。Flow実行を待って注文を読み直すと、`tags: ["org:sakura"]`が自動で付与されていた。顧客タグと注文タグが一致することを確認。

**完了条件2（転籍後も過去注文は不変）**: 同じ顧客のタグを`tagsRemove`/`tagsAdd`で`org:sakura`→`org:test-agency-b`に変更後、新たに下書き注文→実注文化（`#1020`）。結果:

```
#1019（転籍前に作成）: tags = ["org:sakura"]        ← 変わらない
#1020（転籍後に作成）: tags = ["org:test-agency-b"]  ← 新しいタグ
```

古い注文のタグが転籍後も書き換わらないことを確認した。

**完了条件3（派遣元ごとの検索・集計）**: `tag:'org:sakura'`で検索したところ、`#1002`・`#1004`・`#1019`の3件が正しく絞り込まれた（他派遣元の注文は含まれない）。加えて`Royalty Calculator`（App Home拡張）を実際に開いて2026年10月分を集計し、既存の確認済みデータ（さくら協同組合、1件、15,000円、ロイヤリティ225円）が引き続き正しく表示されることを確認した（今回作成した`#1019`・`#1020`は未発送のため`fulfillment_status:fulfilled`条件により集計対象外になっており、これは意図通りの挙動）。

### 副次的な発見: `tag_prefix:`検索がCLI経由では機能しなかった

`aggregateOrdersByOrg`の実装（`searchQuery.js`）が使っている`tag_prefix:org:`というクエリを`shopify store execute`で単体実行したところ、**絞り込みが一切効かず全注文が返ってきた**（クォートの有無、変数渡し経由でも同様）。一方、コロンを含むタグ値をクォートした`tag:'org:sakura'`は正しく絞り込めた。

ただしこれは実害がない。`aggregate.js`の`extractOrgCode`/`aggregateOrdersByOrg`が、`org:`タグを持たない注文をクライアント側で確実に除外する安全網になっているため、たとえサーバー側の`tag_prefix:`検索が絞り込みとして機能していなくても、画面に表示される集計結果自体は正しい（実際に`Royalty Calculator`で正しい結果が出ることを確認済み）。**ただし`tag_prefix:`が本当にサーバー側で絞り込みをしていない場合、派遣元に関係ない注文も含めて毎回全件フェッチしていることになり、注文数が増えた際のパフォーマンス・ページネーションに影響しうる。** 原因（CLI固有の問題か、Admin GraphQLの`tag_prefix`構文自体の挙動か）は未調査。実害が出るほどの注文数になった際に再調査する価値がある。

### 判定: 可（完了条件1〜3すべて実機確認済み）

**Issue #8は達成。** 注文作成時に顧客の現在の`org:`タグが注文へ自動でコピーされ、転籍後も過去注文のタグは変わらず、派遣元ごとの検索・集計（`tag:'org:<code>'`、および既存の`Royalty Calculator`画面）が機能することを確認した。ワークフローはDevストアで有効化済み。本番ストアでも同じ手順（`Order created`→`Add order tags`、上記Liquid）で再現する。
