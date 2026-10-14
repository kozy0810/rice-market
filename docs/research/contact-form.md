# お問い合わせフォーム（Dawn標準 `contact-form`）の実機検証

関連: Issue #65

## 訂正（2026-10-13）: Issue #65は完了・クローズ済み。本ドキュメントの2〜4節は実装変更前の検証結果

**Issue #65はユーザー本人による実ブラウザでの手動確認が完了し、クローズ済み。** コメント（[issuecomment-6062545025](https://github.com/kozy0810/rice-market/issues/65#issuecomment-6062545025)）の要点:

- コメント・電話番号を空のまま送信しても正常に送信でき、実際にメールを受信できた（完了条件2・3を実質的に確認）
- 残っていた「メールアドレス未入力時のエラー表示」（完了条件4の一部）は、**Issue #67でフォーム自体が改修され、この経路自体が無くなった**ため検証不要になった

**Issue #67（お問い合わせフォームの入力項目を見直す）により、フォームの実装が本ドキュメントの1〜4節の検証時点から変わっている。** 現在の`themes/storefront/sections/contact-form.liquid`は以下の通り（Dawn標準そのままではない）。

- 名前・メールアドレスは`hidden`フィールドでログイン中の`customer.name`/`customer.email`から自動設定される。**ユーザーが入力する欄がない**（このストアは全ページログイン必須のため、未ログイン時のフォールバックは実装されていない）
- 電話番号は引き続き任意項目
- 「コメント」欄は「問い合わせ内容」という表示名に変更され、**`required minlength="10"`が付与され10文字以上必須**になった
- 利用規約への同意チェックボックス（`contact__agreement`、`required`）が追加されている

したがって、以下の2〜4節にある「`contact[email]`が入力欄として存在する」「メール形式不正時にネイティブバリデーションで止まる」等の記述は、**Issue #67以前（Dawn標準のまま）の実装を対象にした検証結果であり、現在のフォームには当てはまらない。** メールアドレス自体を顧客が入力する余地がなくなったため、「メール未入力・形式不正時のエラー表示」という検証対象自体が消滅している。

当時の検証プロセス（hCaptchaの発見、curl/CDPでの挙動差など）は技術的な記録として引き続き参照価値があるため本文は残すが、**完了条件の判定としては下記「まとめ」表ではなくこの訂正節を正とすること。**

通知先メールアドレス（3節、2026-10-13追記分）は現在の実装にも関係なく有効な情報。

## ライブテーマの巻き戻り事故（2026-10-14）

### 何が起きたか

ユーザーからの「お問い合わせページが以前のUIに戻ってませんか？」という指摘を受けて調査したところ、Devストアのライブテーマ `rice-market-storefront`（#160721141846）が、**PR #69（お問い合わせフォームの入力項目見直し・UI調整）の変更だけを失った状態**になっていた。リポジトリ側の `themes/storefront/` は正常で、#69の変更はすべて `main` に入っていた。壊れていたのはライブテーマのみ。

`shopify theme pull` でライブテーマ全体を取得してリポジトリと比較した結果、実質的な差分は以下の7ファイルで、これは #69 のコミット（`5121478`）が変更したファイルと完全に一致した。他のファイルの差分は、Shopifyがpull時に自動付与する「auto-generated」コメントヘッダだけだった。

| ファイル | 巻き戻りによってライブ側で起きていたこと |
|---|---|
| `sections/contact-form.liquid` | 名前・メールアドレスの入力欄が復活（#69でhiddenにしたはずのものがDawn標準の2カラム表示に戻る）。問い合わせ内容の `required minlength="10"` が消滅。利用規約の同意チェックボックスが消滅。電話番号のpatternが緩い方に戻る。送信成功後の `history.replaceState` が消滅 |
| `assets/section-contact-form.css` | 名前・メール欄用の2カラムgridが復活、`.contact__agreement` のマージン指定が消滅 |
| `sections/main-page.liquid` | 見出しサイズが `h0` 固定に戻る（`heading_size` 設定項目そのものが消滅） |
| `templates/page.contact.json` | パディングが36/36に戻り、#69で調整した見出しとフォームの間隔が失われる |
| `locales/ja.json` | 「問い合わせ内容」が「コメント」に戻る、`agreement` キーが消滅 |
| `locales/en.default.json` | `agreement` キーが消滅 |
| `sections/main-collection-banner.liquid` | 商品一覧ページの不要な見出し（`<h1>商品`）が復活 |

