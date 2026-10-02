# Customer Accounts（顧客アカウント）の仕様

## legacy（classic）customer accounts は廃止済み

2026年2月26日付で非推奨となり、新規ストアでは利用できない。
出典: https://shopify.dev/changelog/legacy-customer-accounts-are-deprecated

この結果、従来の定番手法だった「Liquid の `/account/register` にカスタム登録フォームを置き、hidden field で `customer[tags]` に派遣元を埋め込む」は使えない。

**廃止は2段階。** 2026年2月時点で終了したのは「新規ストア」「legacyを使っていなかった既存ストア」への提供のみで、既にlegacyを使っていた既存ストアの完全廃止（Sunset）日は別途アナウンス予定（未確定）。rice-marketは新規ストアなので、この猶予の有無に関わらずlegacyは最初から選択肢にない。
出典: https://shopify.dev/docs/apps/build/customer-accounts（Product roadmap）、note記事（下記）

## Howdyアプリの実機評価（2026-10-02、Issue #47）: 現行構成を維持する

note記事由来の「未検証・二次情報」だった内容を、rice-market-devに実際にインストールして検証した。正式名称は **Howdy NewCustomer Registration**（macro micro Inc、Built for Shopify認証取得済み）。料金は顧客数に応じてBasic $4.99/月（1,000人まで）〜Plus $99.99/月（15,000人まで）、開発ストアは全機能無料。
出典: https://apps.shopify.com/customer-account-app

### 分かったこと

1. **顧客タグはネイティブに付与できる（Flow不要）。** フォーム設定画面に「顧客タグ・リダイレクト設定」セクションがあり、「登録完了タグ」欄に設定した値が登録完了時に自動付与される。カンマ区切りで複数タグを指定でき、実際に `member,org:sakura` の入力を受け付けることを確認した（保存はせず破棄）。当初はApp Store説明文の「Shopify Flowを使った運用もご相談いただけます」という文言から「タグ付与にFlowが必須では」と疑っていたが、これは外れだった。
2. **ただし「入力値に応じて動的にタグを変える」にはFlowが必要。** 公式Q&A（「誕生日施策で誕生月の顧客タグを付ける方法」）に、Howdyで取得した値を元にタグを変えるには別途Shopify Flowが要る、と明記されている。登録完了タグは**フォームごとに固定の1セット**であり、同じフォーム内で入力値ごとに異なるタグへ分岐させる機能ではない。
   出典: https://docs.channel.io/howdy-app/ja/categories/QA-95e315c9
3. **フォームは複数作成できるが、URLで来訪者ごとに出し分ける仕組みが存在しない。** 「フォームを作成」から追加のフォームを作ることは実際にでき、料金プランにもフォーム数の制限記載はない。しかしフォームは `shopify.com/authentication/...` という**共有の認証フロー**に注入される形で、どのフォームを誰に見せるかを決める導線（URLパラメータ、専用リンク等）がヘルプセンターのQ&A（14件）のどこにも見当たらなかった。一般設定にある「会員登録フォームの設置タイミング」も「ログイン前」「ログイン後」の2択のみで、派遣元ごとの振り分けとは無関係。**複数フォームを作れても、派遣元ごとに出し分ける手段がない以上、この用途には使えない公算が高い。**
4. **派遣元固有の秘匿URLという概念自体がない。** 現行構成（Shopify Forms + Page）の秘匙性は `/pages/signup-<token>` というPage固有のURLに由来するが、Howdyのフォームは全顧客共通の認証入口（メールアドレス→6桁コード）の中に挟み込まれる。「セルフサービスのサインインだけでは購入者を限定できない」（本ファイル後述、実証済み）という既存の制約は、Howdyを挟んでも変わらない。
5. `/pages/signup/<token>` のような2階層パスのURLも実現しない（Howdy経由でも `/account/...` 配下にとどまる）。`docs/research/signup-url-handle.md` の「2階層パスはHydrogen以外に実現手段がない」という判定は変わらない。

検証後、rice-market-devからHowdyアプリはアンインストール済み。

