# App Home UI Extension — バックエンドなしでロイヤリティ画面を作れるか

## 背景

Issue #44（ロイヤリティ機能）で、「サーバーは運用したくない。Lambda/ECSのようなサーバーレスも使いたくない。Shopifyにデプロイしたら、それだけで完結するアプリを作りたい」という要件が出た。Admin APIで注文データを取得する必要があるが、Admin APIのアクセストークンをブラウザから直接叩くのは通常は危険（トークン露出・CORS）であり、素朴には「バックエンドが要る」ように見える。これが技術的に可能かを公式ドキュメントで確認した。**まだDevストアでの実機検証はしていない（ドキュメント確認のみ）。**

## 分かったこと（shopify.dev ドキュメント確認、2026-10-02）

Shopifyには **App Home UI Extension**（`admin.app.home.render`ターゲット）という仕組みがある。

- アプリのメイン画面（App Home）を、独自ホスティングのiframeアプリではなく、他のAdmin UI Extensionと同様に **Shopify側がホストする拡張機能として作れる**
- `shopify app deploy` でデプロイするだけで完結し、**デプロイすべき自前のWebサーバーが存在しない**
- Preactベース、UIはPolaris web components
- 拡張機能のランタイムAPIとして `shopify.query()` が使え、**GraphQL Admin APIを拡張機能のフロントエンドコードから直接呼べる**（Direct API access）。バックエンドへの往復が発生しない
- 認証はShopifyが自動的に行う（開発者が自分でトークンを扱う必要がない）

出典:
- https://shopify.dev/docs/apps/build/app-home
- https://shopify.dev/docs/apps/build/app-home/app-home-ui-extensions
- https://shopify.dev/docs/api/app-home-ui-extension/2026-07
- https://shopify.dev/changelog/blog/build-app-home-as-a-ui-extension

## 制約

- **custom distribution専用。** Shopify App Storeでの公開配布はできない（rice-marketは単一ストア向けの友人用カスタムアプリなので問題にならない）
- ランタイムがPreactに限定され、ブラウザAPIは通常のWebアプリより制限される
- 圧縮後バンドルサイズの上限が64KB
- webhookやバックグラウンドジョブなど、サーバーサイドの処理が必要な機能はこのモデルでは実現できない（別途バックエンドが要る）。ロイヤリティ画面自体は「開いたときにAdmin APIへ問い合わせて集計する」オンデマンド処理なので、この制約には抵触しない

## このプロジェクトへの示唆

- `apps/shopify-app/shopify.app.toml` には既に `[access.admin] direct_api_mode = "online"` と `embedded_app_direct_api_access = true` が設定済み。Direct API accessを使う前提は既にある
- ただし `access_scopes` に `read_orders` が含まれていない（現状: `write_products,read_customers,write_customers,read_metaobjects,write_metaobjects`）。ロイヤリティ画面で注文を読むには追加が必要
- #8（注文時点の派遣元スナップショット）は引き続きShopify Flowが候補のまま変わらない。Flowもサーバーを運用する必要がない（Shopify側のインフラで動く自動化）ため、「サーバー・サーバーレス基盤を自分で持たない」という今回の方針と矛盾しない

## 続報（2026-10-02）: `read_orders` だけでは直近60日分しか読めない

ロイヤリティは月次集計のため、運用が2ヶ月目に入った時点で「60日より前の注文」が発生する。ここで以下が分かった（公式ドキュメント確認）。

- `read_orders`（および`write_orders`）は**デフォルトで直近60日分の注文にしかアクセスできない**
- それより古い注文を読むには `read_all_orders` スコープが必要
- **`read_all_orders` は「Shopify承認スコープ」**で、`shopify.app.toml`に書くだけでは有効にならない。Partner Dashboard の「API access requests」からアプリの用途を説明して申請し、Shopifyの承認を待つ必要がある。承認されるまでの期間は不明
- 承認前に宣言すると、アプリバージョンの作成自体が`app_access`バリデーションエラーで失敗する

出典: https://shopify.dev/docs/api/usage/access-scopes, https://shopify.dev/docs/apps/build/authentication-authorization/manage-access-scopes

### rice-marketへの影響