ヘッダー・フッター（PR #63）には影響がなく、`config/settings_data.json` も無傷だった。

### 原因

**#69をマージする前に分岐したローカルブランチ `fix/storefront-logo-size`（HEAD: `de3a2d9`）の作業ツリーから `shopify theme push` された**ことが原因。根拠は次の2点。

1. `git diff de3a2d9 HEAD -- themes/` の結果が、上記7ファイル（= #69の変更ファイル）とそのまま一致する。つまりこのブランチのツリーは「HEAD から #69 を引いたもの」に等しい
2. `git archive de3a2d9 themes/storefront` で取り出したツリーとライブテーマを全ファイル比較したところ、`sections/`・`assets/` は完全一致した（残る差分は `templates/*.json` の自動生成コメントヘッダのみ）

`shopify theme push` は、`shopify app deploy` が「デプロイした作業ツリーにある拡張機能だけでアクティブバージョンを置き換える」のと同じ挙動をする。つまり**push元のツリーの内容がそのままライブテーマになる**ため、マージ済みのテーマPRを含まない古いブランチからpushすると、そのPRの変更が黙って消える。

### 復旧手順

ライブテーマ全体を事前にscratchpadへ `shopify theme pull` で退避した上で、該当7ファイルだけを `--only` で指定してpushした。

```
shopify theme push --store rice-market-dev.myshopify.com --theme 160721141846 \
  --allow-live --nodelete --path themes/storefront \
  --only sections/contact-form.liquid \
  --only sections/main-collection-banner.liquid \
  --only sections/main-page.liquid \
  --only assets/section-contact-form.css \
  --only templates/page.contact.json \
  --only locales/ja.json \
  --only locales/en.default.json
```

push後に再度 `shopify theme pull` して検証し、7ファイルすべてがリポジトリと一致することを確認した（`.json` ファイルは自動生成コメントヘッダを除いて一致）。

ポイントは以下の通り。

- **`--theme <ID>` でテーマIDを明示する。** `shopify theme list` で開発用テーマが `[current]` になっていることがあり、省略すると誤爆する
- **`--allow-live` が非対話環境では必須。** 付けないと「ライブテーマにpushしますか？」の確認プロンプトで失敗する
- **全体pushはしない。** ライブテーマには Shopify Forms が管理画面で作った `templates/page.Forms - himawari-signup.json` が存在し、これはGit管理外だった。素の `shopify theme push` はローカルに無いリモートファイルを削除するため、このテンプレートが消える。`--only` で対象を絞り、保険として `--nodelete` も付けた
- 上記の `page.Forms - himawari-signup.json` は、同じ事故を次に誰かが起こさないようこの対応と同時にリポジトリへ取り込んだ（既存の `page.sakura-signup.json` と同じ構造の派遣元サインアップページ。`form_id` は `1182251`）

### 再発防止

`shopify-dev-verification` スキルの「よくあるハマりどころ」に、テーマ版の同種事故としてこの件を追記した。テーマをpushする前に確認すべきことは次の通り。

- `git log --oneline main -- themes/` と自分のブランチの同じログを比べ、自分のツリーに取り込まれていないテーマ変更がないか確認する。あれば先に `main` を取り込む
- `--theme <ID>` でテーマIDを明示する
- 一部ファイルだけ直すときは `--only` で絞り、`--nodelete` を付ける
- push前に `shopify theme pull` でライブテーマ全体を退避しておく

## 目的

ストアの「お問い合わせ」フォーム（Dawn標準の`contact-form`セクション + `form 'contact'`タグ）が実際に動作するかを検証する。

1. 実装（セクション・テンプレート・公開・ナビゲーション導線）の確認
2. 実際に送信した際の成功表示（`post_success`）の確認
3. 送信内容の通知先メールアドレスの確認
4. 必須項目未入力・メール形式不正時のエラー表示の確認

## 検証環境・手法

- Devストア: `rice-market-dev.myshopify.com`（ストアフロントパスワード保護あり。値は`docs/shopify-verification-log.md`参照）
- Admin GraphQL: `shopify store execute`
- ストアフロントのHTML取得・フォーム送信: `curl`（Cookieジャーでセッション維持）
- ブラウザ自動操作: `puppeteer-core` + Chrome DevTools Protocol（`--remote-debugging-port`、専用の一時プロファイルを使用。既定プロファイルではリモートデバッグが拒否されるため）