### 結論: 現行構成（Shopify Forms + Page）を維持する

Issue #42の完了条件（hidden input経由の招待コード→タグ付与の実機確認）は、確認すべき問いそのものを「ネイティブにタグ付与できるか」（できる）から「派遣元ごとにURLで出し分けられるか」（できない）に置き換えて評価した。現行構成はPage handleによる派遣元固有URLと、Formsのタグ欄によるネイティブなタグ付与の両方を無料で実現しており、既に実証済み（`tags: ["member", "org:sakura", "shopify-forms-1161577"]`）。Howdyが強みとするメタフィールド管理・プロフィールページのカスタマイズ・住所自動入力は、rice-marketの要件には不要。月額コストを払って切り替える理由はない。

## Legacy と 現行、カスタマイズできること・できないこと（2026-10-02 再調査）

### アーキテクチャそのものの違い

Legacy では、テーマが `customers/register` / `customers/login` / `customers/account` など7種のLiquidテンプレートを持ち、サインイン・登録画面はテーマの一部として自由に改変できた。現行ではこれらのテンプレートは廃止され、**customer accountsはテーマから完全に独立して動作する**。テーマからこれらのテンプレートを削除すると、自動的に現行方式へアップグレードされる——つまり「段階的に移行する」のではなく「テーマ側の担当範囲がまるごと無くなる」という設計変更である。
出典: https://shopify.dev/docs/storefronts/themes/architecture/templates

### カスタマイズ可否 総覧

| 項目 | Legacy | 現行 | 現行での実現方法 |
|---|---|---|---|
| 登録・サインイン画面のHTML構造/フィールド構成 | 自由（Liquid） | 不可。Shopifyが別ドメイン（`shopify.com/authentication/...`）で完全ホスト | — |
| 登録時のカスタムフィールド追加（招待コード等） | hidden fieldで実現 | 不可。ロードマップ上「Collect customer fields after sign-in」は2026年Q4予定、未リリース | — |
| 登録を招待制・承認制にする | テーマ側で作り込み可能だった | 不可。該当する管理画面設定が存在しない（下記「セルフサービスのサインインだけでは購入者を限定できない」で実機確認済み） | — |
| サインイン・登録フローへのアプリ拡張 | 非対応 | 非対応。Customer Account UI Extensionsのtarget一覧に sign-in/registration 系は存在しない（Order index・Order status・Profile・新規ページのみ） | — |
| 配色・フォント・角丸・背景画像・favicon | テーマのCSS | 可能 | Checkout and Accounts Configuration API（Admin GraphQL） |
| ヘッダーのアカウントアイコンの見た目 | テーマ側で自由 | 限定的。スロットとCSSカスタムプロパティのみ、構造は不変 | `<shopify-account>` コンポーネント |
| 注文一覧・注文詳細・プロフィールページへの要素追加 | 不可 | 可能 | Customer Account UI Extensions（`render-after`, `block.render`, `announcement.render` 等） |
| 全く新しいページの追加（ウィッシュリスト等） | 不可 | 可能 | Full-page extension（`customer-account.page.render`） |

### 会員登録フロー

- **Legacy**: `/account/register` がテーマのLiquidテンプレートとして存在し、フィールド追加・バリデーション・リダイレクト先など自由に実装できた。
- **現行**: サインイン・登録は `shopify.com/authentication/.../login` という別ドメインに遷移し、見出しは "Sign in or create an account"（下記セクションで実機確認済み）。方式はメールアドレス入力 → 6桁の認証コード、というパスワードレス方式（下記Issue #6の実機検証で確認済み）。新規顧客か既存顧客かの判定も含め、全てShopify側のロジックで完結し、テーマやアプリが途中に割り込む余地がない。
- Howdyのようなサードパーティアプリ（実機検証済み、下記参照）は、この**共有の認証フロー自体の中**に自前のフォームを挿入し、新規/既存を判別して登録フォームかサインイン導線かを出し分けている。Shopify標準のフローそのものを書き換えているわけではなく、派遣元ごとに異なる入口を用意する機能でもない。

### ストアごとのアカウントページ

