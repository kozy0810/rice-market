# Shopify 実現可能性 検証ログ

最終更新: 2026-10-12

対象要件は `docs/human/requirements.md`。個別の調査結果は `docs/research/` 配下にトピックごとに分けてある。**Shopifyの仕様について不明点があれば、まずこのページの一覧から該当する研究ファイルを確認する。**

## 検証環境

| 項目 | 値 |
|---|---|
| 開発ストア | `rice-market-dev.myshopify.com`（表示名: `dev-rice-rakuraku-delivery`） |
| Shop GID | `gid://shopify/Shop/76593725526` |
| プラン | Basic App Development（`partnerDevelopment: true`） |
| 国 | JP |
| ストアフロントパスワード | `rteild` |
| 組織（Dev Dashboard） | `kozy` / `231816619` |
| 組織（Partner） | `5130284` |
| Shopify CLI | 4.8.3 |

CLI は `shopify store auth` で以下のスコープを付与済み（2026-10-13、Issue #84検証で`read_locations`以降を追加）。

```
read_products, write_products, read_customers, write_customers,
read_orders, write_orders, read_draft_orders, write_draft_orders,
read_merchant_managed_fulfillment_orders, write_merchant_managed_fulfillment_orders,
read_assigned_fulfillment_orders, write_assigned_fulfillment_orders,
read_themes, read_shipping, read_discounts,
read_translations, write_translations,
read_locations, read_inventory, write_inventory
```

`read_publications` は未付与のため、販売チャネルの公開状態を API から読む場合は再認証が必要。

**注意（2026-10-10、Issue #72で確定）**: ストアの表示名（`shop.name`）が `dev-rice-rakuraku-delivery` に変わっている（`myshopifyDomain` は引き続き `rice-market-dev.myshopify.com`、Shop GIDも上記と一致。ユーザーが意図的に変更したものであり、別ストアではない）。管理画面右上のストア名表示がスクリーンショットと食い違って見えることがあるので注意。2026-10-12時点でも`myshopifyDomain`・`primaryDomain.host`は`rice-market-dev.myshopify.com`のまま変化していないことを`shopify store execute`で再確認した。

## 調査結果一覧（docs/research/）

