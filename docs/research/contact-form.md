# お問い合わせフォーム（Dawn標準 `contact-form`）の実機検証

関連: Issue #65

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

### curlによるPOST送信 → 失敗（Cloudflareのボット対策）

GETリクエスト（パスワード突破、トップページ、`/pages/contact`取得）はすべてcurlで問題なく成功した。しかし`/contact`へのPOST送信は、User-Agent・Referer・Originヘッダーを本物のブラウザに似せても一貫して`403`で弾かれた。

```
HTTP/2 403
cf-mitigated: challenge
cType: 'managed'
<title>Verifying your connection...</title>
```

→ Cloudflareの「managed challenge」（JS実行とブラウザのTLS/JSフィンガープリントを要求するもの）がPOSTに対して発動しており、curlでは原理的に突破できない。

### ブラウザ自動操作（puppeteer-core + CDP）による再試行 → 不安定・未達成

実ブラウザ（Chrome）をCDP経由で操作してフォーム送信を試みた。

- 1回目の試行では、ストアフロントパスワードページが通常のブランド化されたフォーム（`パスワードを入力してストアにアクセスする。`という見出しと入力欄）として描画され、突破に成功した。
- しかし、その後の再現試行では同じURLへのアクセスで**汎用の「Opening soon」プレースホルダーページ**（パスワード入力欄が隠れた状態）が返されることが複数回あり、自動操作で安定して突破できなかった。

この挙動の違いは、Cloudflareが自動化されたブラウザセッション（CDP接続、`navigator.webdriver`等のフィンガープリント）を識別し、異なるレスポンス（簡易なプレースホルダーページ）を返している可能性が高いと考えられる（**推論**。確証はない）。これは前述のcurl POSTブロックと同根の、ストアへのボット対策（Cloudflare）に起因する制約と考えられる。

結果として、**自動化されたスクリプトでの実際のフォーム送信→`post_success`表示の確認は、本検証環境では安定して再現できなかった**。

**→ 完了条件2（送信成功時の表示確認）: 未実証（環境制約）。**

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

**推奨（手動確認、2分程度）**: 実ブラウザで `https://rice-market-dev.myshopify.com/password` にパスワード(`rteild`)を入力後、ヘッダーメニューの「お問い合わせ」から`/pages/contact`へ行き、メールアドレスを含めて送信し、「送信できました」等の成功メッセージ（`post_success`の日本語訳）が表示されるかを目視確認する。

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

→ ストアのオーナーメール（`email`）とストア連絡先メール（`contactEmail`）はいずれも`koji.19960810@gmail.com`で一致している。Shopifyの仕様上、お問い合わせフォームの通知はストアの管理画面「設定 > 通知」で設定された宛先（一般的にはストアのメールアドレス）に送られる。

ただし以下は**未実証**:

- 管理画面「設定 > 通知」の実際の画面上で、どのラベルの設定項目がこの宛先に対応するかの目視確認（本検証では、Admin GraphQLのスキーマにメニュー取得権限（`read_online_store_navigation`等）がなく、また管理画面へのブラウザ操作もCloudflare/自動化検出の影響下にあり実施できなかった）
- 実際にこのメールアドレス（`koji.19960810@gmail.com`）の受信箱に通知メールが届くかどうかの直接確認（受信箱にアクセスする手段がない）

**→ 完了条件3（通知先の確認）: 部分的に確認できた。** 宛先として使われる可能性が高いメールアドレスの値（`koji.19960810@gmail.com`、オーナーメールと一致）はAPIで特定できたが、管理画面上でのラベル確認と実際の着信確認は未実証。

**推奨（手動確認）**: 管理画面 `https://admin.shopify.com/store/rice-market-dev/settings/notifications` を開き、「お客様への通知」セクションの「お問い合わせフォーム」に関する項目と、送信先として表示されるメールアドレスを確認する。

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