- **`<shopify-account>` コンポーネント**: テーマのヘッダーに設置するアバター。クリックでアカウントシート（ドロワー）が開き、サインイン方法（パスワードレス・Shop自動認識・ソーシャルログイン）や注文・プロフィールへのリンクを表示する。
  - できる: CSSカスタムプロパティ（`--shopify-account-*`）での配色調整、`signed-out-avatar` スロットでのアイコン差し替え
  - できない: コンポーネントの構造・機能自体の変更。公式に「Shopify controls this component and can update it independently of your theme」と明記されている
  出典: https://shopify.dev/docs/storefronts/themes/customer-engagement/account-component, https://shopify.dev/docs/api/storefront-web-components/components/shopify-account
- **Order index / Order status / Profile ページ**: Customer Account UI Extensionsの各種targetで要素を追加できる。公式が挙げる用途例は、マーケティング配信のオプトイン、利用規約への同意、ギフトラッピング等のアドオン選択など。
  出典: https://shopify.dev/docs/apps/build/customer-accounts
- **新規ページの追加**: Full-page extension（`customer-account.page.render`）で、ウィッシュリストやサブスクリプション管理のような、既存ページに収まらないページを丸ごと追加できる。
  出典: https://shopify.dev/docs/apps/build/customer-accounts/full-page-extensions
- **ブランディング**: Checkout and Accounts Configuration API（Admin GraphQL）で、チェックアウト・サインイン・アカウントページを横断的にスタイリングできる（背景、ボーダー、カラー、角丸、パディング、シャドウ、背景画像、フォーム部品のスタイル、favicon等）。必要スコープは `read_checkout_and_accounts_configurations` または `read_checkout_settings`、加えて `manage_checkout_settings` 権限とショップ側の機能アクセス。
  出典: https://shopify.dev/docs/apps/build/checkout/styling, https://shopify.dev/docs/api/admin-graphql/2026-07/objects/CheckoutAndAccountsConfigurationBrandingSignInMain

### rice-marketへの影響（結論は変わらない）

見た目（配色・ロゴ・背景画像等）はAPI経由でかなり自由に調整できるが、**「誰が登録できるか」という機能面の制御は現行customer accountsのどの拡張ポイントにも存在しない。** この境界線が、Shopify Forms + Pageという現行アーキテクチャ（Issue #42で実装）を選んだ理由として変わらず残る。

## セルフサービスのサインインだけでは購入者を限定できない（実証済み）

### 目的

未登録のメールアドレスを持つ第三者が、派遣元ごとの登録URLを経由せずに購入まで到達できてしまうかどうかを確かめた。ここが通ってしまうと、組織別登録URLは実質的に意味を持たなくなる。

### 手順と結果

設定 > チェックアウト から「チェックアウト前に、お客様のアカウントへのログインを必須にする」を有効化した。

```json
{
  "customerAccounts": "REQUIRED",
  "customerAccountsV2": {
    "customerAccountsVersion": "NEW_CUSTOMER_ACCOUNTS",
    "loginRequiredAtCheckout": true
  }
}
```

- 設定 > お客様アカウント > 認証 の画面には、サインイン方法の選択（Shop / Google / Facebook）のみがあり、「誰がアカウントを作成できるか」を制限する設定は存在しない
- `loginRequiredAtCheckout: true` の状態でサインイン導線をたどると `shopify.com/authentication/.../login` に遷移し、見出しは "Sign in or create an account"。招待コードや事前登録の確認を求める要素はない
- 受信可能なメールアドレスで実際に最後まで通したところ、事前の招待や承認なしに顧客レコードが自動生成され、チェックアウトまで到達した

```json
{
  "id": "gid://shopify/Customer/9911995367510",
  "email": "koji.19960810+ricetest@gmail.com",
  "state": "DISABLED",
  "tags": [],
  "verifiedEmail": true
}
```

`tags` は空、つまり派遣元との紐付けは何もない状態でチェックアウトに進めた。

### 結論