| ファイル | 内容 |
|---|---|
| [customer-accounts.md](./research/customer-accounts.md) | customer accountsの仕様、セルフサービス登録では購入者を限定できないこと、事前作成顧客と初回サインインの結合 |
| [app-proxy-signup.md](./research/app-proxy-signup.md) | App ProxyによるURL制約と派遣元別登録URLの実装、保護された顧客データ、配信方法（カスタム配布） |
| [cart-validation-function.md](./research/cart-validation-function.md) | Cart and Checkout Validation Functionによる購入ゲート、Buy Nowでのバグと対処 |
| [client-transfer-store.md](./research/client-transfer-store.md) | 開発ストアとclient transfer storeの違い、カスタムアプリのインストールタイミング |
| [plan-dependent-features.md](./research/plan-dependent-features.md) | プラン依存機能の判定に関する注意、Basicの同時利用言語数 |
| [serverless-options.md](./research/serverless-options.md) | Shopify Forms / Flowによるサーバーレス構成の可否、構成A/B/Cの比較 |
| [metaobjects.md](./research/metaobjects.md) | 派遣元マスタの設計、管理画面からの追加、ハンドル自動生成問題 |
| [checkout.md](./research/checkout.md) | 決済手段・重量別送料・多言語のチェックアウト実機確認。決済方法の「決済手順」はTranslate & Adaptの画面からは翻訳できないが、Admin GraphQL（`translationsRegister`、`resourceType: PAYMENT_GATEWAY`）で翻訳登録・ストアフロントへの反映まで実機確認済み |
| [royalty-snapshot.md](./research/royalty-snapshot.md) | 注文時点の派遣元スナップショットとロイヤリティ集計。Issue #8完了（2026-10-12）：`Order created`→`Add order tags`のFlowをユーザーが手動構築し、Admin GraphQL APIで完了条件（スナップショット・転籍後の不変性・派遣元別検索集計）をすべて実機確認済み。副次的に`tag_prefix:`検索がCLI経由では絞り込みとして機能しない現象を発見（実害なし、クライアント側集計が安全網） |
| [app-home-ui-extension.md](./research/app-home-ui-extension.md) | App Home UI Extensionによる、バックエンド不要なロイヤリティ画面の実現可否（Devストアで`shopify.query()`による注文取得・org:タグ絞り込みを実証済み） |
| [git-management.md](./research/git-management.md) | Shopifyのコード・設定のGit管理可否、テーマ+アプリ構成の制約 |
| [signup-url-handle.md](./research/signup-url-handle.md) | 会員登録ページのURLハンドル推測困難化、handleへのスラッシュ不可、sitemap自動掲載とseo.hiddenメタフィールドによる除外 |
| [self-service-status-change.md](./research/self-service-status-change.md) | 顧客自身によるタグ変更は技術的に不可能なこと、顧客によるメタフィールド書き込みは公式サポートされていること、卒業は所属組織からの削除の自己申告であり購入可否には影響しないこと。実装・実機検証済み（Issue #45、仕様は`docs/specs/self-service-status-change.md`）。組織名の自動同期（`Customer tags added`トリガー + Shopify Flow）も追加実装・実機検証済み（2026-10-06） |
| [unpaid-order-auto-cancel.md](./research/unpaid-order-auto-cancel.md) | 未入金注文の自動キャンセル（日数指定）はShopify管理画面にネイティブ設定が存在しないこと。チェックアウト設定・一般設定（注文処理）・手動決済方法の3箇所を実機確認済み。**訂正（2026-10-10）**: 「開発ストアのプランではFlowが開けない」という当初の前提は2026-10-04時点で解消済み（[app-home-ui-extension.md](./research/app-home-ui-extension.md)参照）。Flow自体がこのDevストアで構築・動作することはIssue #8で実証済み（[royalty-snapshot.md](./research/royalty-snapshot.md)）。設計・実装手順は[docs/specs/unpaid-order-auto-cancel.md](./specs/unpaid-order-auto-cancel.md)に移行済み（Issue #46、2026-10-13） |
| [unpaid-order-auto-cancel.md](./specs/unpaid-order-auto-cancel.md) | 未入金注文の自動キャンセルをShopify Flowで実装（Issue #46）。既存Flow①（[fulfillment-hold-by-payment-status.md](./specs/fulfillment-hold-by-payment-status.md)）にWait→タグ再チェック→Cancel orderを追記する方式で、ユーザーが実機構築・動作確認済み（2026-10-13）。注文#1023（未入金放置）が意図通り自動キャンセル・在庫復元・通知送信されたこと、注文#1025（待機中に支払いを手動マーク）がキャンセルされずFlow②で`発送可`に切り替わることをタイムラインで確認。副次的に、銀行振込・代引きいずれの手動「支払い済みとしてマーク」でも`Order paid`トリガーが確実に発火し、Flow②の条件で代引きが正しく除外されることをFlowの実行履歴で実機確認済み（Issue #83、2026-10-13） |
| [cod-payment.md](./research/cod-payment.md) | 代引き(COD)の管理者運用をAPIレベルで検証。「支払い済みとしてマーク」は`orderMarkAsPaid`と`orderCreateManualPayment`の2系統があり後者が決済方法名を残せる。「追加情報」「決済手順」の文言は注文データに保存されない（動的レンダリングと推測、未実証）。PENDINGでも発送可能という点はKOMOJU検証と同じ。あわせて受取拒否・未払い時の配送業者側の実務（保管期限最大7日、受取拒否でも代引き手数料は発生、店舗側負担になりがち）も整理 |
| [komoju-payment.md](./research/komoju-payment.md) | KOMOJUをテストモードで実機導入し、コンビニ決済の「Authorized→Captured→Shopify Paid」への切り替わりフローを確認済み（Simulate Captureで擬似的に支払い完了させる）。付随して判明した重要事実: 支払いが`PENDING`の注文でもShopifyは発送(fulfillment)をAPIレベルでブロックしない。代引き・銀行振込・コンビニ決済いずれも「支払い確認後に発送」はマーチャントの運用ルール次第であり、Shopify標準機能には未入金発送を防ぐ仕組みがない |
| [fulfillment-hold-by-payment-status.md](./specs/fulfillment-hold-by-payment-status.md) | 上記の課題（未入金発送事故）への対策をShopify Flowで実装・実機検証済み（Issue #71）。前払い決済（KOMOJU・銀行振込）の注文作成時に自動で発送保留＋タグ`入金待ち`を付与するFlow①、入金確定で保留解除＋タグを`発送可`に切り替えるFlow②を構築。決済ゲートウェイ名は設定画面の表示名と実データが食い違う場合がある（代引き・銀行振込はいずれも英語の内部名）という注意点、および`Release fulfillment order holds`は単体のFulfillmentOrderが必要なため`For each`でループする必要があるという実装上の落とし穴を発見・記録。**追記（2026-10-13、Issue #84）**: `fulfillmentOrderSplit`で人為的に分割発送を作り検証。Flow②のReleaseは複数Fulfillment Orderでも実機（Flow経由）で正しく動作することを確認。Cancel orderアクション相当（`orderCancel`直叩き）も複数Fulfillment Orderを一括で正しく処理することを確認（ただしFlow経由では未検証）。**Flow①のHoldは`For each`なしの単発ステップであることを構成確認済み**（Issue #84）。単一Fulfillment Orderの注文では実際に動作しているが、複数Fulfillment Orderでの挙動は未確定のまま。単一ロケーション運用の現状では実害なし、複数ロケーション運用を検討する段階で改めて実機テストを推奨 |
| [contact-form.md](./research/contact-form.md) | Dawn標準の`contact-form`セクション検証（Issue #65）。実装・公開・ナビゲーション導線は確認済み。フォーム自体に不具合は見つからず、スクリプトでの自動検証にはShopify標準のhCaptcha保護（contact/customer/blogフォーム共通）が障壁になった。**訂正（2026-10-13）**: Issue #65はユーザー本人の実ブラウザでの手動確認（送信成功・実着信とも確認）により完了・クローズ済み。さらにIssue #67でフォーム自体が改修され、名前・メールアドレスはログイン中の顧客情報から自動設定（入力欄なし）、問い合わせ内容は10文字以上必須に変更されている。ドキュメント内の「`contact[email]`が入力欄として存在する」等の記述はIssue #67以前の実装を対象にした検証結果であり現状には当てはまらない。管理画面「設定>通知」で差出人メールアドレスが`koji.19960810@gmail.com`であること、Gmailドメインのためお客様には`store+76593725526@shopifyemail.com`として表示される仕様は現在も有効な情報。**追記（2026-10-14）**: ライブテーマがPR #69（フォーム改修）の変更だけを失って巻き戻っている事故が発覚し、復旧した。原因は#69より前に分岐したブランチ`fix/storefront-logo-size`の作業ツリーからの`shopify theme push`。`shopify app deploy`と同じ「push元ツリーの内容でライブテーマを丸ごと置き換える」挙動による。再発防止の確認手順は`shopify-dev-verification`スキルの「よくあるハマりどころ」参照 |
| [shipping-label-apps.md](./research/shipping-label-apps.md) | 配送ラベル・伝票番号の自動発行はShopify標準（Shopify Shipping）が日本非対応のためアプリが必要なこと。伝票番号を注文に記録して通知するだけならアプリ不要だが、番号自体の自動取得にはアプリが前提。プラスシッピングを実機インストール済み（2026-10-09）：配送業者との個別契約書は不要だが「申し込むだけで即日契約完了」は誤りで、新規事業者は電話連絡＋発送元住所への訪問調整を経て翌営業日以降にサブスクリプション有効化。申込みフォームは実在の住所・氏名・電話番号が必須で配送業者に連携されるためダミー送信不可。送り状発行の課金額・課金先決済方法は申込み完了後でないと確認できず未実証のまま |

