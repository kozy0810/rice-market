# Shopify のコードは Git 管理できるか

**コードはできる。設定はできない。** 境界を明確にしておく。

## Git 管理できるもの

| 対象 | 管理方法 |
|---|---|
| アプリのソース（App Proxy のサーバー、webhookハンドラ） | 通常のリポジトリ |
| Validation Function のソース | 同上 |
| アプリ設定ファイル `shopify.app.toml` | 同上。スコープ、App Proxyのパス、**メタフィールドとメタオブジェクトの定義**を含む |
| テーマのソース（Liquid、CSS、JS、翻訳ファイル） | `shopify theme pull` / `push` で取得・反映できる。Shopify の GitHub連携機能を使えばブランチ連動も可能 |
| テーマの設定値 | `config/settings_data.json` と `templates/*.json` に入るため、テーマと一緒に管理される |

実際、検証で `shopify theme pull` によるソース取得と `shopify theme push` による反映が機能することを確認した。

## Git 管理できないもの

管理画面上の状態であって、コードではないもの。

- 商品、在庫、価格
- 配送ゾーンと送料テーブル
- 決済方法の設定
- **メタオブジェクトの中身**（派遣元マスタの各レコード。定義は管理できるがデータは管理できない）
- 顧客と注文
- Shopify Forms のフォーム定義
- Shopify Flow のワークフロー
- チェックアウトルールの有効・無効
- チェックアウト／お客様アカウントのブランディング設定（設定 > チェックアウト > 編集 で変更するロゴ画像・幅・配色等。Issue #61参照）
- 言語の追加状態と Translate & Adapt の翻訳データ

これらは API 経由でエクスポート・インポートするスクリプトを書けば擬似的にバージョン管理できるが、標準の仕組みは存在しない。

### 補足: Git管理下にあるが管理画面から書き換わるテーマファイル

テーマファイルはGit管理下にあるが、一部は管理画面やアプリが書き換える。「リポジトリとライブテーマを比較したら差分が出た」とき、それが巻き戻り事故なのか管理画面側の正当な更新なのかを区別する必要がある。

- `templates/page.json`、`templates/page.sakura-signup.json`、`templates/page.Forms - himawari-signup.json` は Shopify Forms のブロックを含むページテンプレート。**管理画面でフォームを編集するとShopify側が書き換える。** フォーム定義そのものは依然としてGit管理外で、テンプレートが参照する`form_id`だけがコードに残る
  - `page.Forms - himawari-signup.json` は元々ライブテーマにしか存在せずGit管理外だったが、`shopify theme push`（`--only`なし）で消えてしまう爆弾だったため2026-10-14にリポジトリへ取り込んだ（経緯は`docs/research/contact-form.md`の「ライブテーマの巻き戻り事故」節）
  - `page.json`（既定のページテンプレート）も同様に、ライブにだけさくらの登録フォームのブロックが入っていて、**リポジトリ側をpushするとさくらの登録フォームが消える状態だった**（さくらの登録ページは存在しないテンプレートを指していて、この `page.json` にフォールバックして描画されている）。2026-10-14にライブの内容を取り込んで解消した。構造としては正しくないため整理が必要（詳細と推奨形は`docs/research/signup-url-handle.md`の「補足（2026-10-14）」節）
- `templates/{404,article,password,product}.json` は、`theme pull` するとリポジトリ側と差分が出るが、**中身はShopifyによる正規化のみ**（空の`"settings": {}`の挿入、キーの並び替え、`<\/p>`→`</p>`のエスケープ解除）。意味のある差分ではないので追従不要
- テーマエディタで編集可能なセクション設定（`templates/*.json`、`config/settings_data.json`）も同様に管理画面から書き換わる
- `shopify theme pull` で取得した `locales/*.json` と `templates/*.json` には、Shopifyが「auto-generated」コメントヘッダを自動付与する。リポジトリ側にはこのヘッダが無いため、**pull結果と素朴にdiffすると全ファイルが差分として出る。** 実質的な差分を見るときはこのヘッダを除外して比較する

## 実務上の意味

**本番ストアの構築手順そのものを文書として残す必要がある。** コードだけリポジトリにあっても、管理画面の設定を再現できなければストアは復元できない。運用マニュアルとは別に、構築手順書を作るべきである。

## テーマとアプリだけを Git 管理する構成

「コードだけ管理する」は現実的な方針として成立する。ただしテーマ側に構造上の制約がある。

### Shopify GitHub連携の制約

> Because the Shopify GitHub integration supports only branches that match the default Shopify theme folder structure, you need to organize your code so that a branch that's connected to Shopify matches this structure. For example, a branch that's connected to Shopify can't contain `src` and `dist` folders.

出典: https://shopify.dev/docs/storefronts/themes/best-practices/version-control

**連携するブランチのルートにテーマのフォルダ構成（`assets/`、`config/`、`layout/`、`locales/`、`sections/`、`snippets/`、`templates/`）が直接並んでいる必要がある。** テーマを `theme/` のようなサブディレクトリに置いたモノレポは GitHub連携の対象にできない。

このプロジェクトでは `themes/storefront/` をモノレポの1ディレクトリとして置く方針を採っている（`AGENTS.md` 参照）。したがって Shopify の GitHub連携機能（双方向同期）は使えず、`shopify theme pull` / `push` による手動運用になる前提である。

### GitHub連携の価値（今回は使わない前提の参考情報）

この連携は**双方向同期**である。

> When a theme is connected to a GitHub repository using the Shopify GitHub integration, any changes that a merchant makes to the theme are tracked as commits to the branch.

マーチャントがテーマエディタで行った変更が自動的にコミットされる。非エンジニアが管理画面で触った内容がバージョン管理に乗るということであり、バックアップと変更履歴の両方を無料で得られる。モノレポ構成を諦めてテーマだけ別リポジトリに分ければこの連携を使う選択肢もある（`kozy0810/rice-market-theme` のような形）。

### カバーされない範囲と対処

テーマとアプリを管理しても、管理画面の設定は依然として残らない。前述のとおり商品、送料テーブル、決済設定、メタオブジェクトのデータ、Forms、Flow、チェックアウトルール、翻訳データは対象外である。

対処は2段階で考える。

1. **構築手順書を書く。** 管理画面のどこで何を設定したかを再現可能な粒度で残す。これが最低限
2. **必要なら設定をエクスポートするスクリプトを書く。** Admin API で商品・送料・メタオブジェクトをJSONに落とし、リポジトリに置く。復元は別途スクリプトが要る。やりすぎると保守対象が増えるため、本当に失うと困るものだけに絞る

派遣元マスタ（メタオブジェクトのデータ）はロイヤリティの根拠になるため、少なくともこれは定期的にエクスポートしておく価値がある。