**`loginRequiredAtCheckout: true` は「限られたユーザーしか買えない」の実現手段にならない。** ログインを必須にしても、そのログイン自体が誰にでも開かれているため、ゲートとして機能しない。Shopify の現行 customer accounts はセルフサービス前提の設計であり、管理画面にアカウント作成を制限する設定は用意されていない。

ただし「Shopify では限定販売ができない」という意味ではない。購入の可否はチェックアウト側の [Cart and Checkout Validation Function](./cart-validation-function.md) で止められる。

## 事前作成した顧客レコードと初回サインインの結合（実証済み）

### なぜ確認が必要だったか

実際の運用では、派遣元ごとの登録フォームで先に顧客レコードを作り、タグを付け、その後で本人が初めてサインインする。この順序が通らなければ、App Proxy の登録フォームを実装しても設計ごと成立しない。特に懸念したのは、初回サインインが既存レコードと結びつかず**別の顧客レコードが重複して生成される**ケースである。

### 手順

1. Admin API の `customerCreate` で顧客を作成し、`member` と `org:test-agency-b` を付与（顧客数 4 → 5）
2. 本人がそのアドレスで**初めて**サインイン
3. 商品をカートに追加

### 結果: 結合する。重複しない

- 顧客数は**5のまま**。重複レコードは生成されなかった
- ID も `createdAt` も Admin API で作成した時点のものが維持された
- `verifiedEmail` が `true` になり、初回サインインが既存レコードに吸収されたことが分かる
- タグも維持され、Validation Function から `isMember: true` として見えた

**「登録フォームで顧客を作成 → タグ付与 → 本人が初回サインイン → 購入可能」という一連の流れが成立する。**

## Shopify Forms 経由で作成した顧客の結合（未実証・推論）

サーバーレス構成（[serverless-options.md](./serverless-options.md) の構成B/C）で Shopify Forms を登録フォームとして使う場合、Forms 経由で作成した顧客が初回サインインと正しく結合するかが前提になる。

フォーム編集画面には「フォームを送信すると、お客様が作成されます。」と明記されており、マーケティング購読者だけでなく顧客レコードが作られることは確認した。しかし **Forms 経由の作成から初回サインインまでを通した実機検証は未実施**である。

### 試みたこと（未検証で終わった経緯）

1. Forms アプリのインラインフォーム編集画面で「ランディングページを作成」ボタンを複数回クリックしたが、`/pages` を確認しても新規ページは作成されなかった
2. 「テーマエディタに移動する」ボタンをクリックすると画面全体が操作不能なオーバーレイで固まり、リロードでのみ復帰した
3. プレビューパネルに直接入力・送信を試行したが、顧客数（`customersCount`）は変化せず、見た目だけのモックプレビューだった

Forms アプリの編集画面はクロスオリジンiframeで描画されており、アクセシビリティツリー（`find` / `get_page_text`）から内部要素が見えないため座標クリックに頼らざるを得ず、これが繰り返し不安定だった。**Shopify のプラットフォーム仕様ではなく、開発ストアのブラウザ埋め込みUIが不安定だったことが原因**であり、機能自体が使えないという意味ではない。

### 未検証のまま採用する結論

**リスクは低いと判断し、「成立する」とみなして先に進む。** 根拠:

- Forms は公式アプリで、内部的には標準の Customer オブジェクト作成 API（`customerCreate` 相当）を呼んでいると考えられる
- 既に実証済みなのは「Admin API で作成した顧客が初回サインインと正しく結合する」こと（上記参照）
- サインイン時の結合ロジックは、Customer レコードがどの経路で作られたかを見ておらず、**メールアドレスが一致する既存レコードがあるか**だけで判定していると考えられる。したがって作成経路が Admin API 直叩きか Forms かは、結合可否に影響しないはずである

ただしこれは仕組みからの推論であり、実機での確認ではない。**本番構築時に、実際に Forms 経由で顧客を1件作成し、初回サインインまで通しておくことを強く推奨する。** もし結合しない事象が見つかった場合は、実証済みの App Proxy 方式（構成A）に切り替える。

## 続報（2026-09-24、Issue #6）: ランディングページ作成は成立する。ブロック配置がボトルネック