## 可否判定のまとめ

| 要件 | 判定 | 根拠 |
|---|---|---|
| 限定販売（登録者のみ購入） | 可 | [cart-validation-function.md](./research/cart-validation-function.md) |
| 卒業による購入可否の切替 | 可 | タグ操作。購入可のまま残す運用も可能 |
| 派遣元ごとの登録URL | 可 | [app-proxy-signup.md](./research/app-proxy-signup.md) |
| 素の `/signup` を塞ぐ | 可 | 同上 |
| 管理画面から派遣元を追加 | 可 | [metaobjects.md](./research/metaobjects.md) |
| 顧客自身による卒業（所属組織からの削除） | 可 | [self-service-status-change.md](./research/self-service-status-change.md)。「転籍」という概念はなく、顧客ができるのは卒業のみ |
| 注文時点の派遣元スナップショット | 可 | [royalty-snapshot.md](./research/royalty-snapshot.md) |
| ロイヤリティ集計 | 可 | 同上 |
| 代引き・銀行振込 | 可 | [checkout.md](./research/checkout.md)。手動決済方法。消込は手作業 |
| 多言語（日英越中） | 可 | 同上。137言語から選択、Basicで20言語まで同時利用可 |
| 重量別・地域別送料 | 可 | 同上 |
| 重量バリエーション | 可 | 同上 |
| 産地情報の保持・表示 | 可 | 商品メタフィールド |
| 未入金注文の自動キャンセル（日数指定可） | 可 | [docs/specs/unpaid-order-auto-cancel.md](./specs/unpaid-order-auto-cancel.md)。ネイティブ設定は存在せず、既存Flow①（Issue #71）への追記で実現。Devストアで実機構築・動作確認済み（Issue #46、2026-10-13） |

