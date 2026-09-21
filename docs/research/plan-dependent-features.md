# プラン依存の機能について（重要な注意）

## 開発ストアの表示はプランの利用可否を保証しない

オンラインストアの各種設定に「**Restrict access to B2B customers only**」というトグルが存在することを確認した。説明文は「B2B customers will need to log in and verify their account to access your store」。B2B の Company / Company location は組織単位で顧客を束ねる仕組みであり、派遣元組織との対応は構造的に良い。

ただしこれは追求しない方がよい。

- Shopify のドキュメントは B2B を「plans that support B2B capabilities」と記述しており、プランによって使えるかが決まる
- この開発ストアは `plan.shopifyPlus: false` であるにもかかわらずトグルが表示されている
- B2B は従来 Shopify Plus 限定の機能であり、Plus の価格帯は本プロジェクトの「コストを可能な限り低く抑える」という前提と相容れない

**開発ストアではプラン依存の機能が使えるかどうかを判定できない。** 開発ストアは機能をシミュレートして表示するため、トグルが存在することは実際の Basic プランで使える証拠にはならない。

この注意は B2B に限らない。プランによって可否が変わるもの（例: リアルタイム配送料は Advanced以上）については、開発ストアでの表示を根拠にしてはいけない。公式の料金ページやドキュメントで確認する必要がある。

## Basic の同時利用言語数は20言語（確認済み）

Shopify ヘルプセンターの記述。

> You can sell in up to 20 languages from a single Shopify store on the Basic, Grow, Shopify, or Advanced plan, and in up to 30 languages on the Shopify Plus plan and Shopify Enterprise Commerce plan

出典: https://help.shopify.com/en/manual/international/localization-and-translation

必要な4言語（日本語・英語・ベトナム語・中国語）は余裕で収まる。**懸念事項から外してよい。** チェックアウトでの多言語表示の実機確認は [checkout.md](./checkout.md) を参照。

## Shopify Flow は Basic プランで利用可能（この開発ストアでは検証不可）

Flow のプラン依存の詳細と検証状況は [serverless-options.md](./serverless-options.md) を参照。