これはブラウザのネイティブバリデーションでは**ブロックされない**ことを意味し、空メールのままPOSTがサーバーに届き、サーバー側で`form.errors`が立って`error_heading`とメールフィールドへのエラーリンクが描画される設計になっている（コード上の構造としては確認済み）。しかし前述の通り、本検証環境ではPOST自体がCloudflareのボット対策・自動操作検出の影響で安定して成功せず、**この経路を実際に動かして確認することはできなかった（未実証）**。

### メールアドレス形式不正の場合: 実機確認できた（ブラウザのネイティブバリデーションで止まる）

`type="email"`の入力欄に`abc`（`@`を含まない不正な値）を入力し、フォームを送信（`noValidate`を設定せずに通常どおりクリック）したところ、**Chromeのネイティブバリデーションでブロックされ、サーバーにPOSTが送られなかった**ことを確認した。

```
validationMessage: 'メール アドレスに「@」を挿入してください。「abc」内に「@」がありません。'
validity.valid: false
url: 変化なし（/pages/contactのまま）
```

これは、Dawnの`error_heading`／エラーリンクのUIが**実際には表示されない**ことを意味する。`type="email"`のブラウザ標準バリデーションが先に作動し、ブラウザのツールチップで止まるため、Liquot側のサーバーサイドエラー表示に到達しない。

（なお、`document.getElementById('ContactForm').noValidate = true`でネイティブ検証を無効化しサーバーまで到達させて`error_heading`の描画を見る追試も行ったが、Cloudflareのボット対策によりPOST自体が安定せず、この経路の結果は確認できなかった＝未実証。）

**→ 完了条件4（エラー表示の確認）: 部分的に確認できた。**

- メール形式不正時: **ブラウザのネイティブバリデーションで止まり、Dawnの`error_heading`は表示されないことを実機確認した**（これはバグではなく`type="email"`を使うHTML標準の挙動）。
- メール未入力時（`required`属性がないため理論上はサーバーまで到達するはず）の`error_heading`表示: **未実証**（環境制約でPOSTの自動検証ができなかったため）。

## まとめ

| 完了条件 | 判定 | 備考 |
|---|---|---|
| 1. 実装・公開・ナビゲーション導線の確認 | **確認できた** | ライブテーマがリポジトリと一致、ページ公開済み、ヘッダーメニューからの導線あり |
| 2. 送信成功時の表示（`post_success`） | **未実証** | Cloudflareのボット対策（`managed challenge`）がcurl POSTを一貫してブロック。ブラウザ自動操作（CDP）でも自動化検出と見られる不安定な挙動によりパスワードゲートを安定突破できず未達成 |
| 3. 通知先メールアドレス | **部分的に確認できた** | `shop.email` = `shop.contactEmail` = `koji.19960810@gmail.com`とAPIで特定。管理画面上のラベル確認・実際の着信確認は未実証 |
| 4. エラー表示 | **部分的に確認できた** | メール形式不正時はブラウザのネイティブバリデーションで止まりDawnの`error_heading`は出ないことを実機確認。メール未入力時の`error_heading`描画は未実証 |

### 環境制約についての補足（推論）

本検証中、以下の2つの事象が観測された。

1. curlによる`/contact`へのPOSTが一貫して`cf-mitigated: challenge`付き403で拒否された。
2. CDP経由のブラウザ自動操作で`/password`に繰り返しアクセスした際、本来のブランド化されたパスワード入力フォームではなく、汎用の「Opening soon」プレースホルダーページが返されることが複数回あった。

両者とも、Cloudflareがこのストアに対してボット対策（WAF/マネージドチャレンジ）を適用しており、自動化されたクライアント（curl、CDP制御下のChrome）を人間の操作と区別して異なる応答を返している可能性が高いと考えられる（**推論であり未確証**）。これにより、「完了条件2」「完了条件4のうち必須項目未入力のケース」は本環境のスクリプトによる自動検証では完結できなかった。手動でのブラウザ操作（人間がマウス・キーボードで実施）であれば問題なく動作する可能性が高いが、それも未確認である。
