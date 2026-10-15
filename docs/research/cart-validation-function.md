# Cart and Checkout Validation Function（購入ゲート）

## 概要

Shopify Functions の Cart and Checkout Validation Function API は、チェックアウトに進む前にサーバーサイドで条件を評価し、条件を満たさないカートを止める仕組み。Shop Pay、PayPal、Google Pay、Apple Pay などのエクスプレス決済も対象に含まれる。

出典: https://shopify.dev/docs/api/functions/2026-07/cart-and-checkout-validation

確認できた事実:

- 1ストアあたり最大25個のバリデーション関数を有効化できる
- ドキュメント上、プランによる制限の記述は見当たらない（Plus限定とは書かれていない）
- ユースケースとして「トークンゲーティング」が明示されている
- Functions の入力オブジェクトには `cart.buyerIdentity.customer.hasAnyTag(tags: "...")` が存在し、**顧客タグを参照できる**

出典（入力オブジェクトの例）: https://shopify.dev/docs/api/functions/2026-07/cart-transform

これが意味すること: App Proxy 上の自作登録フォームで顧客に `org:A` のようなタグを付けておき、バリデーション関数で「所定のタグを持たない顧客のチェックアウトを拒否する」とすれば、限定販売と卒業判定の両方を購入時点で強制できる。卒業処理はタグの付け替えだけで済む。

これはコードを書いてデプロイする作業であり、「納品先にエンジニアが一人もいない」という前提を救うものではない点に注意（[serverless-options.md](./serverless-options.md) 参照）。

## 実証: 購入ゲートの動作確認

### 構成

| 項目 | 値 |
|---|---|
| アプリ | `rice-market-app`（`client_id: b0dd961ec019c49075a18880a42eb320`） |
| Extension | `extensions/org-tag-gate`（`cart.validations.generate.run`） |
| チェックアウトルール | `member tag gate` / 有効 |

### 実装

入力クエリで顧客タグを読む。

```graphql
query CartValidationsGenerateRunInput {
  cart {
    buyerIdentity {
      customer {
        isMember: hasAnyTag(tags: ["member"])
      }
    }
  }
}
```

`member` タグを持たない場合（未ログインを含む）にエラーを返す。

### 結果: 止まった

ログインしていない状態でカート追加を試みたところ、HTTP 422 と関数が定義したメッセージが返った。

```json
{
  "status": 422,
  "message": "このストアは登録された技能実習生のみ購入できます。派遣元から配布された登録URLをご確認ください。"
}
```

チェックアウト画面に進む前、カート追加の時点で止まっている。

### 確認できたこと

- **Basic相当の開発ストアで Validation Function が動作する。** チェックアウトルールの選択肢に表示され、有効化でき、実際にブロックが効いた
- 顧客タグを条件に使える
- エラーメッセージを日本語で自由に定義できる

### 双方向の実証（関数の実行ログ）

`shopify app logs` で実際の関数実行を記録した。

| 時刻 | buyerIdentity | ブロック |
|---|---|---|
| 11:01:39 | `null` | した |
| 11:01:42 | `null` | した |
| 11:02:35 | `{customer: {isMember: true}}` | しなかった |
| 11:03:02 | `{customer: {isMember: true}}` | しなかった |
| 11:03:04 | `{customer: {isMember: true}}` | しなかった |
| 11:03:10 | `null` | した |

**ゲートは意図どおり両方向で動作している。** `member` タグを持つ顧客はカート追加もチェックアウトも通り、タグを持たない・未ログインの場合は止まる。素通りした実行は1件もない。

## 発見した問題: Buy Now（動的チェックアウトボタン）で buyerIdentity が失われる

ログイン済みの会員であっても、商品ページの **Buy Now ボタンを押した経路では `buyerIdentity` が `null` になる**。その結果、正規の会員が購入を拒否される（上表 11:03:10 の実行がこれに該当。直前 11:03:02/11:03:04 では同じ顧客が `isMember: true` として認識されているため、顧客側の問題ではなく経路の問題）。