上記「未検証で終わった経緯」の1（ランディングページが作成されない）は、**今回は再現しなかった**。同じ「ランディングページを作成」ボタンから `sakura-signup` というタイトル・URLで作成し、`/pages/sakura-signup` が実際に解決することを確認した（ライブテーマ・Dawnプレビューテーマ双方）。前回「作成されなかった」のは、当時のブラウザ埋め込みUIの不安定さによる見かけ上の失敗だった可能性が高い。

### 今回できたこと

1. `sakura-signup`（Form ID: 1161577、インラインフォーム）のタグ設定を編集し、保存。最終的なタグは `shopify-forms-1161577`, `member`, `org:sakura`（旧命名 `org:agency-sakura` は削除）
2. 「新しいランディングページを作成」から `/pages/sakura-signup` を作成。実際にページが存在し、タイトルが表示されることを確認

### 今回もできなかったこと・新しい問題

**テーマエディタでのアプリブロック配置が、クリック自体を受け付けない状態になった。** これは「オーバーレイで固まる」という前回の症状とは別で、今回はオーバーレイの表示すらなく、画面は正常にレンダリングされている（プレビュー・サイドバーとも描画済み）にもかかわらず、サイドバーのどの要素（「ページ」セクションの選択、「Add section」ボタン、ツールバーの各アイコン、終了ボタン）をクリックしても一切反応しない。

切り分けとして、同一ブラウザの別タブ（管理画面の通常ページ、iframeではない）でクリックしたところ正常に反応した。**問題はこのタブ・このテーマエディタセッションに限定されており、Shopify全体やブラウザ自体の問題ではない。** ページの再読み込み、`shopify app dev` トンネルの再起動でも解消しなかった。タブを閉じて新規タブで開き直すことで復帰するかは未検証（本セッションではこの時点で中断）。

### 現状のギャップ

`sakura-signup` ページは存在するが、Shopify Forms の「Inline form」ブロックがまだ配置されていない。ページを開いても購読フォーム（デフォルトの「Subscribe to our emails」）しか表示されず、会員登録フォームは表示されない。**Issue #6 完了には、このブロック配置が必須。**

### 副次的に見つかった2点（要対応・優先度は#6のブロック配置より低い）

1. **フォームの文言が英語のまま。** タイトル "Sign up"、説明文 "Complete the form to sign up."、ボタン "Submit" など。技能実習生が読む前提の画面としては要日本語化（あるいは多言語対応、Issue #15の範囲）。フォーム編集画面には「翻訳が不足しています」の警告があり、Vietnameseが「非公開」の未翻訳ロケールとして存在した
2. **「Shop で続行する」（Continue with Shop）がオンになっている。** Shopのワンタップログイン経由で登録すると、このフォームが設定するタグ付与ロジックを迂回する可能性がある（未検証）。もし迂回するなら、`member`/`org:sakura` タグが付かないまま顧客が作成され、購入ゲート（Issue #7）で弾かれるか、あるいは意図せず素通りするかの検証が必要。**実際にフォーム送信を通す際に、この動線もオフにするか検証してから判断する。**

## 解決（2026-09-24、Issue #6）: ブロック配置は成立。Forms経由の顧客作成〜初回サインイン結合を実機で実証

### ブロック配置のハマりどころ（実際に発生）

テーマエディタでのクリック不通問題は、ユーザー自身のブラウザで操作したところ問題なく操作できた。**問題は本セッションのブラウザ自動操作環境固有のものであり、Shopifyプラットフォームやユーザー環境の問題ではなかった。**

ただし、実際の配置作業で新たなハマりどころが見つかった。「アプリ」タブから Forms ブロックを追加する際、サイドバーの **「ヘッダー」グループ**（全ページ共通のセクション群）の下に追加してしまうと、**サイト全体（ホームページ・商品ページ含む全ページ）にフォームが表示されてしまう**。正しくは **「Template」グループ**（そのページの `page` テンプレート専用のセクション群）に追加する必要がある。サイドバーの見た目上はどちらのグループの「Add section」も同じ「アプリ」タブ・同じ「Forms」ブロックが選べるため、間違えやすい。**本番構築時・他の派遣元フォーム作成時も同じ手順を踏むため、必ず「Template」グループ側に追加すること。**

