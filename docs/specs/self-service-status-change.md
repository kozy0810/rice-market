# 顧客自身による卒業ステータス変更の仕様

Issue #45 の実装仕様。実現方式の調査経緯は [docs/research/self-service-status-change.md](../research/self-service-status-change.md)、タグの命名規則は [dispatch-org-tagging.md](./dispatch-org-tagging.md) を参照。

**実装・実機検証済み（2026-10-05）。** `apps/shopify-app/extensions/self-graduation/` にCustomer Account UI Extensionとして実装し、Devストアで動作確認済み。

## 背景

**「転籍」という概念は存在しない。** 会員登録時に組織（派遣元ごとの専用サインアップURL、[dispatch-org-tagging.md](./dispatch-org-tagging.md)参照）経由で組織が割り当てられ、顧客自身が自分でできる操作は「卒業」のみ。卒業は所属組織からの削除を意味し、**顧客アカウント自体は残り続ける**（退会ではない）。卒業しても購入は可能（`member`タグには影響しない運用方針）。

Customer Account API（顧客自身が使うAPI）には顧客タグを直接変更する手段が存在しない。顧客自身によるメタフィールド書き込みは公式にサポートされているため、「卒業したかどうか」を顧客メタフィールドで表現する。

## 顧客メタフィールド

| キー | 型 | 用途 |
|---|---|---|
| `$app:self_graduated`（実体は`app--<app id>:self_graduated`） | 真偽値 | 顧客自身による卒業操作。`true`なら卒業済み（所属組織なし）。未設定は`false`相当として扱う |

`apps/shopify-app/shopify.app.toml` に TOML宣言的カスタムデータ定義（`[customer.metafields.app.self_graduated]`）で定義し、`access.customer_account = "read_write"` を設定する。この形式で定義すると namespace は `app`（app-owned private metafield）になり、GraphQLクエリ・ミューテーションでは `namespace: "$app"` というエイリアスで参照する（呼び出し元アプリ自身に自動解決される）。実際にAdmin APIで確認すると `app--425654222849` のような実体のnamespace名になる。

**注意**: `$app` エイリアスは「クエリを実行しているアプリ自身」を指す。`shopify store execute`（管理者CLIセッション、アプリの文脈を持たない）から `namespace: "$app"` でクエリすると値が見えず `null` が返る。これはバグではなく、CLIセッションにアプリの文脈がないため解決できないだけ。確認するには、アプリ自身のコンテキストで動く GraphiQL（`shopify app dev` 起動時に表示される `http://localhost:<port>/graphiql` ）や、UI Extension自身のfetchから確認する。

## 購入ゲート（Cart Validation Function）への影響

**変更不要。** `apps/shopify-app/extensions/org-tag-gate/src/cart_validations_generate_run.ts` は `member` タグのみで判定する既存ロジック（[cart-validation-function.md](../research/cart-validation-function.md)）のまま維持する。卒業操作は所属組織情報のみを変更し、購入可否には影響しない。

## 所属組織の解決ロジック（注文スナップショット、Issue #8）

Issue #8（nice to have、[royalty-snapshot.md](../research/royalty-snapshot.md)参照）で実装予定の、注文作成時点の派遣元スナップショット処理に、次の優先順位を追加する。

```
self_graduated が true なら → org_codeなし（どの派遣元のロイヤリティ集計対象にもならない）
false / 未設定なら          → タグ org:<org_code> をそのまま使う
```

## Customer Account UI Extension（実装済み）

`apps/shopify-app/extensions/self-graduation/`（target: `customer-account.profile.block.render`）。派遣元を選ぶUIは不要（組織の割り当ては会員登録時のみで、顧客が後から別の組織を選ぶ手段はない）ため、Profileページに「卒業する」ボタン1つのシンプルな構成。

- 現在の `self_graduated` の値を `customer.metafield(...)` で読み、卒業済みなら「卒業済みです。アカウントはそのまま使えます。引き続き購入できます。」というメッセージのみ表示し、ボタンは隠す
- 未卒業なら「卒業する」ボタン → `s-modal` で確認画面を挟む → 確定後 `metafieldsSet` で `self_graduated` を `true` に書き込む
- 卒業後に取り消す操作は顧客自身には提供しない（管理者がAdmin API経由でタグを操作する既存経路（Issue #7）で対応する）
- 日本語・英語・ベトナム語・簡体字中国語・繁体字中国語の5言語に対応（`locales/`）

## 実機検証（2026-10-05、Devストア）

`shopify app dev` でDevストアに接続し、Customer Accountのプロフィール画面で確認した。

- Extensionがプロフィールページに正しく表示される（日本語ロケールも適用される）
- 「卒業する」→確認モーダル→確定、の一連のUIフローが動作する
- Admin APIで確認した結果、メタフィールドが正しく書き込まれていた（`namespace: "app--425654222849"`, `key: "self_graduated"`, `value: "true"`, `type: "boolean"`）
- 卒業操作の前後で顧客タグ（`member`, `org:sakura`）は変化しない。**購入ゲートへの非影響を確認できた**
- Protected Customer Dataへの明示的なアクセス申請なしに、Devストアでは問題なく書き込みができた（ただし本番ストアへの移管時に同様の挙動になるかは別途確認が必要、下記未確定事項参照）

## 未確定事項

- Protected Customer Dataへのアクセス承認が、本番ストアへの移管時に別途必要になるか（Devストアでは申請なしで動作したが、公式ドキュメントに記載がある手続きのため要確認）
