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
