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