## 1. 実装・公開・ナビゲーション導線の確認

### ライブテーマとリポジトリの一致

ライブテーマ（`rice-market-storefront` #160721141846）から`sections/contact-form.liquid`と`templates/page.contact.json`を`shopify theme pull`で取得し、リポジトリの`themes/storefront/`配下と diff した。

```
--- diff contact-form.liquid ---
[ok] Files are identical
--- diff page.contact.json ---
（差分はShopifyが自動付与する「この行以下は自動生成」コメントのみ。中身は同一）
```

→ **ライブテーマはリポジトリのコードと完全に一致している**（カスタマイズなし、Dawn標準のまま）。

### ページの公開状態

Admin GraphQLで`pages`を取得:

```graphql
{ pages(first: 20) { nodes { id title handle isPublished templateSuffix } } }
```

```json
{
  "id": "gid://shopify/Page/262000148566",
  "title": "Contact",
  "handle": "contact",
  "isPublished": true,
  "templateSuffix": "contact"
}
```

→ `page.contact.json`テンプレートを使う`/pages/contact`ページが**存在し、公開済み**。

### ナビゲーションからの導線

ストアフロント（パスワード突破後）のトップページHTMLを取得し、`/pages/contact`へのリンクを検索:

```
841:  id="HeaderDrawer-お問い合わせ" href="/pages/contact" （モバイルドロワーメニュー）
980:  id="HeaderMenu-お問い合わせ"   href="/pages/contact" （デスクトップヘッダーメニュー）
```

→ **ヘッダーメニュー（PC・モバイル両方）に「お問い合わせ」としてリンクされている**。

### フォームの実際のフィールド名（日本語ロケール）

`/pages/contact`のHTMLを取得すると、Dawnのセクションは`'templates.contact.form.xxx' | t`でフィールド名を翻訳キーから生成しているため、日本語ロケールでは次の実名になる。

```html
<form method="post" action="/contact#ContactForm" id="ContactForm" accept-charset="UTF-8" ...>
  <input type="hidden" name="form_type" value="contact" />
  <input type="hidden" name="utf8" value="✓" />
  <input name="contact[名前]" .../>
  <input name="contact[email]" type="email" aria-required="true" .../>
  <input name="contact[電話番号]" type="tel" .../>
  <textarea name="contact[コメント]"></textarea>
</form>
```

