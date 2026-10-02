# 派遣元マスタとタグの命名規則

Issue #5 の実装仕様。関連する調査結果は `docs/research/metaobjects.md`、`docs/research/royalty-snapshot.md` を参照。

## 派遣元マスタ（`dispatch_org` メタオブジェクト）

| フィールド | 型 | 必須 | 用途 |
|---|---|---|---|
| `org_name` | 単一行テキスト | ○ | 表示用の組織名（例: さくら協同組合） |
| `org_code` | 単一行テキスト | ○ | タグに使う短い識別子。半角英数字とハイフンのみ（例: `sakura`） |
| `active` | 真偽値 | - | 有効/無効 |

`org_code` は管理者が任意の値を入力する。バリデーション（文字種チェック等）は Shopify のメタオブジェクトフィールド機能でどこまで強制できるか未検証のため、まずは運用（命名時に半角英数字とハイフンのみ使うことを徹底する）でカバーする。

## タグの命名規則

| 対象 | タグ | 意味 | 誰が・いつ付与するか |
|---|---|---|---|
| 顧客 | `member` | 会員フラグ（購入ゲートが見る） | 登録時、Shopify Formが自動付与 |
| 顧客 | `org:<org_code>` | 所属派遣元 | 登録時、Shopify Formが自動付与（派遣元ごとに固定値をFormに設定） |
| 注文 | `org:<org_code>` | 注文時点の派遣元スナップショット | 注文作成時、Shopify Flow（またはフォールバックのスクリプト。Issue #8） |

顧客タグと注文タグで同じ `org:<org_code>` 形式を使うのは、`docs/research/royalty-snapshot.md` で実証した「タグ検索によるロイヤリティ集計」をそのまま流用するため。

## 運用手順（Formでタグを設定する担当者向け）

1. 派遣元マスタ（メタオブジェクト）に新しい派遣元を追加し、`org_code` を決めて入力する
2. Shopify Forms でその派遣元用のフォームを作り、タグ欄に `member` と `org:<org_code>`（1で決めた値）を設定する
3. フォームの「新しいランディングページ」機能で登録用ページを作る
4. 作成された Page の「URLハンドル」を `signup-<12文字のランダム英数字>`（生成コマンド: `openssl rand -hex 6`）に変更する。保存時に出る「旧ハンドル→新ハンドルへのURLリダイレクトを作成」のチェックは外す（推測困難なURLにする目的。詳細は `docs/research/signup-url-handle.md` 参照）
5. 同じ Page に `seo`/`hidden` メタフィールド（`value: "1"`, `type: "number_integer"`）を設定する。sitemapから除外され `noindex`/`nofollow` が付く（Admin GraphQL の `pageUpdate` mutationで設定。手順は `docs/research/signup-url-handle.md` 参照）
6. テーマエディタでそのページを開き、**「Template」グループ**（ページ固有のセクション群）の「Add section」→「アプリ」タブから Forms のブロックを追加する。**「ヘッダー」グループに追加するとサイト全体に表示されてしまうので注意**（`docs/research/customer-accounts.md` 参照）

## 注文メタフィールド（参考、Issue #8で実装）

`docs/research/royalty-snapshot.md` の実証では `rice.dispatch_org_handle` という名前を使っていたが、今回 `org_code` に統一したため、実装時は次の名前にする。

- `rice.dispatch_org_code`
- `rice.dispatch_org_name`
- `rice.royalty_rate`