Devストアでの検証（直近に作成したテスト注文を読むだけ）は `read_orders` だけで足りるため、ここはブロッカーにならない。しかし**本番でロイヤリティ機能を使い続けるには、どこかの時点で`read_all_orders`の承認申請が要る。** 申請から承認までの期間が読めないため、本番で機能が止まってから慌てないよう、早めに申請しておくことを推奨する（Partner Dashboard > Apps > rice-market-app > API access requests > Read all orders）。これは開発作業ではなく友人（Partner Dashboardの持ち主）側のアクションになる可能性がある。

## 実機検証（2026-10-02、Issue #44 技術スパイク）

ドキュメント確認のみだった上記の内容を、Devストア `rice-market-dev.myshopify.com` で実際に動かして確認した。

### 1. custom distributionの確認

Partner Dashboard（`https://partners.shopify.com/5130284/apps`）の「すべてのアプリ」一覧で、`rice-market-app` は

```
rice-market-app
カスタムアプリ
```

と表示されている。**custom distributionであることを確認済み。** App Home UI Extensionの制約（custom distribution専用）に抵触しない。

### 2. `shopify.app.toml` への `read_orders` 追加

`access_scopes.scopes` に `read_orders` を追加した。

```toml
scopes = "write_products,read_customers,write_customers,read_metaobjects,write_metaobjects,read_orders"
```

### 3. App Home UI Extensionの雛形生成

```
shopify app generate extension -n royalty-dashboard -t app_home
```

`-t` に渡す値（非対話モード）は `app_home`。生成されたのは Preact + `preact-iso` ルーター構成の「FAQ Manager」サンプルで、`shopify.extension.toml` は以下の通り（`target = "admin.app.home.render"` を確認）。

```toml
[[extensions]]
handle = "royalty-dashboard"
type = "ui_extension"

[[extensions.targeting]]
module = "./src/AppHome.jsx"
target = "admin.app.home.render"
assets = "./assets"
```

`src/pages/HomePage.jsx` を書き換え、`shopify.query()` で注文一覧を取得するだけの最小コードにした。

### 4. `shopify app dev` での動作確認 — 成功

`shopify app dev --store rice-market-dev.myshopify.com` を実行し、Preview URL（`https://admin.shopify.com/store/rice-market-dev/apps/<client_id>`）をブラウザで開いたところ、**管理画面の中に拡張機能がそのまま描画され、`shopify.query()` が実データを返した。**

ビルドログ：

```
royalty-dashboard successfully built in 954ms (25.6 KB original, ~9.0 KB compressed)
✅ Ready, watching for changes in your app │ Access scopes auto-granted: read_customers, read_metaobjects, read_orders, write_customers, write_metaobjects, write_products
```

**`read_orders` を追加した時点で、`shopify app dev` のプレビューでは「Access scopes auto-granted」に自動的に含まれ、追加の同意操作なしで `shopify.query()` が注文データを返した。** ただし、これは `shopify app dev` のdevモード特有の自動付与（dev storeかつアプリ開発者自身がストアを操作している状態でのプレビュー実行）であり、事前の懸念だった「`shopify app deploy` でアプリバージョンを作成し、インストール済みアプリとして本番運用する際の再同意フロー」とは別の仕組みである。**今回は `shopify app deploy` を実行していないため、deploy後の再同意が必要かどうかはこのDevストアに対してすら未検証のまま。** 本実装時に`shopify app deploy`→管理画面でアプリを開き直す、という経路で改めて確認する必要がある。

実際に描画された画面（`#1001`〜`#1004`の4注文、タグ・フルフィルメント状況・小計が正しく表示された）：

```
注文     タグ              フルフィルメント状況   小計
#1001    org:test-agency-b  FULFILLED             700.0 JPY
#1002    org:sakura         FULFILLED             5500.0 JPY
#1003    org:test-agency-b  UNFULFILLED           6000.0 JPY
#1004    org:sakura         FULFILLED             15000.0 JPY
```

使用したGraphQLクエリ（`shopify.query()` に渡したもの）：

```graphql
query RoyaltySpikeOrders($query: String!) {
  orders(first: 20, query: $query) {
    nodes {
      id
      name
      tags
      displayFulfillmentStatus
      currentSubtotalPriceSet {
        shopMoney { amount currencyCode }
      }
    }
  }
}
```

