---
description: 今の会話の内容から、herdr の space（workspace）の名前を付け直す。
argument-hint: "[名前のヒント]"
disable-model-invocation: true
---

今の会話の内容から、この pane がある herdr の space の名前を付け直す。

1. `~/.claude/scripts/workspace-title-rules.md` を読んで、名前のルールを確かめる。
2. 会話全体を見て、今この space でやっているタスクを表す名前をルールに従って 1 つ決める。最初の質問ではなく、今のタスクに合わせる。`$ARGUMENTS` があれば、名前を決めるときのヒントにする。
3. 次のコマンドで space の名前を変える。`<名前>` は決めた名前に置き換える。

   ```sh
   herdr workspace rename "$(herdr pane get "$HERDR_PANE_ID" | jq -r '.result.pane.workspace_id')" '<名前>'
   ```

   `HERDR_PANE_ID` が空のときは、herdr の中で動いていないので、名前を変えずにそのことを伝える。
4. 新しい名前を 1 行だけ返す。
