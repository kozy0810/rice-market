# 多言語対応の実装で分かったこと（Issue #15）

## 「言語のデフォルト」には2種類ある（混同注意）

Settings → Languages の各言語の「...」メニューに、見た目が似た2つの項目がある。

| メニュー項目 | 出現する行 | 実際に変えるもの |
|---|---|---|
| **ドメインのデフォルトとして設定** | 公開済みの言語すべて | そのドメインの**bare path（`/ja/`等のプレフィックスなしURL）**にどの言語を割り当てるか。ルーティングの設定に過ぎない |
| **デフォルトを変更**（英語＝現在の基準言語の「...」からのみ出る） | 現在「デフォルト」表示になっている言語の行 | ストアの**プライマリーロケール**（`Shop`の基準言語）。商品タイトル・説明などのフィールドが「どの言語の生データとして扱われるか」を決める本体設定 |

前者だけ変えても、言語一覧の「デフォルト」バッジは動かない。商品コンテンツの翻訳登録（`translationsRegister`）は後者を見ているため、前者だけ変更した状態で英語ロケールへ翻訳登録しようとすると

```
Localeをストアのプライマリーロケールと同じにすることはできません
```

というエラーになる（プライマリーが英語のまま変わっていないため）。

**正しい手順**: 変更したいターゲット言語を先に「言語を追加」→「公開する」で公開しておき、現在プライマリーになっている言語の「...」→「デフォルトを変更」→ 対象言語を選択 → 保存。

### 副作用: プライマリー変更で英語がストアの言語一覧から消える

このストアは店舗作成時から英語がプライマリーだった（商品データ自体は日本語で入力されていたが、Shopify内部では「英語のフィールド」として保存されていた）。プライマリーを日本語に切り替えると、**それまでプライマリーだった英語は言語一覧から自動的に外れる**。多言語対応を続けるなら、日本語に切り替えた直後にもう一度「言語を追加」で英語を追加・公開し直す必要がある。

「デフォルトを変更」の確認ダイアログには「ストアのコンテンツは英語で作成されています…日本語の翻訳は削除され、手動で書き換える必要があります」という警告が出るが、これは「本当に英語の文章が入っている」ケース向けの汎用文言。本件のように**生データの中身が実際には日本語**だった場合は、プライマリーを切り替えるだけで中身は書き換え不要（そのままのテキストが日本語プライマリーとして扱われる）。日本語向けの翻訳（`翻訳なし`）を一切登録していなかったため、警告の「削除される翻訳」は実質空で、被害はなかった。

## 商品コンテンツの翻訳は `translationsRegister` で入れる

商品タイトル・説明（`body_html`）はテーマの `locales/*.json` とは別物で、Shopify Adminの「Translate & Adapt」または Admin GraphQL API の `translationsRegister` mutation で言語ごとに個別登録する。

手順:

1. `translatableResource(resourceId: "gid://shopify/Product/...")` で対象フィールドの `key` / `value` / `digest` / `locale` を取得する。`locale` はストアのプライマリーロケールと一致する（プライマリーが日本語なら `"ja"` が返る）
2. `translationsRegister(resourceId, translations: [{locale, key, value, translatableContentDigest}, ...])` で言語ごとに登録する。`translatableContentDigest` は手順1で取得した digest をそのまま渡す（値が変わっていないことの整合性チェック）
3. プライマリーロケールと同じ `locale` を指定するとエラーになる。ストアに存在しない（未公開の）`locale` を指定してもエラーになる（「Localeはストアの有効なロケールではありません」）ので、対象言語は先に公開しておくこと

このAPIには `read_translations` / `write_translations` スコープが必要（本アプリには付与済み）。`shopLocales` クエリ（`read_locales`/`read_markets_home` が必要）は未付与のため使えない。言語の追加・公開・プライマリー変更はAdmin UI（ブラウザ操作）で行う必要がある。

## リソースタイプ早見表（`translatableResources(resourceType: ...)`）

商品タイトル・説明以外にも、`TranslatableResourceType` には次のような種類があり、それぞれ同じ `translationsRegister` の流れで翻訳を登録できる。

| 内容 | resourceType | 備考 |
|---|---|---|
| 商品タイトル・説明 | `PRODUCT` | key: `title` / `body_html` |
| 商品オプション名（例:「サイズ」） | `PRODUCT_OPTION` | key: `name`。カートの「サイズ:」表記はここが原因だった |
| ナビゲーションメニューの項目名 | `LINK` | key: `title`。`MENU`自体はメニュー名（例:"Main menu"）で項目とは別 |
| テーマJSONテンプレートの設定値（トップページのボタン文言・見出しなど） | `ONLINE_STORE_THEME_JSON_TEMPLATE` | key例: `section.index.json.rich_text_hero.button.button_label:<block_id>` のように、テンプレート内のブロックIDを含む長い形式 |
| 配送方法名（例:「通常配送」） | `DELIVERY_METHOD_DEFINITION` | key: `name` |
| 手動決済方法の名称・説明文（Cash on Delivery、Bank Depositなど） | `PAYMENT_GATEWAY` | key: `name` / `message` / `before_payment_instructions` |
| ポリシーページ（返品ポリシー等） | `SHOP_POLICY` | |

`resourceType`を間違えると「Expected type 'TranslatableResourceType!'」で弾かれるので、`__type(name: "TranslatableResourceType") { enumValues { name } }` で正式名を確認してから使うとよい。

## 現状（2026-09-28時点、Devストア）

- プライマリーロケール: 日本語（もともと英語だったが切り替え済み）
- 公開済み言語: 日本語（プライマリー）、英語、ベトナム語、中国語（簡体字）
- 翻訳登録済み: コシヒカリ 5kg/10kg/30kgのタイトル・説明、商品オプション名「サイズ」、ヘッダーメニュー（ホーム/商品一覧/お問い合わせ）、トップページのボタン文言・「商品一覧」見出し、配送方法名「通常配送」、手動決済方法（Cash on Delivery / Bank Deposit）の支払い案内文。いずれも英語・ベトナム語・中国語（簡体字）で登録し、実店舗で `/en/` `/vi/` `/zh/` 表示を確認済み
- 中国語は簡体字のみ登録（繁体字は未登録・未公開）
- テーマの汎用文言（Add to cart、数量、税込み表記など）はDawn標準の `locales/*.json` でもともと多言語対応済みなので、上記の翻訳登録とは別に最初から動く
- 未対応: 特商法・返品ポリシー等（ページ自体が未作成、Issue #2待ち）
