---
name: issue-conventions
description: rice-marketリポジトリでGitHub Issueを作成・更新するときの必須フォーマットと手順。「Issueを作って」「タスクを整理して」「〜をIssue化して」「進捗を登録して」と言われたら、自己流のフォーマットで作らずに必ずこのスキルに従う。本文の構成（ゴール/完了条件/補足）、Issueの粒度の目安、親子Issueの紐付け方（GitHub純正のsub-issue機能）、プロジェクトボードへの登録まで、このリポジトリ固有のルールをまとめている。
---

# Issue の作り方（rice-market）

## 本文フォーマット

Issue本文は次の3見出しだけで書く。見出しを絞るのは、後から読む人（人間・別セッションのClaude）が目的と完了条件をすぐ拾えるようにするため。他のIssueへの参照は最小限にし、そのIssue単体で内容が分かるようにする。

```markdown
## ゴール
何のために、何を達成する作業か。1〜2文。

## 完了条件
- チェックリスト形式。「〜できる」「〜が確認できている」のように検証可能な文で書く

## 補足
判断の元になった背景、注意点、依存する前提など。無ければ省略可。
```

## 粒度

細かくしすぎない。1つのIssueは「1日〜数日でやりきれる単位のまとまり」を目安にする。チェックボックス1つ分まで分解すると、プロジェクトボードがノイズだらけになり全体像が見えなくなる。関連作業が5個以上になりそうな場合は、親Issueを作って子Issueを紐付ける（下記）。

## 親子構造（GitHub Sub-issues）

チェックリストでの参照ではなく、GitHub純正のsub-issue機能を使う。

```bash
# 1. 親・子それぞれをREST APIで作成し、number と node_id を取得
gh api repos/kozy0810/rice-market/issues -X POST -f title="..." -f body="..."

# 2. GraphQL で親子を紐付ける
gh api graphql -f query='
mutation($issueId: ID!, $subIssueId: ID!) {
  addSubIssue(input: {issueId: $issueId, subIssueId: $subIssueId}) { issue { number } }
}' -f issueId="<親のnode_id>" -f subIssueId="<子のnode_id>"
```

親Issueの完了条件は「子Issueがすべて完了している」で良い（進捗はGitHub側が自動集計する）。

## プロジェクトボードへの追加

作成したIssueは必ずプロジェクト「Rice Market」（プロジェクト番号5、owner: kozy0810）に追加する。

```bash
gh project item-add 5 --owner kozy0810 --url https://github.com/kozy0810/rice-market/issues/<番号>
```

## 作成前に

既知のタスク全体像は GitHub Issues + プロジェクト「Rice Market」（`gh project view 5 --owner kozy0810`）にある。新しいIssueが既存のIssueと矛盾しないか、重複しないかを確認してから作る。

## ブランチとマージ

リポジトリへの変更は必ずブランチを切ってから行う（`main` に直接コミットしない）。PRは**必ず squash and merge** を使う（`gh pr merge --squash`）。マージ後はローカル・リモート双方のブランチを削除して `main` を同期する。

## PRとIssueの紐付け

**PRは必ず関連するIssueに紐付ける。** 紐付けないPRは禁止。PR本文に参照を書く。

- そのPRでIssueの完了条件をすべて満たす場合: `Closes #<番号>`（マージ時に自動クローズされる）
- 調査・部分対応などIssueを完了させない場合: `Related to #<番号>`（クローズはされないがリンクされる）

関連するIssueが存在しない変更（突発的なドキュメント修正など）を行う場合は、先にIssueを立ててから紐付ける。
