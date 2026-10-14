# ストアフロントの閲覧をログイン必須にする

## 背景

このストアは登録者限定販売である。購入はCart Validation Function（[cart-validation-function.md](./cart-validation-function.md)）でゲートしているが、**閲覧については何のゲートも掛かっていなかった。**

2026-10-14に実機で確認した、対策前の状態（ストアフロントパスワードのみ突破、顧客ログインなし）:

| URL | 結果 |
|---|---|
| `/` | 200 |
| `/collections/all` | 200。商品3件（コシヒカリ 5kg / 10kg / 30kg）が表示される |
| `/pages/contact` | 200 |

テーマ側にもログイン判定の実装は無かった（`layout/`・`sections/`・`snippets/` を検索して該当なし）。

Devストアはストアフロントパスワードが外側の壁になっているため外部から到達できないが、**本番でパスワードを外せば誰でも閲覧できる状態**だった。

### 対策前に判明していた副作用

お問い合わせフォームは名前・メールアドレスを `customer.name` / `customer.email` から自動設定する実装で、未ログイン時のフォールバックが無い（[contact-form.md](./contact-form.md)）。閲覧ゲートが無いため、**未ログインの訪問者が送信すると差出人不明のメールが届いて返信できない**状態になっていた。本対策でお問い合わせページもゲートの内側に入れたため、この問題は解消した（フォーム自体は変更していない）。

## Shopifyにネイティブ機能は無い