**つまり、注文のid・タグ・`displayFulfillmentStatus`・現在のsubtotal相当額（`currentSubtotalPriceSet.shopMoney`）を、App Home UI Extensionのフロントエンドコードから直接取得できることを実証した。** バックエンドへの往復は一切発生していない。

「発送済み」は `displayFulfillmentStatus` の値 `FULFILLED` で表される（`UNFULFILLED` が未発送）ことも実機で確認した。

### 5. `org:` タグの絞り込み — サーバーサイド検索クエリで可能、ただし構文に落とし穴あり

最初 `tag:'org:'`（部分一致のつもりで書いた検索式）を使ったところ、**該当なしで0件になった。** Shopify検索構文では `tag:'org:'` は「タグが完全一致で文字列 `org:` であるもの」を意味し、前方一致にはならない。

正しくは **`tag_prefix:org:`** を使う。これで `org:` から始まる全タグの注文を一括取得できることを確認した。

```
query: "tag:'org:'"            → 0件（誤り。部分一致にならない）
query: "tag_prefix:org:"       → #1001, #1002, #1003, #1004 すべて取得（正しい）
query: "tag:'org:sakura'"      → #1002, #1004（特定の組織だけに絞る場合はこちらを使う。引用符で囲んだ完全一致）
query: "tag_prefix:org: AND fulfillment_status:fulfilled"
                                → #1001, #1002, #1004（org:タグ × 発送済みのAND条件も機能）
query: "tag_prefix:org: AND created_at:>=2026-09-01 AND created_at:<2026-10-01"
                                → #1001, #1002（月次の範囲指定も機能）
```

**組織別・月別・フルフィルメント状況別のいずれも、GraphQL Admin APIの `query` 引数（サーバーサイド検索）だけで絞り込める。** クライアント側でのフィルタリングは不要（あるいは、取得後にJS側で集計処理をする分には引き続き行うが、絞り込み自体はサーバー側で完結する）。

[royalty-snapshot.md](./royalty-snapshot.md) で使っていた `tag:'org:test-agency-b'` という書き方自体は正しい（完全一致での絞り込み）。今回の`tag_prefix:`は「どの組織か問わず`org:`タグが付いた注文全体」を取りたい場合に必要になる新しい知見。

### 5b. `fulfillment_status:fulfilled` は一部発送済み（`PARTIALLY_FULFILLED`）を除外するか — 確認した

Issue #44の完了条件は「フルフィルメント状況が『発送済み』のものだけ」が対象であり、一部発送（`PARTIALLY_FULFILLED`）を集計に含めてよいかは実装上重要な分岐点になる。これを確認するため、2点注文を作成し、1点だけ発送（部分フルフィルメント）させた（`#1005`、`org:test-agency-b`、小計6000.0 JPY）。

```
#1005 の displayFulfillmentStatus: "PARTIALLY_FULFILLED"

query: "tag_prefix:org: AND fulfillment_status:fulfilled"
  → #1001, #1002, #1004 のみ（#1005は含まれない）

query: "tag_prefix:org: AND fulfillment_status:partial"
  → #1005 のみ
```

**`fulfillment_status:fulfilled` は `PARTIALLY_FULFILLED` を正しく除外し、完全に発送済み（`FULFILLED`）の注文だけを返すことを実機で確認した。** Issue #44の「発送済みの注文だけを対象に」という完了条件をこの検索式でそのまま満たせる。一部発送の注文を集計対象から除外する／別途表示する、といった実装判断は、この検索式を使えば追加のクライアント側ロジックなしで実現できる。

### 6. 用意したテストデータ