安全側に倒れる誤判定（買えるべき人が買えない）であり、買えない人が買えてしまう漏れではない。ただし正規ユーザーの購入を妨げるため、実装時には対処が必要。

### 対処: 動的チェックアウトボタンの非表示（実証済み・有効）

テーマのソース `snippets/buy-buttons.liquid` を確認したところ、次の構造がある。

```liquid
assign show_dynamic_checkout = false
if block.settings.show_dynamic_checkout and gift_card_recipient_feature_active == false
  assign show_dynamic_checkout = true
...
{%- if show_dynamic_checkout -%}
  {{ form | payment_button }}
```

`show_dynamic_checkout` は商品セクションの buy_buttons ブロックのチェックボックス設定であり、`templates/product.json` に保持される。これを `false` にしてテーマに反映したところ、商品ページから **Buy it now ボタンが消えた**（Add to cart のみ残る）。これにより `buyerIdentity` が `null` になる経路が塞がれ、正規会員が誤ってブロックされる問題は解消できる。**テーマエディタのチェックボックス1つで対応可能。** 本番テーマでもこの設定を維持すること。

## 再実証（2026-09-22、Issue #7・構成Bへの移行とアプリ再インストール後）

上記の実証はApp Proxy方式（構成A）時代のもので、その後 構成B への移行に伴うアプリの一時アンインストール・再インストール（`docs/shopify-verification-log.md` 参照）を経ている。チェックアウトルールやテーマの設定がstore側の状態として残っているか、再インストールを経ても壊れていないかを再確認する必要があった。

### 確認内容

1. **チェックアウトルールの生存確認**: 管理画面 設定 > チェックアウト > チェックアウトルール に `member tag gate`（`rice-market-app` 提供）が引き続き表示され、**有効** の状態だった。アプリの再インストールを経ても消えていない
2. **テーマの動的チェックアウトボタン非表示の生存確認**: `themes/storefront`（Dawn ベース、`preview_theme_id=160721141846`）の商品ページ（The Complete Snowboard）で、Add to cart のみが表示され Buy it now は出ない。テーマを丸ごと import し直した後も設定が維持されている
3. **ブロック方向**: ログアウト状態でカート追加 → 「このストアは登録された技能実習生のみ購入できます。派遣元から配布された登録URLをご確認ください。」が表示され、カートに追加されなかった
4. **許可方向**: `member`・`org:test-agency-a` タグを持つ既存の検証用顧客（`koji.19960810+ricetest@gmail.com`）としてサインイン（新 customer accounts のメール認証コード方式）し、同じ商品をカートに追加 → エラーなく追加できた
5. **卒業・転籍操作（タグの付け替え）だけで購入可否が切り替わることの実証**: 同一ログインセッションを維持したまま、Admin APIで顧客の `member` タグだけを外す（`org:test-agency-a` は残す）→ 再ログインなしで同じ商品ページに行くと即座にブロックされた。続けて `member` タグを戻す → 再ログインなしで即座に追加できるようになった。**ログインし直さなくてもタグの付け替えだけで購入可否が切り替わることを確認した。** これはCart Validation Functionが顧客タグをリクエストごとに読んでおり、セッション側でキャッシュしていないことの直接証拠でもある

### 結論

構成Bへの移行・アプリ再インストールを経ても、購入ゲート（チェックアウトルール有効化・動的チェックアウトボタン非表示）は壊れていない。Issue #7 の3つの完了条件（未登録者のブロック／タグ付け替えだけでの切り替え／動的チェックアウトボタン経由での誤ブロック防止）を、いずれもこの再実証で満たした。

## 発見した問題: ストアフロントのログイン受け渡しがブロックされる（2026-10-15）

**未ログインの訪問者がストアフロントからログインしようとすると、この関数のエラーで止まり、ログインを完了できない。** 購入どころかログインができないため、影響は購入ゲートの範囲を超える。

### 症状

ログイン導線をたどると、ストアフロントではなくShopifyのエラーページ（「Something went wrong.」）に着地し、本文にこの関数が返すメッセージがそのまま表示される。

