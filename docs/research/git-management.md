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
- 言語の追加状態と Translate & Adapt の翻訳データ

これらは API 経由でエクスポート・インポートするスクリプトを書けば擬似的にバージョン管理できるが、標準の仕組みは存在しない。

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