| 注文 | タグ | フルフィルメント状況 | 小計 | 作成方法 |
|---|---|---|---|---|
| #1001 | `org:test-agency-b` | FULFILLED（今回`fulfillmentCreateV2`で発送済みに変更。元はUNFULFILLED） | 700.0 JPY | 既存（[royalty-snapshot.md](./royalty-snapshot.md)で作成済み） |
| #1002 | `org:sakura` | FULFILLED | 5500.0 JPY | 既存（出自不明の過去テスト注文。今回`tagsAdd`で`org:sakura`を付与） |
| #1003 | `org:test-agency-b` | UNFULFILLED | 6000.0 JPY | 今回新規作成。下書き注文（顧客: `ricetest@gmail.com`）→`draftOrderComplete` |
| #1004 | `org:sakura` | FULFILLED | 15000.0 JPY | 今回新規作成。下書き注文（顧客: `ricetest2@gmail.com`）→`draftOrderComplete`→`fulfillmentCreateV2`で発送済みに |
| #1005 | `org:test-agency-b` | PARTIALLY_FULFILLED | 6000.0 JPY | 今回新規作成。2点の下書き注文→`draftOrderComplete`→`fulfillmentCreateV2`で1点のみ発送（部分フルフィルメントのテスト用） |

2つの組織（`org:test-agency-b`、`org:sakura`）、発送済み/未発送/一部発送が混在する状態を作れた。

### 7. 遭遇したハマりどころ

- **`draftOrderComplete`が購入ゲート（Cart Validation Function）にブロックされる。** 顧客を紐付けていない下書き注文を完了しようとすると、`org-tag-gate` のバリデーションにより `"このストアは登録された技能実習生のみ購入できます..."` というuserErrorで失敗する。`draftOrderUpdate`で`purchasingEntity.customerId`に`member`タグ付きの既存顧客を指定してから`draftOrderComplete`する必要がある。
- **CLIのスコープ追加は、都度`shopify store auth --scopes "..."`で再認証が必要。** `draftOrderCreate`には`write_draft_orders`、`fulfillmentOrders`の読み取りや`fulfillmentCreateV2`には`read_merchant_managed_fulfillment_orders`/`write_merchant_managed_fulfillment_orders`（および`*_assigned_fulfillment_orders`）が追加で必要だった。足りないスコープで実行すると`Access denied for <field>`という明確なエラーが返るので、エラーメッセージ通りにスコープを追加して再認証すればよい。
- **`shopify store execute`はデフォルトでmutationを拒否する。** `--allow-mutations`フラグが必須（安全装置として機能している）。
- CLIでの`shopify store auth`再認証は、スコープを追加しても対話的なブラウザ同意画面が表示されず、即座に完了した（開発者自身がストアのオーナーであるため自動承認されたとみられる）。これは「App Home UI Extension側でのスコープ追加後の再同意」とは別の仕組み（CLIのstore-level認証）であることに注意。

### 8. バンドルサイズ

`royalty-dashboard successfully built in 954ms (25.6 KB original, ~9.0 KB compressed)`。圧縮後9.0KBで、上限64KBに対して余裕があった。GraphQLクエリと集計ロジック程度のコード量であれば、サイズ制約が問題になる兆候はない。

## 判定: 可（実証済み）

**Issue #44を「App Home UI Extension + `shopify.query()`によるDirect API access」で、サーバーもサーバーレス基盤も一切使わずに実装できることを、`shopify app dev`のDevストアプレビューで実証した。** 注文のid・タグ・`displayFulfillmentStatus`・現在のsubtotal額を拡張機能のフロントエンドコードから直接取得でき、`tag_prefix:org:`によるサーバーサイド検索で組織横断の絞り込みも、`tag:'org:組織名'`で特定組織への絞り込みも、`fulfillment_status:fulfilled`（`PARTIALLY_FULFILLED`を正しく除外する）や`created_at`範囲との組み合わせも機能する。バンドルサイズも余裕がある。この判定は**`shopify app dev`のプレビュー実行での検証**に基づく。拡張機能を`shopify app deploy`でデプロイしてインストール済みアプリとして動かした状態ではまだ検証していない。