公式ドキュメントを検索したが、「ストアフロントの閲覧にログインを必須にする」という設定・機能は存在しない。検索でヒットするのは Customer Account UI Extension の [Require Login API](https://shopify.dev/docs/api/customer-account-ui-extensions/2026-01/target-apis/account-apis/require-login-api)（`requireLogin()`）だが、これは顧客アカウントの注文状況ページのコンテンツをゲートするAPIであり、ストアフロントの閲覧制御とは別物。

**ドキュメント検索では「無い」ことの明示的な記述は得られていない**（機能が存在しないことを宣言するドキュメントは通常存在しないため）。ネイティブ設定が無いという判断は、管理画面とドキュメントの双方に該当項目が見つからなかったことによる。

したがってテーマ側で実装する。管理者側でサーバーを運用しない方針（`AGENTS.md`）にも合致する。

## 実装

`layout/theme.liquid` の1箇所で判定し、未ログインなら `snippets/login-gate.liquid` だけを描画する。ヘッダー・フッター・カートドロワー・`content_for_layout` はいずれも描画しない。

```liquid
assign gate_locked = false
unless customer
  assign gate_locked = true
  if request.path contains '/policies/'
    assign gate_locked = false
  endif
  if page.template_suffix contains 'signup'
    assign gate_locked = false
  endif
endunless
```

**LiquidはShopifyのサーバー側で実行されるため、ゲート時はHTMLそのものに商品情報が入らない。** ページのソースを見ても漏れない（JavaScriptで隠すだけの実装とは違う）。

関連ファイル:

- `themes/storefront/layout/theme.liquid` — 判定と分岐
- `themes/storefront/snippets/login-gate.liquid` — 未ログイン時に見せる画面
- `themes/storefront/assets/component-login-gate.css` — その画面のスタイル
- `themes/storefront/locales/{ja,en.default,vi,zh-CN}.json` — `general.login_gate.*` の文言（4言語）

### 例外は2つだけ

1. **派遣元ごとの会員登録ページ** — ここから登録してもらうので、未ログインで開けなければ意味がない
2. **ポリシーページ**（`/policies/*`） — 利用規約・特定商取引法に基づく表記など、登録前に読めなければならない

ポリシーの判定に `request.path contains '/policies/'` を使っているのは、`template.name` が空文字になるページを一括で通すと、Shopifyがテーマレイアウト経由で描画する未知のページまで公開されてしまうため。パスで明示的に限定している。

### なぜ `page.template_suffix` で判定するのか

登録ページの判定に `template.suffix` ではなく `page.template_suffix` を使っている。実機でプローブして確認した値:

| ページ | `template.name` | `template.suffix` | `page.template_suffix` |
|---|---|---|---|
| トップ | `index` | （空） | （空） |
| 商品一覧 | `collection` | （空） | （空） |
| お問い合わせ | `page` | `contact` | `contact` |
| さくら協同組合 会員登録 | `page` | **（空）** | **`Forms - sakura-signup`** |
| himawari-signup | `page` | `Forms - himawari-signup` | `Forms - himawari-signup` |
| ポリシー | （空） | （空） | （空） |

さくらの登録ページは、割り当て先のテンプレートファイルが存在せず既定の `page.json` にフォールバックしている（経緯は [signup-url-handle.md](./signup-url-handle.md) の「補足（2026-10-14）」節）。そのため **`template.suffix` は空になるが、`page.template_suffix` はページに割り当てられた値を返す。**

`page.template_suffix` を使えば、テンプレートの配線が壊れているページでも正しく判定できる。結果として、signup-url-handle.md に記録した「テンプレートの配線を正す作業」はこのゲートの前提条件にはならない。

## 塞げない範囲（重要）

**このゲートが塞ぐのは、テーマが描画するページだけ。** テーマを経由しないエンドポイントは対象外で、未ログインでも商品データが取得できる。実機で確認済み:

```
$ curl .../collections/all/products.json   # 未ログイン
200
{"products":[{"id":10315179622486,"title":"コシヒカリ 10kg",
 "body_html":"<p>特定の会員様限定でお届けするお米です。...
```

同様に塞げないもの:

- `/products/<handle>.js`、`/products/<handle>.json`
- `/search/suggest.json`
- `/sitemap.xml` 配下（商品・コレクションのURLが載る）
- Storefront API

**したがって「ログインしないとページが見えない」は実現できるが、「商品情報が一切漏れない」は実現できない。** 商品名・説明・価格の秘匿が要件になる場合、Shopifyの標準構成（かつサーバーを運用しない前提）では達成できない。

この対策の目的は「未登録者にストアの中身や購入導線を見せないUX」であり、商品情報の機密化ではない。

## 検証結果

検証用の未公開テーマ（`login-gate-probe` #166380896342）にpushし、未ログイン（ストアフロントパスワードのみ突破）で全17パターンを確認した。すべて期待通り。

| 期待 | パス | 結果 |
|---|---|---|
| ゲート | `/` | ゲート表示、商品リンク0件 |
| ゲート | `/collections/all` | ゲート表示、商品リンク0件 |
| ゲート | `/pages/contact` | ゲート表示、問い合わせフォームなし |
| ゲート | `/products/コシヒカリ-5kg` | ゲート表示、価格表示なし |
| ゲート | `/cart` | ゲート表示 |
| ゲート | `/search?q=rice` | ゲート表示 |
| ゲート | `/blogs/news` | ゲート表示 |
| ゲート | 存在しないURL（404） | ゲート表示（HTTP 404） |
| ゲート | `/en/`・`/vi/`・`/zh/` | ゲート表示（各言語の文言で描画） |
| 公開 | `/pages/signup-76953dbc2dbb`（さくら） | 登録フォーム表示 |
| 公開 | `/pages/himawari-7f3a9c2e5b81` | 登録フォーム表示 |
| 公開 | `/policies/terms-of-service` | 表示 |
| 公開 | `/policies/privacy-policy` | 表示 |
| 公開 | `/{en,vi,zh}/pages/signup-76953dbc2dbb` | 登録フォーム表示 |

4言語すべてでゲート画面の文言が正しく切り替わることも確認した（日本語「ログインが必要です」、英語「Sign-in required」、ベトナム語「Cần đăng nhập」、中国語「需要登录」）。

### 未検証

- **ログイン済みの顧客が従来どおり閲覧できること。** 検証は`curl`で行っており、ログイン済みセッションを作れていない（新customer accountsはメールのワンタイムコード認証のため、スクリプトからログインできない）。`customer` が存在する場合は `gate_locked = false` になるだけの単純な分岐だが、実ブラウザでのログイン後の確認が必要
- ゲート画面の見た目（レイアウト・4言語での表示崩れ）の目視確認

## 運用上の注意

**新しく派遣元の会員登録ページを作るときは、テンプレート割り当ての名前に `signup` を含めること。** 判定が `page.template_suffix contains 'signup'` なので、含まれていないと登録ページがゲートされ、登録してもらえなくなる。

この条件は、既存2ページの命名（`Forms - sakura-signup` / `Forms - himawari-signup`）に合わせている。あわせて `seo.hidden` メタフィールドの設定も必要（[signup-url-handle.md](./signup-url-handle.md)）。**派遣元ページの追加手順は本番構築手順書にチェックリストとして残すべき**で、現状そのドキュメントは存在しない。