**要件定義に書かれた項目はすべて Shopify 上で実現可能**であることを確認済み。

### ただし可否とは別に残る事実

- 日常運用（派遣元追加、卒業処理、商品・在庫、発送）は管理画面で完結する
- 銀行振込の消込は毎日の手作業になる
- 開発ストアでは実決済を通せないため、代引き・銀行振込のエンドツーエンドは移管・契約後にしか確認できない

## 決定: 購入導線の構成は B（2026-09-21、Issue #1）

**サーバー不要の構成B（Shopify Forms による登録 + Validation Function による購入ゲート）を採用する。** 保守を続ける予定がないため、自社サーバーを持つ構成A・Cは除外した。注文スナップショット（ロイヤリティ集計の自動化・Shopify Flow）は nice to have に格下げし、Flowが本番プランで動くかどうかは構成選択のブロッカーではなくなった。詳細と理由は [serverless-options.md](./research/serverless-options.md) の「決定」節を参照。

**この「サーバー不要」は、Lambda・Fargateのようなサーバーレスサービスも含めて除外する、という意味で徹底する。** Webhookの受け口など「軽量なサーバーレス関数1つだけ」であっても、保守対象が増えることに変わりはないため採用しない。実装を検討する過程でサーバー（サーバーレス含む）が必要になりそうな場合は、それを採用する前に、多少実装が複雑になってもサーバーを使わない代替案を検討する（[self-service-status-change.md](./research/self-service-status-change.md)のIssue #45検討で、Flow Trigger・Webhook受けのいずれもこの理由で却下した）。

## 未検証・推論で代替している項目

（現時点でなし）

**訂正（2026-10-13）**: 「Shopify Forms経由の顧客作成 → 初回サインインの結合」を長らくここに挙げていたが、これは実際には2026-09-24（Issue #6）に実機確認済みだった（[customer-accounts.md](./research/customer-accounts.md)「解決（2026-09-24、Issue #6）」節）。ファイル内の見出しが検証開始時点の「未実証・推論」のまま放置されていたため、本ログもそれをそのまま参照し続け、長期間「未解決」と誤認していた。顧客ID`gid://shopify/Customer/10150015991894`が現在も結合済み状態（`member`タグ・`verifiedEmail: true`）で存在することを再確認済み。

## 現状のタスク管理

技術検証はほぼ完了している。残作業（事業側の決定、構築、納品）は GitHub Issues + Project「Rice Market」（`gh project view 5 --owner kozy0810`）で管理しており、このログでは重複して管理しない。