残っている未確認事項（今回のスコープ外）:
- **`shopify app deploy`後の再同意フロー。** 今回は`shopify app dev`のdevモード自動付与（`Access scopes auto-granted`）で`read_orders`へのアクセスが得られたが、これは「`shopify app deploy`でアプリバージョンを作成し、管理画面でアプリを開き直して本番同様にインストール・利用する」経路とは別の仕組み。このDevストアに対してすら`deploy`後の再同意は未検証で、ましてや友人の本番ストアでどうなるかは別途確認が要る
- `read_all_orders`申請（既述の通り、60日超の注文を読む本番運用で必要になる。別途Partner Dashboardから申請要）
- #8（注文への派遣元自動タグ付け）と組み合わせた、実運用に近いデータ量での動作
- **ページネーション未検証。** 今回は`orders(first: 20, ...)`のみで、カーソルを使った次ページ取得は試していない。月次集計の実運用では1つの派遣元・1ヶ月で20件を超える注文が出る可能性があり、その場合は`pageInfo`/`endCursor`を使ったページング実装が必要になる
- **`currentSubtotalPriceSet`が返金を反映するかは未検証。** 今回用意したテスト注文はいずれも返金されていないため、返金後に金額が減額されるかどうかは実データで確認できていない（設計方針の「返金後の最新値」という前提の裏取りがまだ済んでいない）
- **`application_url`が未設定のプレースホルダ（`https://shopify.dev/apps/default-app-home`）のままで`shopify app deploy`が通るか。** 今回は`shopify app dev`のみを実行し、`deploy`は試していないため、プレースホルダのままでデプロイ可能かは未確認

## 本実装・実機検証（2026-10-02、Issue #44 本実装）

上記スパイクを踏まえ、`HomePage.jsx`を本実装に書き換え、集計ロジックを`src/aggregate.js`・検索クエリ組み立てを`src/searchQuery.js`に純粋関数として切り出した。`shopify app dev`のDevストアプレビューで実機検証している（`shopify app deploy`は今回も未実行）。

### 1. ブリーフの前提が実データと食い違っていた点

依頼文では「テストデータはすべて今月（10月）作成」とされていたが、`shopify store execute`で`createdAt`を確認すると実際には9月・10月にまたがっていた。

```
#1001 org:test-agency-b createdAt=2026-09-20 FULFILLED      700.0 JPY
#1002 org:sakura        createdAt=2026-09-25 FULFILLED      5500.0 JPY
#1003 org:test-agency-b createdAt=2026-10-02 UNFULFILLED    6000.0 JPY
#1004 org:sakura        createdAt=2026-10-02 FULFILLED      15000.0 JPY
#1005 org:test-agency-b createdAt=2026-10-02 PARTIALLY_FULFILLED 6000.0 JPY
```

これは好都合だった。月指定フィルタを「本物の月またぎデータ」で検証できたため。`created_at`の範囲指定は、バレ日付（`created_at:>=2026-09-01`）でもJSTオフセット明示（`created_at:>='2026-09-01T00:00:00+09:00'`）でも同じ結果になることを確認したが、どちらのタイムゾーン解釈が既定かは非公開のため、月末・月初の取りこぼしを避ける目的で**常に`+09:00`を明示する実装にした**（`src/searchQuery.js`の`monthRangeJst`）。このDevストアのテストデータには日付境界（JST深夜0時前後）の注文がなく、バレ日付との違いが出るケースそのものは実機では再現できていない。

### 2. `dispatch_org`メタオブジェクトの実データ確認

`read_metaobjects`スコープを使い、GraphiQL（`shopify app dev`が起動するローカルGraphiQLサーバー）経由で確認した。

```graphql
query { metaobjectDefinitions(first: 20) { nodes { id type name fieldDefinitions { key } } } }
```
```json
{"type": "app--425654222849--dispatch_org", "name": "派遣元組織", "fieldDefinitions": [{"key":"org_name"},{"key":"org_code"},{"key":"active"}]}
```

`type`文字列にアプリのクライアントID（`425654222849`）がそのまま埋め込まれており、**インストール先ストアが変われば変わる値**であることを確認した。そのため実装では`type`をハードコードせず、`metaobjectDefinitions`を名前（「派遣元組織」）で検索して解決している。

登録済みの派遣元は以下の2件のみだった。

```
agency-sakura                              org_code=sakura  active=true  org_name=さくら協同組合
app--425654222849--dispatch-org-xwj283o5   org_code=midori  active=true  org_name=みどり事業協同組合
```

