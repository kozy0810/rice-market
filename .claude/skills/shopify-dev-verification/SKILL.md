---
name: shopify-dev-verification
description: rice-marketプロジェクトのShopify（Devストア・カスタムアプリ・テーマ）に対して実機で調査・検証・実装を行うための手順とハマりどころ集。Shopifyの仕様や挙動について「できる/できない」を推測や記憶だけで断定しそうになったら必ず使う。「Devストアで試す」「Shopifyの挙動を確認する」「テーマ/アプリを触る」「管理画面を操作する」「CLIでコマンドを叩く」など、このプロジェクトでShopifyに触るあらゆる場面で使う。既知の落とし穴（トンネルの不安定さ、shadow DOM操作、APIスコープ不足、埋め込みiframe）を踏む前に読むこと。
---

# Shopify 実機検証・実装の進め方

このプロジェクトでは推測でShopifyの仕様を語らない。**公式ドキュメント検索 → 実機検証 → `docs/research/` に記録**の順で進める。過去の検証結果は先に `docs/shopify-verification-log.md`（トピック別ファイルへの索引と可否判定のまとめ）を読んで、同じことを二度調べない。

## 基本方針

1. 「Shopifyは〜できる/できない」と断定する前に、`shopify-ai-toolkit` の `shopify-dev` スキル（`search_docs.mjs`）で一次情報を確認する
2. ドキュメントで分からないこと、挙動が疑わしいことは、Devストア（`rice-market-dev.myshopify.com`）で実際に試す
3. 検証して分かった事実（できた/できなかった/落とし穴）は、該当するトピックの `docs/research/*.md` に追記する。既存のどのファイルにも当てはまらない新しいトピックなら `docs/research/` に新しいファイルを作り、`docs/shopify-verification-log.md` の一覧表に1行追加する。推測や未検証の内容は「推論」「未実証」と明記して区別する

## Devストアへのアクセス

- CLI: `shopify store execute -s rice-market-dev.myshopify.com -q '...'` （要 `shopify store auth` 済み）
- 管理画面: `https://admin.shopify.com/store/rice-market-dev/...`
- ストアフロントのパスワード保護あり。値は検証ログ参照

## よくあるハマりどころ

