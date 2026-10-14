# 会員登録ページのURLハンドル（推測困難化）

Issue #42 の実現可能性検証。関連する調査結果は [serverless-options.md](./serverless-options.md)（構成B、Shopify Forms + Page による登録フォーム）を参照。

## 検証環境

`rice-market-dev.myshopify.com` の Page機能。管理画面から Page を作成・編集し、`shopify store execute` で Admin GraphQL を実行して確認した。

## URLハンドルにスラッシュは使えない

管理画面の「URLハンドル」欄には `signup/testtoken1234` のようにスラッシュを含む値を入力でき、保存前のプレビューでも `pages/signup/testtoken1234` と表示される。しかし**保存すると自動的にハイフンへ正規化され、`signup-testtoken1234` になる。**

オンラインストアのPageルーティングは `/pages/<handle>` という1セグメントの構造であり（[Liquid pagesオブジェクトのドキュメント](https://shopify.dev/docs/api/liquid/objects/pages)にも `/pages/about-us` の例のみ）、2階層のURL（`/pages/signup/xxxx`）は作れない。

**判定: `pages/signup-<ランダム文字列>` の形（ハイフン区切り）でのみ「signupを含むURL」を実現できる。**

## ハンドル変更時、リダイレクト作成がデフォルトでオンになる

既存Pageの「URLハンドル」を編集すると、保存前に次のチェックボックスが**デフォルトでオンの状態**で表示される。

> `旧handle` → `新handle` へのURLリダイレクトを作成

旧URLへのアクセス時に404のまま放置したい場合は、**保存前にこのチェックを明示的に外す必要がある。** 見落とすと自動でURL Redirectが作成され、旧URL（`/pages/sakura-signup`）から新URLへ誘導されてしまい、「推測困難にする」という目的が骨抜きになる。

## 公開ページは sitemap.xml に自動掲載される

Shopifyの `/sitemap.xml` は `sitemap_pages_1.xml`（言語ごとに `/en/sitemap_pages_1.xml` 等も存在）を含み、**公開状態のPageは全て自動的にここに載る。** 実際に検証用ページを「公開」で作成したところ、直後に `sitemap_pages_1.xml` に掲載されることを確認した。

これは「handleを推測困難な文字列にする」という対策だけでは閉じない穴である。sitemapに載っている限り、検索エンジンがクロール・インデックスしうる。Devストアはストアフロントパスワードで守られているため気づきにくいが、本番ストアではこの防御がない。

### 対処: `seo.hidden` メタフィールドで sitemap除外 + noindex

[公式ドキュメント（Optimize storefront SEO）](https://shopify.dev/docs/apps/build/marketing/optimize-storefront-seo)に、リソースに次のメタフィールドを設定すると sitemap から除外され、`noindex`/`nofollow` の meta タグが自動付与されると明記されている。

```graphql
mutation {
  pageUpdate(
    id: "gid://shopify/Page/<PageID>"
    page: {
      metafields: [
        { namespace: "seo", key: "hidden", value: "1", type: "number_integer" }
      ]
    }
  ) {
    page { id handle }
    userErrors { field message }
  }
}
```

実機で検証済み。検証用Pageに上記mutationを実行した結果:

- `sitemap_pages_1.xml` から即座に除外された（再取得で確認）
- ページの `<meta name="robots">` が `noindex,nofollow` になった（`document.querySelector('meta[name="robots"]').content` で確認）
- URLを直接開くと、ページ自体は変わらず表示される（アクセス自体を塞ぐものではなく、検索エンジンからの発見だけを防ぐ）

ドキュメントには「sitemapから隠すと、ストア内検索（storefront search）の結果にも出なくなる」との記載もある（未実機確認、ドキュメント記載のみ）。

**判定: 派遣元ごとの登録ページには `seo.hidden` メタフィールドを設定する運用を必須にする。** ハンドルの推測困難性だけでは不十分で、この設定と組み合わせて初めて「URLを知っている人だけがアクセスできる」状態に近づく。

Admin APIの実行には `write_content` または `write_online_store_pages` スコープが必要（`read_content`系スコープでは書き込めない）。検証時は `shopify store auth` を `write_online_store_pages` 付きで再認証した。

## 本番実装（Issue #42）での実施結果

上記の検証を踏まえ、既存の `sakura-signup` ページ（`gid://shopify/Page/262154813526`）に実際に適用した。

- handleを `signup-76953dbc2dbb`（`openssl rand -hex 6` で生成）に変更。「URLリダイレクトを作成」のチェックは外した
- `seo`/`hidden` メタフィールドを設定
- **Forms連携は handle 変更後も保持されることを確認した。** テンプレート割り当て（「Forms - sakura-signup」）はURLハンドルとは独立したフィールドであり、新URL（`/pages/signup-76953dbc2dbb`）で登録フォームが問題なく表示された
- 4言語（`/pages/...`=ja、`/en/pages/...`、`/vi/pages/...`、`/zh/pages/...`）すべてで表示確認した
- 旧URL（`/pages/sakura-signup`）は404になることを確認した
- sitemapから除外されたことを再確認した（`sitemap_pages_1.xml` に `contact` のみが残り、登録ページは載らなくなった）

## 補足（2026-10-14）: さくらの登録フォームは既定テンプレート `page.json` のフォールバックで表示されている

上の「新URLで登録フォームが問題なく表示された」は事実だが、**表示の経路が想定と違っていた。** リポジトリとライブテーマを突き合わせる過程で判明した。

さくらの登録ページの `templateSuffix` は `Forms - sakura-signup` だが、**この名前に対応するテンプレートファイル `templates/page.Forms - sakura-signup.json` はライブテーマに存在しない。** 存在しないテンプレートを指しているため、Shopifyは既定の `templates/page.json` にフォールバックしており、そこにShopify Formsのブロック（`form_id: 1161577`）が入っているおかげでフォームが表示されている。

実機で確認した内容:

- `/pages/signup-76953dbc2dbb` を取得すると `200` で返り、`form_id: 1161577` と `shopify-forms-loader.js` が含まれている（フォームは表示されている）
- レンダリング結果の `class="page-width page-width--narrow ..."` に `center` クラスが**付いていない**。`page.sakura-signup.json` は `text_alignment: "center"` を持つため、もしそのテンプレートが使われていれば `center` が付く。付いていないことから、使われているのは `text_alignment` 設定を持たない既定の `page.json` だと判別できる
- ライブテーマの `templates/` 一覧に `page.Forms - sakura-signup.json` は無い。一方で `page.sakura-signup.json` は存在するが、`templateSuffix` が `sakura-signup` のページは1つも無いため**孤児になっている**

ひまわりの方は `templateSuffix: Forms - himawari-signup` と `templates/page.Forms - himawari-signup.json` が正しく対応している。この非対称性から、さくら側は設定ミスと判断できる。

### これが引き起こす問題

1. **リポジトリの `page.json` をライブにpushすると、さくらの登録フォームが消える。** リポジトリ側の `page.json` にはFormsブロックが入っていなかった（＝ライブの方が正しい状態だった）。2026-10-14にライブの内容をリポジトリへ取り込んで解消した
2. **既定テンプレートを使う新規ページを作ると、そこにさくらの登録フォームが出る。** 本ドキュメントの「URLを推測困難にする」という方針と相反する。現状はページが3つ（お問い合わせ・さくら登録・ひまわり登録）しか無く、いずれも専用のテンプレート指定を持つため実害は出ていない

### 推奨する正しい形（未実施・要判断）

ライブの描画結果が変わるため、実施するかどうかは判断が必要。

- `templates/page.Forms - sakura-signup.json` を作成し、さくら用のFormsブロックをそこへ移す（ひまわりと同じ形に揃える）
- `templates/page.json` はFormsブロックを持たない素の状態に戻す
- 孤児の `templates/page.sakura-signup.json` を削除するか、上記の正しいファイル名へ改名する

## 未検証・残課題

- `seo.hidden` を設定したページが、ストア内検索（storefront search）の結果から実際に消えるかは未確認（ドキュメント記載のみ）。
