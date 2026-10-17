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

## リダイレクト方式を採らない理由（2026-10-17 決定）

一般的なWebサービスのように「未ログインならサインインページへリダイレクトする」方式は採用しない。**その場でゲート画面を描画する現在の方式を維持する。**

### Shopifyの制約

**テーマ（Liquid）からはHTTPリダイレクトを返せない。** Shopifyがリクエストを受けてステータスコードとヘッダを決め、テーマは本文のHTMLを作るだけで、その層に介入できない。Liquidのタグ一覧にリダイレクトやステータスコードを指定するものは無い（「無い」と明記した文書は見つかっていないため、これはリファレンスに該当タグが見当たらないことによる判断）。

したがってリダイレクト方式は、実際にはJavaScriptでの遷移になる。戻り先の指定方法は公式に記載がある（[Customer sign-in links and redirects](https://shopify.dev/docs/storefronts/themes/sign-in)）。

```js
location.replace('/customer_authentication/login?return_to=' +
  encodeURIComponent(location.pathname + location.search));
```

`/customer_authentication/login?return_to=<相対URL>` は公式に記載のある経路（`return_to` は相対URLのみ対応）。

### 判断

**普通のWebサービスではリダイレクトそのものが防御になるが、Shopifyのテーマではならない。** JavaScriptが動かなければ素通りするため、サーバー側（Liquid）でコンテンツを出さない分岐は結局必要になる。つまりリダイレクトを入れる場合は「ゲート＋その上にJSリダイレクト」の二重構成になり、ゲートは消せない。

そのうえで、二重構成にはしない。理由は次の3点。

1. **未登録者に登録方法を案内できなくなる。** 現在のゲート画面は「新しくご登録される方は、派遣元から案内された登録用のURLをお使いください」を4言語で表示している。Shopifyの認証画面（`shopify.com/authentication/...`）はShopify側のホストで、この案内を出せない。利用者が技能実習生で、URLだけ知った未登録者が到達する場面が想定される以上、この案内の価値が大きい
2. **ログイン受け渡しの障害が全ページに波及する。** 受け渡しホップは実際に一度壊れている（[cart-validation-function.md](./cart-validation-function.md)の「ストアフロントのログイン受け渡しがブロックされる」節、Issue #97）。ゲート方式ならそのとき「ゲート画面は出るがログインボタンの先が動かない」で済むが、自動リダイレクトだと全ページが即エラーページになる
3. **戻るボタンが効かなくなる。** 認証画面から戻る → ゲート → 即リダイレクト、のループになる。`location.replace` で履歴を残さなければ緩和できるが完全には消えない

なお、サーバー側リダイレクトを本当に実現するならストアフロントをHydrogenで作り直す必要があるが、テーマを捨てた全面作り直しであり、保守を続けない前提と合わないため検討していない。

### ログイン後の着地先（Issue #103）

リダイレクト方式を採らないことと、ログイン後にどこへ戻るかは別の話。ゲートの「ログインする」は `routes.storefront_login_url` を使う。

| ルート | サインイン後の着地先 |
|---|---|
| `routes.account_login_url` | アカウントの注文一覧ページ |
| `routes.storefront_login_url` | サインイン前にいたストアフロントのページ |

ゲートは「見ようとしたページを見せない」仕組みなので、ログイン後はそのページに戻るのが期待動作になる。当初の実装は `account_login_url` を使っており、商品ページでゲートに当たった顧客も注文一覧に着地していた。

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

### 実ブラウザでの追加検証（2026-10-15）

当初「未検証」として残していた2項目を、実ブラウザ（Chrome）で確認した。どちらも問題なし。

**1. ログイン済みの顧客が従来どおり閲覧できること**

顧客 `koji.19960810@gmail.com`（`member` / `org:sakura` タグ保持）でログインした状態で、プレビューテーマ（`login-gate-probe` #166380896342）の各ページをDOMで検査した。

| パス | ゲート表示 | ヘッダー | 商品リンク数 | その他 |
|---|---|---|---|---|
| `/` | 無し | 有り | 6 | 商品一覧セクションが正常に描画 |
| `/collections/all` | 無し | 有り | 6 | |
| `/products/コシヒカリ-5kg` | 無し | — | — | 価格 ¥3,000 を表示、カートに追加ボタン有り、Buy Nowボタン無し（意図どおり） |
| `/pages/contact` | 無し | 有り | — | 問い合わせフォームが描画され、`contact[名前]`・`contact[email]` に値が自動設定されている |
| `/cart` | 無し | 有り | — | 通常のカートページ |

**ログインするとゲートは外れ、従来どおりの画面に戻る。** `customer` を見る単純な分岐が期待どおり動作している。

**2. ゲート画面の見た目**

未ログイン状態で、デスクトップ幅（1440px）とモバイル幅（390px）の両方で4言語を目視確認した。日本語・英語・ベトナム語・中国語のいずれもテキストの溢れや折り返しの崩れはなく、ロゴ・見出し・本文・ボタン・注記が中央に揃って表示される。ベトナム語は文言が最も長いがモバイル幅でも2行に収まる。

### この検証中に発見した問題（ゲートとは別件・既存の不具合）

**ストアフロントのログイン導線が、購入ゲートのCart Validation Function（`org-tag-gate`）に塞がれている。** 詳細と切り分けの経緯は [cart-validation-function.md](./cart-validation-function.md) の「ストアフロントのログイン受け渡しがブロックされる」節に記録した。

上記「1.」の検証は、この問題を回避するためにチェックアウトルール「member tag gate」を一時的に無効化した状態で行っている（検証後に有効へ戻した）。**ルールが有効なままでは、ゲートの「ログインする」ボタンから先に進めない。** ライブテーマでも同じ現象が起きるためゲートの実装が原因ではないが、ゲートを本番に出す前にこの問題を解消しておく必要がある（ゲートが入ると、ログインが未登録者以外にとって唯一の導線になるため）。

## ライブテーマへの反映（2026-10-15）

PR #93 をマージし、ライブテーマ `rice-market-storefront`（#160721141846）へ反映した。**Devストアのストアフロントは現在このゲートが有効な状態になっている。**

前提として、ログイン導線を塞いでいた不具合（[cart-validation-function.md](./cart-validation-function.md)の「ストアフロントのログイン受け渡しがブロックされる」節、Issue #97）をPR #98で先に解消してある。ゲートが入るとログインが唯一の導線になるため、この順序が必要だった。

手順は `shopify-dev-verification` スキルのチェックリストに従った。

1. `git log --oneline origin/main -- themes/` と作業ブランチを比較し、未取り込みのテーマ変更が無いことを確認
2. `shopify theme pull --theme 160721141846` でライブ全体（349ファイル）を退避
3. ゲート関連の7ファイルだけを `--only` で指定してpush

```
shopify theme push --store rice-market-dev.myshopify.com \
  --theme 160721141846 --allow-live --nodelete \
  --only layout/theme.liquid --only snippets/login-gate.liquid \
  --only assets/component-login-gate.css \
  --only locales/ja.json --only locales/en.default.json \
  --only locales/vi.json --only locales/zh-CN.json
```

### 反映後の確認（未ログイン・新規セッション）

| 対象 | 結果 |
|---|---|
| `/`・`/collections/all`・`/pages/contact`・`/products/*`・`/cart`・`/search` | ゲート表示、商品リンク0件 |
| `/en/`・`/vi/`・`/zh/` | ゲート表示 |
| `/pages/signup-76953dbc2dbb`・`/pages/himawari-7f3a9c2e5b81`・`/en/pages/signup-...` | 登録フォーム表示（例外が効いている） |
| `/policies/terms-of-service`・`/policies/privacy-policy` | 表示 |

ログイン済みのブラウザでライブテーマを開き、ゲートが外れて商品・ヘッダーが表示されることもあわせて確認した。

### 反映作業中に踏んだ失敗

**最初のpushは、作業ツリーが別のブランチ（ゲートを取り込む前のブランチ）のままだったため、ゲートが入っていないテーマをライブへ送っていた。** pushは成功と表示されるが、ライブの `layout/theme.liquid` にはゲートの判定が入らず、`snippets/login-gate.liquid` も作られない。

ライブの内容と同じものを送っただけだったので実害は出ず、`--only` で対象を絞っていたため他のファイルへの巻き戻りも起きなかった。**`shopify theme push` は「今の作業ツリーの中身」を送るのであって「マージしたブランチの中身」を送るのではない、という当たり前の事実の再確認。** push後は、ライブから対象ファイルを `pull` し直して中身を突き合わせるまでが手順。

## 運用上の注意

**新しく派遣元の会員登録ページを作るときは、テンプレート割り当ての名前に `signup` を含めること。** 判定が `page.template_suffix contains 'signup'` なので、含まれていないと登録ページがゲートされ、登録してもらえなくなる。

この条件は、既存2ページの命名（`Forms - sakura-signup` / `Forms - himawari-signup`）に合わせている。あわせて `seo.hidden` メタフィールドの設定も必要（[signup-url-handle.md](./signup-url-handle.md)）。**派遣元ページの追加手順は本番構築手順書にチェックリストとして残すべき**で、現状そのドキュメントは存在しない。