- **`shopify app dev` のトンネル（`*.trycloudflare.com`）は不安定。** ブラウザから到達不能になったら `pkill -f 'cloudflared tunnel'; pkill -f 'shopify app dev'` してから再起動する。再起動のたびに `APP_UNINSTALLED` webhook が飛びローカルセッションが切れるので、管理画面でアプリを開き直してセッションを再確立してから使う
- **チェックアウトルールの有効/無効セレクトは shadow DOM 内にある。** 通常のクリックでは開閉できないことがある。`javascript_tool` で `shadowRoot` を辿って `value` を直接セットし `input`/`change` イベントを発火させる
- **Admin API のスコープは都度必要な分しか付与されていない。** 新しいオブジェクト（注文、下書き注文、メタオブジェクト定義など）を触る前に `shopify store auth --scopes ...` で再認証する
- **管理画面の埋め込みiframe（アプリ管理画面など）はクロスオリジンで、`find`/`get_page_text` から中身が見えない。** 座標クリックに頼らざるを得ないが、反応しないことがある。数回試してダメなら別ルート（API直叩き、別ページ経由）を探す
- **メタオブジェクトを管理画面から作成すると、ハンドルが自動生成され読みにくい値になる。** API作成時の任意ハンドルとは異なる。タグ等に使う場合は要注意（`docs/research/metaobjects.md` 参照）
- **`shopify store execute`（`shopify store auth`のCLIセッション）からは、他アプリ（例: `rice-market-app`）が所有するメタオブジェクトが見えない。** `read_metaobjects`スコープを付与しても`metaobjectDefinitions`/`metaobjects`クエリが空で返る。実機確認は管理画面UI（コンテンツ > メタオブジェクト）で行うこと
- **`apps/shopify-app/`のようにローカルの`.shopify/`を含めずGit管理すると、`shopify app info`が「Dev store: Not yet configured」になる。** `shopify app dev --store <ストア>`を一度実行すれば紐付く（インストールされていなければ同時にインストールもされる）
- **Shopify FlowのLiquidコードエディタ（例: 「Update customer metafield」のValue欄）は`{%`や`{{`の入力でスニペット自動補完ポップアップが開く。** ブラウザ自動操作で長いLiquid文字列を一度に`type`すると、途中のスペースキーがポップアップの確定操作として誤認識され、無関係なテンプレート片（`{% assign variable_name = value %}`等）が挿入されて壊れる。対処: `{%`/`{{`を打つたびに`Escape`でポップアップを閉じてから続きを入力し、`End`キーで自動補完された閉じ括弧の後ろへ移動してから次のタグを追記する（詳細は`docs/research/self-service-status-change.md`の追補参照）
- **`shopify app deploy`は、デプロイを実行した作業ツリーに存在する拡張機能だけでアクティブバージョンを丸ごと置き換える。** 複数のセッション・ブランチ・worktreeが同じカスタムアプリ（`apps/shopify-app/`）を並行して触っていると、片方のデプロイがもう片方の拡張機能（self-graduationが丸ごと消えた実例あり）を黙って消す。デプロイ前に`shopify app info`でローカルツリーの拡張機能一覧を確認し、Dev Dashboard（`dev.shopify.com/dashboard/<組織ID>/apps/<アプリID>/versions`）でアクティブバージョンの内容と突き合わせること。経緯は`docs/specs/self-service-status-change.md`の「訂正（2026-10-08）」節を参照
- **Customer Account UI Extensionは`shopify app deploy`でバージョンに含めるだけでは画面に現れない。** テーマのApp Blockと同様、設定 > チェックアウト > 編集 で開く「お客様アカウント」カスタマイズエディタで、対象ページ（例: プロフィール）に明示的にブロックとして追加・保存する必要がある。「アクティブバージョンに拡張が含まれているか」と「ページにブロックとして配置されているか」は別の確認ポイント
- **`shopify theme push`は、マージ済みのテーマPRを黙って巻き戻す。** `shopify app deploy`とまったく同じ事故が、テーマ側でも起きる。マージ済みのテーマPRより前に分岐したブランチ・worktreeからpushすると、そのPRの変更がライブテーマから消える（PR #69のお問い合わせフォーム改修が、#69より古い`fix/storefront-logo-size`からのpushで7ファイルまるごと巻き戻った実例あり。経緯は`docs/research/contact-form.md`の「ライブテーマの巻き戻り事故」節を参照）。push前に必ず次を確認する。
  - `git log --oneline main -- themes/`と自分のブランチの同じログを比べ、自分のツリーに取り込まれていないテーマ変更が無いか見る。あれば先に`main`を取り込む
  - `--theme <ID>`でテーマIDを明示する。`shopify theme list`で`[current]`になっているDevelopmentテーマへ誤爆するのを防ぐ
  - 一部ファイルだけ直すときは`--only`で対象を絞り、`--nodelete`を付ける。**ライブテーマには管理画面やアプリが作ったGit管理外のファイルがある**（Shopify Formsが作る`templates/page.Forms - *.json`など）。素のpushはそれらを消す
  - push前に`shopify theme pull`でライブテーマ全体をscratchpadに退避しておけば、壊しても戻せる

## 記録のフォーマット

検証ログに追記するときは以下を意識する。

- 何を確認しようとしたか（目的）
- 実際に行った手順とコマンド／APIレスポンスの引用
- 結論（できる/できない/条件付き）
- 本番実装に効く注意点があれば明記

推測で「〜のはず」と書く場合は、後で読む人が推論だと分かるように書く（このプロジェクトでは「未実証・推論」という言い回しを使っている）。
