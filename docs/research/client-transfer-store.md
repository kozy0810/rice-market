# 開発ストア と client transfer store

## 開発ストアの位置づけ

- 開発ストア自体は無料。組織あたり250ストアまで作成できる
- 本番ストアへの変換はできない
- **クライアントへの移管もできない**。マーチャントに納品する場合は client transfer store という別種のストアを使う
- 実取引は通せない（Bogus Gateway または決済プロバイダのテストモードのみ）
- パスワードページを外せない

出典: https://shopify.dev/docs/apps/build/stores/development-stores

client transfer store には「組織内にある間は custom app と draft app をインストールできない」という制約があり、かつ Advanced相当の機能セットを持つため Basic の制限を再現できない。**したがって技術検証は開発ストアで行うのが正しい。**
出典: https://shopify.dev/docs/apps/build/stores/client-transfer-stores

## client transfer store の作成手順（2026-10-18 実施）

**Partner Dashboard ではなく Dev Dashboard から作成する。**

1. [Dev Dashboard](https://dev.shopify.com/dashboard/) にログインする（このプロジェクトの組織は `kozy` / `231816619`）
2. 左サイドバーの **Stores** を開く
3. **Create store** → **Client transfer store** を選ぶ
4. ストア名を入力する。**これが `myshopify.com` のURLになり、作成後は変更できない**
5. ストアの国・地域を選ぶ（JP）
6. 「Are you building a Shopify Plus store for your client?」のチェックボックスが表示される。**チェックしない**（下記）
7. **Create store**

必要なのは Partner アカウントと、組織内でストアを作成・移管する権限。

### Shopify Plus のチェックボックス

「No charges apply」と書かれているとおり無料だが、**チェックしない**。

> If you enable Shopify Plus during store creation, the store instead mirrors Plus plan features.

このプロジェクトは Basic プランで始める方針（`docs/human/requirements.md`）。移管時にプランを選ぶのはクライアント側であり（「Your client selects a plan when they receive the transfer.」）、Basic を選んだ時点で Plus/Advanced 専用機能に依存した設定は壊れる。機能を広げる意味がない。

ただし**チェックを外しても Basic 相当にはならない**（デフォルトで Advanced 相当）。Basic 相当のストアを用意する手段は存在せず、プラン依存の可否は公式の料金ページ・ドキュメントで確認するしかない。開発ストアについての同じ注意（[plan-dependent-features.md](./plan-dependent-features.md)）が client transfer store にもそのまま当てはまる。

### ストア名が取得済みだった場合、ランダムサフィックスが付く

希望した `rice-rakuraku-delivery` は取得済みで、実際に作成されたドメインは **`rice-rakuraku-delivery-kvg4gdjj.myshopify.com`** になった。Shopify が自動でサフィックスを付与する。**作成後にドメインは変更できない。**

表示名は後から変更できるが、ドメイン側のサフィックスは消せないため、表示名とドメインを完全一致させることはできない。顧客に見せる URL は独自ドメイン前提になる。

## client transfer store とカスタムアプリのインストールタイミング

配布設定をカスタム配布に設定した後の画面で、次のフォームが表示されることを確認した（詳細は [app-proxy-signup.md](./app-proxy-signup.md)）。

```
Custom distribution
  Store domain   （例: shop1.myshopify.com）
  Generate link
```

カスタムアプリのインストールリンクは**1つのストアドメインに紐づけて生成する**。したがって本番の流れは次になる。

1. client transfer store を作成して構築する
2. 友人へ移管する（この時点で通常のマーチャントストアになる）
3. 移管後のストアドメインに対してカスタムインストールリンクを生成する
4. そのリンクからアプリをインストールする

ドキュメントの「組織内にある間は custom app と draft app をインストールできない」という制約は**移管前にのみかかる**。移管後にインストールする前提であれば問題にならない。

なお、この順序は「アプリを先に作ってからストアを作る」ことができないことを意味する。**本番アプリのインストールリンク生成は本番ストアが存在してからになる。**
