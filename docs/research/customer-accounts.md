# Customer Accounts（顧客アカウント）の仕様

## legacy（classic）customer accounts は廃止済み

2026年2月26日付で非推奨となり、新規ストアでは利用できない。
出典: https://shopify.dev/changelog/legacy-customer-accounts-are-deprecated

この結果、従来の定番手法だった「Liquid の `/account/register` にカスタム登録フォームを置き、hidden field で `customer[tags]` に派遣元を埋め込む」は使えない。

## 現行 customer accounts の登録時カスタムフィールド

公式ロードマップ上、「Collect customer fields after sign-in」は2026年Q4予定であり、まだリリースされていない。
出典: https://shopify.dev/docs/apps/build/customer-accounts

## セルフサービスのサインインだけでは購入者を限定できない（実証済み）

### 目的

未登録のメールアドレスを持つ第三者が、派遣元ごとの登録URLを経由せずに購入まで到達できてしまうかどうかを確かめた。ここが通ってしまうと、組織別登録URLは実質的に意味を持たなくなる。

### 手順と結果

設定 > チェックアウト から「チェックアウト前に、お客様のアカウントへのログインを必須にする」を有効化した。

```json
{
  "customerAccounts": "REQUIRED",
  "customerAccountsV2": {
    "customerAccountsVersion": "NEW_CUSTOMER_ACCOUNTS",
    "loginRequiredAtCheckout": true
  }
}
```

- 設定 > お客様アカウント > 認証 の画面には、サインイン方法の選択（Shop / Google / Facebook）のみがあり、「誰がアカウントを作成できるか」を制限する設定は存在しない
- `loginRequiredAtCheckout: true` の状態でサインイン導線をたどると `shopify.com/authentication/.../login` に遷移し、見出しは "Sign in or create an account"。招待コードや事前登録の確認を求める要素はない
- 受信可能なメールアドレスで実際に最後まで通したところ、事前の招待や承認なしに顧客レコードが自動生成され、チェックアウトまで到達した

```json
{
  "id": "gid://shopify/Customer/9911995367510",
  "email": "koji.19960810+ricetest@gmail.com",
  "state": "DISABLED",
  "tags": [],
  "verifiedEmail": true
}
```

`tags` は空、つまり派遣元との紐付けは何もない状態でチェックアウトに進めた。

### 結論

**`loginRequiredAtCheckout: true` は「限られたユーザーしか買えない」の実現手段にならない。** ログインを必須にしても、そのログイン自体が誰にでも開かれているため、ゲートとして機能しない。Shopify の現行 customer accounts はセルフサービス前提の設計であり、管理画面にアカウント作成を制限する設定は用意されていない。

ただし「Shopify では限定販売ができない」という意味ではない。購入の可否はチェックアウト側の [Cart and Checkout Validation Function](./cart-validation-function.md) で止められる。

## 事前作成した顧客レコードと初回サインインの結合（実証済み）

### なぜ確認が必要だったか

実際の運用では、派遣元ごとの登録フォームで先に顧客レコードを作り、タグを付け、その後で本人が初めてサインインする。この順序が通らなければ、App Proxy の登録フォームを実装しても設計ごと成立しない。特に懸念したのは、初回サインインが既存レコードと結びつかず**別の顧客レコードが重複して生成される**ケースである。

### 手順

1. Admin API の `customerCreate` で顧客を作成し、`member` と `org:test-agency-b` を付与（顧客数 4 → 5）
2. 本人がそのアドレスで**初めて**サインイン
3. 商品をカートに追加

### 結果: 結合する。重複しない

- 顧客数は**5のまま**。重複レコードは生成されなかった
- ID も `createdAt` も Admin API で作成した時点のものが維持された
- `verifiedEmail` が `true` になり、初回サインインが既存レコードに吸収されたことが分かる
- タグも維持され、Validation Function から `isMember: true` として見えた

**「登録フォームで顧客を作成 → タグ付与 → 本人が初回サインイン → 購入可能」という一連の流れが成立する。**

## Shopify Forms 経由で作成した顧客の結合（未実証・推論）

サーバーレス構成（[serverless-options.md](./serverless-options.md) の構成B/C）で Shopify Forms を登録フォームとして使う場合、Forms 経由で作成した顧客が初回サインインと正しく結合するかが前提になる。

フォーム編集画面には「フォームを送信すると、お客様が作成されます。」と明記されており、マーケティング購読者だけでなく顧客レコードが作られることは確認した。しかし **Forms 経由の作成から初回サインインまでを通した実機検証は未実施**である。

### 試みたこと（未検証で終わった経緯）

1. Forms アプリのインラインフォーム編集画面で「ランディングページを作成」ボタンを複数回クリックしたが、`/pages` を確認しても新規ページは作成されなかった
2. 「テーマエディタに移動する」ボタンをクリックすると画面全体が操作不能なオーバーレイで固まり、リロードでのみ復帰した
3. プレビューパネルに直接入力・送信を試行したが、顧客数（`customersCount`）は変化せず、見た目だけのモックプレビューだった

Forms アプリの編集画面はクロスオリジンiframeで描画されており、アクセシビリティツリー（`find` / `get_page_text`）から内部要素が見えないため座標クリックに頼らざるを得ず、これが繰り返し不安定だった。**Shopify のプラットフォーム仕様ではなく、開発ストアのブラウザ埋め込みUIが不安定だったことが原因**であり、機能自体が使えないという意味ではない。

### 未検証のまま採用する結論

**リスクは低いと判断し、「成立する」とみなして先に進む。** 根拠:

- Forms は公式アプリで、内部的には標準の Customer オブジェクト作成 API（`customerCreate` 相当）を呼んでいると考えられる
- 既に実証済みなのは「Admin API で作成した顧客が初回サインインと正しく結合する」こと（上記参照）
- サインイン時の結合ロジックは、Customer レコードがどの経路で作られたかを見ておらず、**メールアドレスが一致する既存レコードがあるか**だけで判定していると考えられる。したがって作成経路が Admin API 直叩きか Forms かは、結合可否に影響しないはずである

ただしこれは仕組みからの推論であり、実機での確認ではない。**本番構築時に、実際に Forms 経由で顧客を1件作成し、初回サインインまで通しておくことを強く推奨する。** もし結合しない事象が見つかった場合は、実証済みの App Proxy 方式（構成A）に切り替える。