**`test-agency-b`はマスタに存在しない。** スパイクのテストデータ作成時に注文タグとしてのみ使われ、`dispatch_org`メタオブジェクトとしては一度も登録されていなかったと見られる。これは「マスタ未登録・無効化済みの組織でも過去月のロイヤリティを確認したい」というケースの実例になったため、画面の派遣元指定は**ドロップダウン（`active`なマスタ登録組織のみ）＋直接入力（常時表示）の両対応**にした。`shopify store execute`（CLIのstore-level認証）では同じ`metaobjectDefinitions`クエリが空配列を返したが、これはCLI認証のスコープ一覧に`read_metaobjects`が含まれていないためと見られ、エラーにはならず静かに空配列になる点に注意（アプリ自身のセッション経由なら問題なく読める）。

### 3. BigIntはビルドが通っても実機で描画されなくなる（重要な発見）

集計ロジック（`aggregate.js`）の金額合算は、浮動小数点誤差を避けるため最初BigIntで実装した。`shopify app dev`のビルドは次の警告付きで成功した。

```
▲ [WARNING] Big integer literals are not available in the configured target environment ("es2015") and may crash at run-time [bigint]
royalty-dashboard successfully built in 276ms (31.0 KB original, ~10.7 KB compressed)
✅ Updated dev preview on rice-market-dev.myshopify.com
```

ところが実際に管理画面でプレビューを開くと、**拡張機能の画面が一切描画されない（真っ白）**という状態になった。コンソールにも（クロスオリジンの拡張iframeのため）エラーは出ず、原因特定に時間がかかった。BigIntをやめて、金額文字列を「2桁固定小数点のNumber整数」に変換する実装（`parseFloat`は使わず文字列分割で整数化）に書き換えたところ、ビルド警告が消え、画面も正常に描画されるようになった。

**結論: このApp Home UI Extensionの実行環境ではBigIntリテラル構文が使えない（ビルドの警告だけでなく実機で致命的に効く）。** esbuildの警告は「crash at run-time」だが、実際には実行時エラーというよりスクリプト自体が機能しなくなる形で現れた。今後このExtension内で金額計算をする際はBigIntを避け、Numberの整数演算（丸め誤差が実害にならない桁数設計）を使うこと。

なお、置き換え後の実装は「率を掛けた後に一度丸め、最後にもう一度丸める」という2段階丸めになっている箇所がある（`aggregate.js`内コメント参照）。小計がすべて整数円（Shopifyの`shopmoney amount`が`"xxx.0"`のみ）である前提では1段階目は常にno-opになり実害はないが、将来的に小数円（セント相当）を持つ通貨を扱うようになった場合は境界値（例: 厳密に0.5円ちょうどのケース）で結果がズレる可能性があるため、コードにその前提を明記した。

### 4. 実機シナリオ検証結果

`shopify app dev`のプレビューで、以下をすべてブラウザ操作で確認した（スクリーンショットで確認。ドロップダウンは4で後述の制約あり）。

| 派遣元 | 月 | 期待 | 実機結果 |
|---|---|---|---|
| test-agency-b（直接入力） | 2026年9月 | #1001のみ、700円 | 一致。ロイヤリティ11円（700×1.5%=10.5→四捨五入） |
| test-agency-b（直接入力） | 2026年10月 | 0件（#1003未発送・#1005一部発送を除外） | 一致。「対象の発送済み注文は見つかりませんでした。」 |
| sakura（直接入力） | 2026年9月 | #1002のみ、5,500円 | 一致。ロイヤリティ83円（5500×1.5%=82.5→83） |
| sakura（直接入力） | 2026年10月 | #1004のみ、15,000円 | 一致。ロイヤリティ225円（15000×1.5%=225） |

不正な組織コード（`sakura' OR 1=1`）を直接入力欄に入れた場合は、検索クエリを組み立てずに「組織コードは半角英数字とハイフンのみで入力してください。」というエラーバナーを表示することも確認した（検索構文インジェクション対策）。

### 5. ドロップダウン単体の実機確認は未達

派遣元ドロップダウン（`s-select`）に`sakura`・`midori`の2件が選択肢として描画されていることは`find`ツールのアクセシビリティツリーで確認できた。しかし、選択肢を選ぶ操作はブラウザ自動操作ツールから2通り試して両方とも失敗した。