- 仕様上必須なのは`contact[email]`のみ（[shopify.dev: Add a contact form to your theme](https://shopify.dev/docs/storefronts/themes/customer-engagement/add-contact-form)）。他のフィールド名はラベルの翻訳文字列がそのままキーになるため、ロケールによって変わる。
- `authenticity_token`等のCSRFトークンはこのフォームには存在しない（ストアフロントパスワードフォームには存在する点と対照的）。

**→ 完了条件1（実装・公開・ナビゲーション導線の確認）: 確認できた。**

## 2. 実際の送信・成功表示の確認

### curlによるPOST送信 → 失敗（Cloudflareのチャレンジ）

GETリクエスト（パスワード突破、トップページ、`/pages/contact`取得）はすべてcurlで問題なく成功した。しかし`/contact`へのPOST送信は、User-Agent・Referer・Originヘッダーを本物のブラウザに似せても一貫して`403`で弾かれた。

```
HTTP/2 403
cf-mitigated: challenge
cType: 'managed'
<title>Verifying your connection...</title>
```

→ curlはJavaScriptを実行できないため、後述するhCaptcha（ブラウザのJS実行が前提）のトークンを取得できず、この時点で弾かれると考えられる。

### ブラウザ自動操作（puppeteer-core + CDP）による再試行 → 原因を特定: Shopify標準のhCaptcha保護

実ブラウザ（Chrome）をCDP経由で操作してフォーム送信を試みたところ、ネットワークログから明確な原因が判明した。

[shopify.dev: CAPTCHA](https://shopify.dev/docs/storefronts/themes/trust-security/captcha) に記載の通り、**Shopifyはcontact・customer・blogコメントの各フォームに対して標準でhCaptchaによるスパム対策を組み込んでいる**（マーチャントが管理画面の「オンラインストア > 環境設定」で無効化しない限り有効）。挙動は次の通り:

> Shopify uses hCaptcha to help prevent spam through customer, contact, and blog comment forms. Initially, hCaptcha analyzes website visitor behavior to provide a score indicating the likelihood of the visitor being a bot, without requiring the visitor to solve an interactive challenge. If the assessment result is suspicious enough... the visitor is redirected to the /challenge page to perform an interactive challenge for further assessment.

実際に、フォームのフィールドをクリックした時点で以下のリクエストが発生することをネットワークログで確認した（`contact[email]`にフォーカスした直後）。

```
GET https://cdn.shopify.com/shopifycloud/storefront-forms-hcaptcha/ce_storefront_forms_captcha_hcaptcha.v1.5.3.iife.js
GET https://js.hcaptcha.com/1/api.js?render=explicit&...
GET https://newassets.hcaptcha.com/captcha/v1/.../static/hcaptcha.html#frame=challenge&...&size=invisible&...
POST https://api.hcaptcha.com/checksiteconfig?...&sitekey=f06e6c50-85a8-45c8-87d0-21a2b65856fe&...
```

このinvisible hCaptchaは、通常のユーザー操作であれば裏側で自動的にスコア判定が完了し、フォームのPOSTがそのまま通る設計になっている。しかし**CDPで自動操作しているブラウザセッションは、hCaptchaの行動分析によって「怪しい」と判定され、スコア判定が完了しない**（`/contact`へのPOSTや`checkcaptcha`系のレスポンスが一度も発生しないまま、30秒待っても`/pages/contact`から遷移しない状態を確認した）。これは、hCaptchaが自動化ブラウザ（`navigator.webdriver`等のフィンガープリント）を検知して正規の人間操作と区別するという、CAPTCHA一般の既知の性質と一致する（**ここは一般的なhCaptchaの挙動からの推論。Shopifyのサイト固有の判定ロジックの中身は非公開のため確証はない**）。

→ curlの403ブロックと、CDP操作時にフォームが送信されない現象は、**同一の原因（Shopify標準のhCaptcha保護）に起因する可能性が高い**。curlはJSを実行できずhCaptchaのトークンを取得できないため拒否され、CDP操作下のChromeはJSは実行できるがhCaptchaの行動分析で自動化と判定され通過できない、という整合的な説明になる。

結果として、**自動化されたスクリプトでの実際のフォーム送信→`post_success`表示の確認は、hCaptchaの仕組み上、本検証環境では完了できなかった**。

**→ 完了条件2（送信成功時の表示確認）: 未実証（hCaptchaによりスクリプトからの自動検証が不可能）。**

Liquidソース上は、`form.posted_successfully?`が真の場合に次のブロックが描画されることをコードレベルで確認済み（`themes/storefront/sections/contact-form.liquid`）。これはDawn標準の実装であり仕様としては機能するはずだが、本ストア上での動作を実際には確認できていない。

```liquid
{%- if form.posted_successfully? -%}
  <h2 class="form-status form-status-list form__message" tabindex="-1" autofocus>
    {{- 'icon-success.svg' | inline_asset_content -}}
    {{ 'templates.contact.form.post_success' | t }}
  </h2>
{%- elsif form.errors -%}
  ...
```

## 3. 通知先メールアドレスの確認

Admin GraphQLで`shop`の`email`・`contactEmail`を取得:

```json
{
  "shop": {
    "name": "rice-market-dev",
    "email": "koji.19960810@gmail.com",
    "contactEmail": "koji.19960810@gmail.com"
  }
}
```

→ ストアのオーナーメール（`email`）とストア連絡先メール（`contactEmail`）はいずれも`koji.19960810@gmail.com`で一致している。

どの設定項目が送信先になるかは、Shopifyヘルプセンターの一次情報で確認できた（`curl`ではCloudflareのJSインタースティシャルに阻まれたため、CDP経由の実ブラウザで取得）。

> お問い合わせフォームから送信された内容はすべて、ストアの差出人メールアドレスに送信されます。差出人メールアドレスは、管理画面の[通知] 設定ページで変更できます。
>
> （出典: [Shopifyヘルプセンター「ストアに「お問い合わせ」ページを追加する」](https://help.shopify.com/manual/online-store/themes/customizing-themes/add-contact-page#view-contact-form-submissions)）

→ 送信先は管理画面「設定 > 通知」ページで設定する**ストアの差出人メールアドレス**であることが仕様として確認できた。Admin GraphQLで取得した`shop.email`/`shop.contactEmail`（＝`koji.19960810@gmail.com`）が、この「差出人メールアドレス」の初期値と一致している可能性が高いが、**実際に管理画面「設定 > 通知」ページを開いてこの値と一致するかどうかの目視確認はできていない**（管理画面はログインセッションが必要であり、本検証の自動操作環境からはログイン済みセッションを確保できなかった）。

### 追記（2026-10-13）: 管理画面「設定 > 通知」の目視確認が完了。差出人の実際の表示形式に重要な注意点あり

ブラウザで管理画面 `https://admin.shopify.com/store/rice-market-dev/settings/notifications` を開き、ログイン済みセッションで直接確認できた（読み取りのみの操作だったため、過去に問題になった埋め込みiframeへの入力・クリックの不安定さには該当しなかった）。

- 「差出人メールアドレス」欄の値は`koji.19960810@gmail.com`で、推測通り`shop.email`/`shop.contactEmail`と一致していることを目視確認した
- **重要な注意点**: このページに次の警告が表示されている。

  > Gmail などのパブリックドメインは、カスタム送信をサポートしていません。お客様には、メールアドレスが **`store+76593725526@shopifyemail.com`** として表示されます。

  つまり、「差出人メールアドレス」欄に設定した`koji.19960810@gmail.com`は**実際にお客様へ届くメールの送信元（Fromヘッダー）としては使われない**。Gmailのようなパブリックドメインはカスタム送信（SPF/DKIM設定）に対応していないため、Shopifyが自動生成した`store+<ショップID>@shopifyemail.com`形式のアドレスにすり替わって表示される。返信（reply-to）は引き続き`koji.19960810@gmail.com`に届く設計と推測されるが、この点は未確認
  - 本番移管時にカスタムドメインを取得した場合は、この制約が解消されブランドのドメインからの送信に切り替えられる（画面内の「新しく作成してください」リンク先の案内）

**→ 完了条件3（通知先の確認）: 確認できた。** 送信先が管理画面「設定 > 通知」の「差出人メールアドレス」であることは一次情報（Shopifyヘルプセンター）で確認済み。値が`koji.19960810@gmail.com`であることも管理画面で目視確認済み。ただし実際にお客様に見える送信元アドレスは`shopifyemail.com`のプロキシアドレスになる点を追加で発見した。

残る未実証項目は以下のみ：

- 実際にこのメールアドレス（`koji.19960810@gmail.com`）の受信箱に通知メールが届くかどうかの直接確認（受信箱の確認はユーザー本人による手動確認が必要）

## 4. エラー表示の確認

### 必須項目（メール）未入力の場合: 未実証

`contact[email]`の`<input>`には`aria-required="true"`はあるが、**HTML標準の`required`属性は付与されていない**（`themes/storefront/sections/contact-form.liquid`より）。

```html
<input
  ...
  name="contact[email]"
  aria-required="true"
  {% if form.errors contains 'email' %}
    aria-invalid="true"
    ...
  {% endif %}
  ...
>
```

これはブラウザのネイティブバリデーションでは**ブロックされない**ことを意味し、空メールのままPOSTがサーバーに届き、サーバー側で`form.errors`が立って`error_heading`とメールフィールドへのエラーリンクが描画される設計になっている（コード上の構造としては確認済み）。しかし前述の通り、本検証環境ではhCaptchaの行動分析が自動操作ブラウザを通過させないため、POST自体が発生せず、**この経路を実際に動かして確認することはできなかった（未実証）**。

### メールアドレス形式不正の場合: 実機確認できた（ブラウザのネイティブバリデーションで止まる）

`type="email"`の入力欄に`abc`（`@`を含まない不正な値）を入力し、フォームを送信（`noValidate`を設定せずに通常どおりクリック）したところ、**Chromeのネイティブバリデーションでブロックされ、サーバーにPOSTが送られなかった**ことを確認した。

```
validationMessage: 'メール アドレスに「@」を挿入してください。「abc」内に「@」がありません。'
validity.valid: false
url: 変化なし（/pages/contactのまま）
```

これは、Dawnの`error_heading`／エラーリンクのUIが**実際には表示されない**ことを意味する。`type="email"`のブラウザ標準バリデーションが先に作動し、ブラウザのツールチップで止まるため、Liquid側のサーバーサイドエラー表示に到達しない。

（なお、`document.getElementById('ContactForm').noValidate = true`でネイティブ検証を無効化しサーバーまで到達させて`error_heading`の描画を見る追試も行ったが、前述のhCaptchaの行動分析によりPOST自体が発生せず、この経路の結果は確認できなかった＝未実証。）

**→ 完了条件4（エラー表示の確認）: 部分的に確認できた。**

- メール形式不正時: **ブラウザのネイティブバリデーションで止まり、Dawnの`error_heading`は表示されないことを実機確認した**（これはバグではなく`type="email"`を使うHTML標準の挙動）。
- メール未入力時（`required`属性がないため理論上はサーバーまで到達するはず）の`error_heading`表示: **未実証**（hCaptchaによりPOSTの自動検証ができなかったため）。

## まとめ

本検証で**フォーム自体に不具合は見つかっていない**。確認できなかった項目はすべて「Shopify標準のhCaptcha保護（スパム対策）がスクリプトによる自動検証を妨げた」という検証手法上の制約によるものであり、実装の欠陥ではない。

| 完了条件 | 判定 | 備考 |
|---|---|---|
| 1. 実装・公開・ナビゲーション導線の確認 | **確認できた** | ライブテーマがリポジトリと一致、ページ公開済み、ヘッダーメニューからの導線あり |
| 2. 送信成功時の表示（`post_success`） | **未実証** | Shopify標準のhCaptcha保護（contact/customer/blogフォーム共通の仕組み）が、CDP自動操作ブラウザを人間と区別し通過させないため、POST自体が発生しなかった |
| 3. 通知先メールアドレス | **確認できた**（実着信のみ未実証） | 送信先が管理画面「設定 > 通知」の「差出人メールアドレス」であることをShopifyヘルプセンターで確認済み。値が`koji.19960810@gmail.com`であることを管理画面で目視確認済み。ただしGmailドメインのためお客様には`store+76593725526@shopifyemail.com`として表示されることが判明（2026-10-13）。実際の受信箱への着信確認のみユーザー本人による手動確認が必要 |
| 4. エラー表示 | **部分的に確認できた** | メール形式不正時はブラウザのネイティブバリデーションで止まりDawnの`error_heading`は出ないことを実機確認。メール未入力時の`error_heading`描画は未実証（同じくhCaptchaが原因） |

### 原因の特定: Shopify標準のhCaptcha保護（推測ではなく一次情報で裏付け済み）

本検証中にcurl・CDPブラウザ操作の両方で`/contact`へのPOSTが完了しなかった。原因はCloudflareの汎用的なボット対策ではなく、**[shopify.dev: CAPTCHA](https://shopify.dev/docs/storefronts/themes/trust-security/captcha) に明記されているShopify標準のhCaptcha保護**であることをネットワークログで特定した（フォームへのフォーカス時に`storefront-forms-hcaptcha`スクリプト・hCaptcha APIへのリクエストが発生することを確認。該当箇所は本ドキュメント「2. 実際の送信・成功表示の確認」を参照）。

この保護はマーチャントが管理画面「オンラインストア > 環境設定」で無効化できる（仕様上の事実）。これにより「完了条件2」「完了条件4のうち必須項目未入力のケース」は、本環境のスクリプトによる自動検証では完結できなかった。手動でのブラウザ操作（人間がマウス・キーボードで実施）であれば、invisible hCaptchaの行動分析が正常に完了し問題なく動作する可能性が高いが、それも未確認である。

**この手動確認は完了済み（2026-10-13、Issue #65クローズコメント参照）**: ユーザーが実ブラウザで送信・受信を確認した。コメント・電話番号を空にしたままでも正常に送信でき、実際にメールを受信できている。メールアドレス未入力時のエラー表示確認は、Issue #67の改修でメールアドレスの入力欄自体が無くなったため不要になった。

**代替案（hCaptchaを一時的に無効化してスクリプトで再検証する場合）**: 管理画面「オンラインストア > 環境設定」でhCaptchaを無効化すれば、本ドキュメントで使った`puppeteer-core`スクリプトでも条件2・条件4（メール未入力ケース）をそのまま自動検証できる可能性が高い。ただしこれはストア全体のスパム対策を無効化する設定変更のため、**検証後は必ず元の状態（有効）に戻すこと**。