```
What happened?
Cart Error: This store is only available to registered members.
Please check the registration URL provided by your dispatch organization.
```

エラーページの表示は実機で複数回確認している。ユーザーの報告では、このときブラウザのコンソールに 422 (Unprocessable Content) が出ていた（コンソール自体はこちらでは確認していない）。

### 切り分け

ゲート実装（[storefront-login-gate.md](./storefront-login-gate.md)）の検証中に発見したが、**ゲートが原因ではない。** 次の4通りを比較した。

| テーマ | 導線 | 着地URL | 結果 |
|---|---|---|---|
| プレビュー（ゲート有り） | ゲートの「ログインする」 | `/customer_authentication/redirect?locale=ja&region_country=JP` | Cart Error |
| ライブ（ゲート無し） | ヘッダーのアカウントアイコン →「◯◯として続行」（Shopの自動ログイン） | `/customer_authentication/login?sso=silent&return_to=/collections/all` | Cart Error |
| ライブ（ゲート無し） | ヘッダーのアカウントアイコン →「その他のログイン方法」→ メール + 確認コード | — | Cart Error（422） |
| どちらでも | ブラウザのアドレスバーに `/account/login` を直接入力 | `shopify.com/<shop_id>/account` | エラーは出ないが、**ストアフロント側のセッションは張られない**（Liquidの `customer` は空のまま）。ただしこれは**回避策ではない**。このとき既に`shopify.com`側のセッションが存在していたためアカウント画面へ直行しただけで、受け渡しホップ自体を通っていない。セッションを持たない訪問者が同じURLを開けば認証後に同じホップへ進む |

最後の行が重要で、`shopify.com` のアカウント画面にはログイン済みとして入れるのに、ストアフロント側はログアウト扱いのままになる。ストアフロントのセッションを張るのは `/customer_authentication/...` の受け渡しホップであり、そこが上記のエラーで中断されるため、ログイン状態がストアフロントに反映されない。

**原因の確定**: 管理画面 設定 > チェックアウト > チェックアウトルール で `member tag gate` を**一時的に無効化したところ、同じ導線でログインが通った**（通過後、ストアフロントの `customer` も設定され、ゲートが外れることを確認）。確認後はルールを有効に戻した。無効化で解消することから、この関数が原因と確定している。

### 推定メカニズム（未実証）

**「Buy Nowボタンで `buyerIdentity` が `null` になる」問題と同じ系統と考えられる。** ログインの受け渡しホップでもカート検証が評価され、その時点ではまだ顧客がカートに紐づいていないため `isMember` が偽になり、エラーが返っていると推測する。

ただし**この推測は実証できていない。** 関数の実行ログ（`shopify app logs`）を取ろうとしたが、リポジトリ内のApp Home UI Extensionの型参照エラー（`admin.app.home.render` が見つからない。`@shopify/ui-extensions` のバージョン不整合）でコマンドが起動せず、実際の入力JSONを確認できなかった。確定させるにはこのツールチェーンの問題を先に解消する必要がある。

なお2026-09-22の再実証では、同じメール認証コード方式でサインインできた記録がある（上述）。**いつからこの状態になったのかは特定できていない。**

### 対処案（未実証）

関数がエラーを返す条件に「カートに商品が入っていること」を加える案がある。入力クエリに `cart.lines` を追加し、`lines` が空のときはエラーを返さない形にする。

- ログインの受け渡しホップで渡るカートは空のはずなので、ログインは通るようになる
- 未ログインでのカート追加は、追加後のカートに商品が入るため引き続きブロックされる（購入ゲートとしての機能は維持される）

**ただしこれは机上の案であり、実機で確認していない。** 「未ログインではカートに商品を入れられないのだから、未ログインのカートは常に空である」という前提に立っているが、その前提自体を検証していない。また関数の変更には `shopify app deploy` が必要で、このリポジトリにはデプロイ事故の記録がある（`.claude/skills/shopify-dev-verification/SKILL.md` 参照）ため、実施前にローカルツリーの拡張機能一覧とDev Dashboardのアクティブバージョンを突き合わせること。