1. 座標クリックで開いてから選択肢の座標をクリック（ネイティブ`<select>`相当のUIはOSレベルのオーバーレイになりスクリーンショットに写らず、座標が特定できない）
2. `find`ツールで選択肢要素（`さくら協同組合（sakura）`）の参照（ref）を取得し、`computer`ツールの`left_click`に`ref`を直接渡してクリック（クリック自体は成功と報告されるが、`派遣元`の表示は「選択してください」のまま、`組織コード（直接入力）`欄も空のまま変化しなかった）

ドロップダウンと直接入力テキストフィールドは実装上まったく同じ`onChange`ハンドラ（同じ`orgCode` state）を共有しているため、直接入力側で確認した動作がそのまま当てはまると考えられるが、**ドロップダウンの選択操作そのものを人間の手でクリックして確認する作業は残っている。**

### 6. ユニットテスト

`apps/shopify-app/extensions/royalty-dashboard/`に`vitest`を追加し（`org-tag-gate`と同じテストランナー）、`tests/aggregate.test.js`・`tests/searchQuery.test.js`・`tests/fetchOrders.test.js`を作成した。フィクスチャは`tests/fixtures/*.json`に配置し、`org-tag-gate`と同じ置き場所の規約を踏襲した（ただしフィクスチャの中身は関数ランナー形式ではなく、素の注文配列）。

```
$ npx vitest run
 ✓ tests/searchQuery.test.js (6 tests)
 ✓ tests/fetchOrders.test.js (4 tests)
 ✓ tests/aggregate.test.js (6 tests)
 Test Files  3 passed (3)
      Tests  16 passed (16)
```

`aggregateOrders`は0件、複数注文の合算（金額はDevストアのsakura実注文2件の小計を借用。ただし#1002は9月・#1004は10月のため、この組み合わせが1回の月指定クエリで返ることはない）、小数小計の合算（133.33+66.67=200.00）、四捨五入の境界（0.5円ちょうど→1円）、ロイヤリティ率0、注文配列がnull/undefinedでも例外を投げないケースをカバーしている。

ページネーション（`fetchAllFulfilledOrders`）は`shopify.query`をグローバルから直接呼ばずに`queryFn`として引数で受け取る形に切り出し、スタブの`queryFn`で以下をユニットテストした（Devストアには1派遣元あたり数件しか注文がなくページをまたぐ実データで検証できないため、ロジックのみをスタブで検証している）。

- 複数ページをカーソル（`pageInfo.endCursor`）で辿って全件結合すること、2回目の呼び出しに1回目の`endCursor`が引き継がれること
- 安全上限ページ数（`MAX_ORDER_PAGES`）に達したら打ち切り、`truncated: true`を返すこと（無限ループ防止）
- 途中のページで`errors`が返ったら例外を投げ、部分結果を黙って返さないこと
- 0件のとき空配列を返すこと

### 7. バンドルサイズ

```
royalty-dashboard successfully built in 56ms (30.9 KB original, ~10.7 KB compressed)
```

前回スパイク（9.0KB）より増えたが、上限64KBに対して十分な余裕がある。

### 8. 本実装でも残った未検証事項

- **ページネーションは、ロジックをユニットテストで検証したが、実データでの多ページ取得は未検証。** `orders(first: 250, after: $cursor)`のループ・`pageInfo.hasNextPage`・安全上限（20ページ=5,000件相当、超過時はUIに警告バナー）は`fetchOrders.test.js`でスタブの`queryFn`を使い動作確認済み（上記6参照）。ただしDevストアには1派遣元あたり数件しか注文がなく、実際のAdmin APIレスポンスが複数ページに跨る状況そのものでは検証できていない。
- **`shopify app deploy`後の再同意フロー。** 引き続き未検証（スパイク時と同じ）。
- **`read_all_orders`申請は未着手。**
- **#8（注文への派遣元自動タグ付け）と組み合わせた実運用に近いデータでの動作。**
- **ドロップダウン単体の操作。**（上記5）

## 判定（本実装後）: 可。ただし本番運用には#8と`read_all_orders`申請が必要

Issue #44の3つの完了条件（発送済み注文の月次・派遣元別集計／ロイヤリティ額のフロントエンド完結計算／月・派遣元を指定する画面）は、いずれもDevストアの実データで実機確認できた。一方で、本番運用を開始するには#8（注文への派遣元自動タグ付け）の実装と`read_all_orders`スコープの承認申請が別途必要であり、このIssueはクローズしていない。