### 実機検証: Forms経由の顧客作成 → タグ付与 → 初回サインイン結合

`docs/research/customer-accounts.md` の「未検証のまま採用する結論」（上記）で保留にしていた検証を、実際に完了させた。

1. `sakura-signup` ページ（`/pages/sakura-signup`、`org:sakura` タグ設定済みのForm）から、新規メールアドレス（`koji.19960810+ricetest6@gmail.com`）でフォームを送信 → 「Success. Thank you. The form has been submitted.」
2. Admin APIで顧客レコードを確認:
   ```
   id: gid://shopify/Customer/10150015991894
   tags: ["member", "org:sakura", "shopify-forms-1161577"]
   ```
   想定どおり `member` と `org:sakura` が自動付与されていた
3. 同じメールアドレスで初回サインイン（新 customer accounts、メール認証コード方式）を実施
4. サインイン後、Admin APIで再確認 → **顧客IDが同一（`10150015991894`のまま）、`verifiedEmail: true`、重複レコードは生成されなかった**
5. サインイン状態のまま商品ページで「Add to cart」→ エラーなく成功（購入ゲートが `member` タグを正しく認識）

**結論: Forms経由で作成した顧客は、本人の初回サインインと正しく結合する。重複しない。** これにより「未検証・推論」だった事項が実証済みに変わり、構成B（Shopify Forms + Shopify Flow）の成立に必要な前提の最後のピースが埋まった。

### 未検証のまま残る事項

- 「Shop で続行する」経由の登録がタグ付与を迂回するかどうかは、今回の送信では検証していない（メール/名前の通常フォームで送信したため）。優先度は低いが、未検証のまま

## 解決（2026-09-29、Issue #15）: フォームの多言語化。iframeクリック不通は再現せず、正しい翻訳UIの手順を確立

前回「フォームの文言が英語のまま」として残していた課題を対応。**今回はiframeへのクリック・入力が一貫して正常に動作し、以前のセッションで見られた不通は再現しなかった。** これも上記と同じく、機能自体の制約ではなくセッション・タイミング依存の一時的な不安定さだったとみられる。同じ操作が失敗する場合は、時間をおいて（あるいはページを開き直して）再試行する価値がある。

### 正しい編集の流れ

1. **プライマリーロケール（日本語）の文言は、フォーム編集画面本体の「タイトル」「コンテンツ」「フィールド」「ボタンのラベル」「同意の免責事項」「成功」セクションを直接編集する。** これは商品・メニュー等と同じ原則（[localization.md](./localization.md) 参照）：プライマリーロケールは「翻訳」ではなく本体データそのもの
2. **英語・ベトナム語・簡体字中国語などの非プライマリー言語は、ページ上部の「言語」セクション → 対象言語の「翻訳する」ボタン → 「フォームを翻訳」モーダルで、Japanese列を見ながらEnglish等の列に直接入力する。** モーダル内の入力欄はクリック・タイピングとも問題なく動作した
3. **プライマリーロケールの本体を編集すると、既存の翻訳（英語・ベトナム語等）は自動的に「フォーム編集後の翻訳が見つかりません」という空欄状態にリセットされる。** 本体を先に確定させてから、翻訳を（入れ直す前提で）最後に作業すること
4. Teaser title は popup フォーム専用で、inline form には存在しない（「表示中」ドロップダウンに「ティーザー」の選択肢が出ない）。inline form では無視してよい
5. 「翻訳を追加」というバナーリンクは実際には言語セクションへのアンカーリンクで、そのまま「言語」セクションまでページ内スクロールするだけ。個別に「翻訳する」ボタンを押す必要がある

### 翻訳対象フィールド一覧（sakura-signup / インラインフォーム）

Form title / Form description / First name field label / Email field label / Form button / Disclaimer / Success title / Success content（Teaser titleはinline formでは対象外）
