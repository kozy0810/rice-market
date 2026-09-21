# 注文時点の派遣元スナップショットとロイヤリティ集計

## なぜ必要か

顧客の所属派遣元は転籍・卒業によって変わりうる。したがって「顧客タグだけで派遣元を表現する」と、転籍した時点で過去の所属情報が失われる。ロイヤリティがスコープに含まれる以上、**注文には注文時点の派遣元を別途記録する必要がある**。これを確かめた。

## 手順

1. 下書き注文を作成し、実注文 `#1001` に変換（顧客: `koji.19960810+ricetest2@gmail.com`、当時の所属 `org:test-agency-b`）
2. 注文に `orderUpdate` でタグとメタフィールドを書き込む
3. 顧客の所属タグを `org:test-agency-b` から `org:agency-sakura` に変更（転籍のシミュレーション）
4. 注文を読み直す

## 結果

注文への書き込みは成功した。

```
注文タグ: ["org:test-agency-b"]
注文メタフィールド:
  rice.dispatch_org_handle = test-agency-b
  rice.dispatch_org_name   = テスト協同組合B
  rice.royalty_rate        = 0.015
```

転籍後に読み直しても注文側は変化しなかった。

```
注文 #1001
  注文タグ      : ["org:test-agency-b"]      ← 変わらない
  注文メタ      : dispatch_org_handle=test-agency-b ...  ← 変わらない
  顧客の現在タグ: ["member", "org:agency-sakura"]  ← 転籍済み
```

タグによる絞り込みと集計も機能した。

```
query: tag:'org:test-agency-b'
  #1001  700.0 JPY
合計 700.0 / ロイヤリティ1.5% = 10.5
```

## 判定: 可

**注文時点の派遣元をスナップショットとして保持でき、転籍・卒業によって過去の帰属が書き換わらない。** 派遣元別の集計もタグ検索で成立する。

本番実装では `ORDERS_CREATE` webhook（または Shopify Flow。[serverless-options.md](./serverless-options.md) 参照）で自動的に書き込むことになるが、書き込みそのものが可能であることはここで確認した。注文タグにしておくと管理画面の絞り込みとCSVエクスポートがそのまま使えるため、非エンジニアでも月次集計が回る。
