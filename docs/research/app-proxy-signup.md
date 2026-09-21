# App Proxy による派遣元別登録URL

## App Proxy の URL 制約

`prefix` に指定できる値は `a` / `apps` / `community` / `tools` の4つに限定される。
出典: https://shopify.dev/docs/apps/build/cli-for-apps/app-configuration

したがって要件にある `https://rice-market.com/signup/xxx` という形をアプリで直接受けることはできず、`/a/signup/xxx` または `/apps/signup/xxx` になる。

## 実証: 派遣元別登録URLの実装

### 構成の変更

App Proxy にはサーバーが必要だが、当初のアプリは extension-only テンプレート（サーバー無し）だった。そこでプロジェクトを reactRouter テンプレートに差し替えた。同じ `client_id` に紐付けたのでアプリは増えていない。Validation Function は `uid` を保持したまま `extensions/org-tag-gate` をコピーしたため、更新扱いで生き残った。

### 設定

```toml
[app_proxy]
url = "/proxy"
prefix = "a"
subpath = "signup"

[metaobjects.app.dispatch_org]   # 派遣元マスタ
  org_name       単一行テキスト（必須）
  signup_token   単一行テキスト（必須）
  active         真偽値
```

スコープに `read_customers, write_customers, read_metaobjects, write_metaobjects, write_app_proxy` を追加。

管理画面に登録されたプロキシURL: `https://rice-market-dev.myshopify.com/a/signup`

### ルート

| ファイル | URL | 挙動 |
|---|---|---|
| `app/routes/proxy._index.tsx` | `/a/signup` | 拒否 |
| `app/routes/proxy.$token.tsx` | `/a/signup/:token` | トークンから派遣元を引いてフォーム表示、POST で `customerCreate` |

いずれも `authenticate.public.appProxy(request)` を通す。App Proxy へのリクエストは HMAC 署名付きであり、検証を自前で書くと未検証の顧客作成エンドポイントをインターネットに晒すことになるため、テンプレート同梱のヘルパーを使う。派遣元の特定はサーバー側でトークンから引き直しており、フォームの送信値は信用しない。

### 動作確認できたところ

派遣元マスタに1件登録した（`agency-sakura` / さくら協同組合 / token: `7f3a9c2e5b81`）。

| URL | 結果 |
|---|---|
| `/a/signup/7f3a9c2e5b81` | 「会員登録 / 派遣元: さくら協同組合」フォーム表示 |
| `/a/signup` | 「登録には派遣元から配布されたURLが必要です。」 |
| `/a/signup/deadbeef0000` | 「この登録URLは無効です。」 |

**要件どおりの挙動でルーティングとトークン解決が成立している。**

## 止まったところ: 保護された顧客データの承認が必要

フォームを送信すると500になり、サーバーログに次が出た。

```
GraphqlQueryError: This app is not approved to access the Customer object.
See https://shopify.dev/docs/apps/launch/protected-customer-data
```

`customerCreate` を含む顧客データへのアクセスには、Partner Dashboard での **Protected customer data access** の設定が必要。
出典: https://shopify.dev/docs/apps/launch/protected-customer-data

ドキュメントの要点:

| レベル | 内容 | Public app | Custom app | Admin created custom app |
|---|---|---|---|---|
| 1 | 氏名・住所・電話・メール以外の顧客データ | 審査が必要 | **常に利用可** | 常に利用可 |
| 2 | 氏名・住所・電話・メールを含む | 審査が必要 | **常に利用可** | プランによる |

> To access customer data in development, select the data and fields you're using in the Partner Dashboard. You don't need to submit a request for review for apps that are installed only on development stores.

> Before you can request access to protected customer data, including on development stores, you need to select a distribution method for your app.

つまり、開発ストアだけで使う分には審査は不要（Partner Dashboard でデータとフィールドを選択するだけ）。ただしその前に**配信方法（distribution）の選択が必須**。本番で1店舗に入れる形（custom app）なら、レベル1・2ともに「常に利用可」であり App Store の審査は不要。

## 配信方法をカスタム配布に設定した（不可逆）

Partner Dashboard の 配布 から「カスタム配布」を選択した。確認ダイアログに「**この操作を元に戻すことはできません**」と明記されており、**配信方法の選択は不可逆**である。本番用のアプリを作る際は、最初からカスタム配布を選ぶこと。

選択後、API アクセス要求のページから「保護された顧客データへのアクセス」のセクション自体が**消滅した**。カスタムアプリではレベル1・2とも常時利用可という仕様と一致する。申請も審査も発生しなかった。

client transfer store とカスタムアプリのインストールタイミングの関係は [client-transfer-store.md](./client-transfer-store.md) を参照。

## 登録フォームからの顧客作成が通った

同じフォームに再度送信したところ成功した。

```
POST /a/signup/7f3a9c2e5b81
  name=Hanako Verify
  email=koji.19960810+ricetest4@gmail.com

200 登録が完了しました
   派遣元: さくら協同組合
   付与されたタグ: member, org:agency-sakura
```

付与された `org:agency-sakura` はメタオブジェクトの handle と一致している。フォームの送信値ではなく、**URLのトークンからサーバー側で引いた派遣元**が記録されていることの確認になる。重複メールには `Email has already been taken` が返り、二重登録も防がれている。

メタオブジェクトを管理画面から追加した場合のハンドル問題（可読性）は [metaobjects.md](./metaobjects.md) を参照。

## 結論

**派遣元ごとの登録URLから会員登録し、派遣元タグを付与するまでの一連の流れが実機で成立した。** これに [Cart Validation Function](./cart-validation-function.md) を組み合わせることで、要件の中核は Shopify 上で実現できる。

本番構築時に必要な手順:

1. アプリは**カスタム配布**で作る（不可逆な選択。公開配布を選ぶと顧客データに審査が必要になる）
2. `[app_proxy]` の `prefix`/`subpath` は**既存インストールには反映されない**。設定してから初回インストールするか、管理画面の App Proxy URL から変更する
3. 保護された顧客データはカスタムアプリなら申請不要
