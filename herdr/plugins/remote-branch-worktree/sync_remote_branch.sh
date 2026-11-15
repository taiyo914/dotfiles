#!/bin/sh
# herdr が今の HEAD から新しく作ったブランチを、GitHub 上の同じ名前のブランチ（origin/<ブランチ名>）と同じ中身にする。
# 次のどれかに当てはまるときは何もしない。
# - GitHub 上に同じ名前のブランチがない
# - ブランチが元からローカルにあった、または --base を指定して作られた
# - worktree にまだコミットしていない変更がある
set -eu

# 作られた worktree の場所を、herdr から渡された情報から取り出す
# 渡される情報の形はドキュメントに書かれていないので、後から確かめられるように保存しておく
printf '%s\n' "${HERDR_PLUGIN_EVENT_JSON:-}" > "${HERDR_PLUGIN_STATE_DIR:-/tmp}/last_event.json"
checkout_path=$(printf '%s' "${HERDR_PLUGIN_EVENT_JSON:-}" | jq -r '[.. | .checkout_path? // empty] | first // empty')
[ -n "$checkout_path" ] || exit 0
cd "$checkout_path"

# herdr が HEAD から新しく作ったばかりのブランチかを確かめる
branch=$(git symbolic-ref --short -q HEAD) || exit 0
[ "$(git reflog show --format=%gs "refs/heads/$branch" | wc -l | tr -d ' ')" = 1 ] || exit 0
[ "$(git reflog show --format=%gs "refs/heads/$branch")" = "branch: Created from HEAD" ] || exit 0
git rev-parse -q --verify "$branch@{upstream}" > /dev/null && exit 0
[ -z "$(git status --porcelain)" ] || exit 0

# GitHub 上の同じ名前のブランチを取ってくる。なければここで終わる
created_commit=$(git rev-parse HEAD)
git fetch -q origin "+refs/heads/$branch:refs/remotes/origin/$branch" 2> /dev/null || exit 0

# fetch の間に変更やコミットがされていなければ、ブランチを GitHub 上のブランチに合わせる
[ "$(git rev-parse HEAD)" = "$created_commit" ] || exit 0
[ -z "$(git status --porcelain)" ] || exit 0
# submodule.recurse = true だと、まだ用意されていない新しい worktree のサブモジュールまで切り替えようとして失敗するので止める
git -c submodule.recurse=false reset -q --hard "origin/$branch"
git branch -q --set-upstream-to="origin/$branch"
"${HERDR_BIN_PATH:-herdr}" notification show "$branch を origin/$branch に合わせました" --body "$(git log -1 --format='%h %s')" > /dev/null 2>&1 || true
