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

## 追加実装（2026-10-06）: 具体的な組織名の表示とFlowによる自動同期

「派遣元」という表示をユーザーごとの具体的な組織名（例:「さくら協同組合」）にしたいという要望を受け、UIとデータ同期の両方を実装した。調査経緯は [self-service-status-change.md（research）の追補](../research/self-service-status-change.md#追補2026-10-06-組織名の表示には既存のビルトイントリガーで足りる)を参照。

### UI改善（`ProfileBlock.jsx`）

- 現在の所属状態をバッジで表示（所属中 / 卒業済み）
- 未卒業時は `customer.metafield($app:org_name)` を読み、組織名（例:「さくら協同組合」）を表示する。Flowによる同期がまだ走っていない顧客向けに、`org_name`が未設定なら`customer.tags`から抽出した`org_code`にフォールバックする
- 「現在、派遣元に所属している」という説明文は削除し、卒業済み時のみ `graduatedStatus` メッセージを表示
- バッジ・組織名を左、卒業ボタンを右に配置（`direction="inline" justifyContent="space-between"`）

### 顧客メタフィールド `org_name`（組織名の自動同期）

| キー | 型 | 用途 |
|---|---|---|
| `$app:org_name`（実体は`app--<app id>:org_name`） | 単一行テキスト | `dispatch_org` メタオブジェクトの `org_name` をShopify Flowが同期する。顧客自身は読み取りのみ |

`shopify.app.toml` に以下を追加（`access.customer_account` は `read_only` ではなく `read` を指定する。TOMLスキーマが受け付ける列挙値は `none` / `read` / `read_write` のみで `read_only` は存在しない）。

```toml
[customer.metafields.app.org_name]
name = "所属派遣元の組織名"
description = "dispatch_org メタオブジェクトの org_name を Shopify Flow が同期する（顧客タグ org:<org_code> が追加されたとき）。顧客自身は読み取りのみ（Issue #45）"
type = "single_line_text_field"
access.customer_account = "read"
access.admin = "merchant_read_write"
```

### Shopify Flowワークフロー「顧客タグ追加時に組織名を同期」

管理画面上で構築（コードではなくFlow GUIで管理するため、リポジトリにファイルは存在しない）。構成・ハマりどころの詳細は [research側の追補](../research/self-service-status-change.md#追補2026-10-06-組織名の表示には既存のビルトイントリガーで足りる)を参照。

1. トリガー: `Customer tags added`
2. アクション: `Get metaobject entries`（`dispatch_org` を全件取得、クエリなし）
3. アクション: `Update customer metafield`（Liquidで顧客タグから `org_code` を抽出し、一致するメタオブジェクトエントリーの `org_name` を `org_name` メタフィールドに書き込む）

Devストアでテスト実行し、テスト顧客（タグ `member`, `org:sakura`）に対して `org_name` が正しく「さくら協同組合」に更新されることを確認。本番運用でワークフローをオンにした。

**注意: ワークフローをオンにしても、既存の顧客タグには遡及適用されない。** `Customer tags added`はオンになった後の新規イベントにのみ反応するトリガーのため、オン化前からタグを持っていた顧客は`org_name`が同期されないまま残る（`null`）。実機検証でこれに気づき、既存顧客のタグを一旦`tagsRemove`で外し`tagsAdd`で付け直すことで実際にトリガーを発火させ、`org_name`が「さくら協同組合」に正しく書き込まれることを確認した。本番移行時は、オン化前に登録済みの顧客に対して同様の再付与（またはタグの一括更新）が必要になる。

## 訂正（2026-10-08）: 「実装・実機検証済み（2026-10-05）」は正式デプロイを指していなかった

上記の「実装・実機検証済み」は、`shopify app dev`のローカル開発プレビューで確認した事実であり、**`shopify app deploy`による正式なリリースは一度も行われていなかった。** そのため、プロフィールページ（`/account/profile`）には自己卒業ブロックが一切表示されない状態が続いていた。

発覚の経緯: 顧客から「作成したはずの所属組織がアカウントページに表示されない」という報告を受け調査したところ、Dev Dashboardのバージョン履歴（9/20〜10/6、全14件）に`self-graduation`拡張・`self_graduated`/`org_name`メタフィールド定義のデプロイが1件も存在しないことが判明した。10/6深夜に行われた一連のデプロイ（Issue #44ロイヤリティ機能関連）はいずれもこの拡張を含んでおらず、結果としてアクティブなアプリバージョンから自己卒業機能そのものが欠落していた。

2026-10-08、以下の手順で復旧した。

1. `apps/shopify-app/extensions/royalty-dashboard/shopify.extension.toml`の`assets = "./assets"`指定（存在しないディレクトリを参照しておりビルドをブロックしていた）を削除
2. `shopify app deploy --allow-updates`で`self-graduation`・`org-tag-gate`・`royalty-dashboard`を含む新バージョン（`royalty-calculator-19`）をリリース
3. 設定 > チェックアウト > 編集 で開く「お客様アカウント」カスタマイズエディタの「プロフィール」ページに、`self-graduation`ブロックを明示的に追加して保存（**Customer Account UI Extensionは、`shopify app deploy`でバージョンに含めるだけでは画面に現れない。テーマのApp Blockと同様、カスタマイズエディタでの明示的な配置が別途必要**）

復旧後、実機で「派遣元」バッジと「卒業する」ボタンの表示を確認済み。なお、デプロイが途切れていた間も顧客メタフィールドの**値**自体はShopify側に保持されていた（既存テスト顧客で`self_graduated: true`の状態が復旧後も反映されていることを確認）。消えるのは拡張の表示・スキーマ定義であり、過去に書き込まれた値は消えない。

教訓: 複数のセッション・ブランチが同じカスタムアプリに対して`shopify app deploy`を行う場合、**他方の作業が含まれていない作業ツリーからのデプロイは、相手の拡張機能を黙って消す。** デプロイ前に`shopify app info`で現在のローカルツリーが持つ拡張機能一覧と、Dev Dashboardのアクティブバージョンの拡張機能一覧を突き合わせるべき。
