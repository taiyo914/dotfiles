# gitに関する設定

# 現在のブランチをwebでみる
alias pr-view="gh pr view --web"

# fzf でブランチ選択
gco() {
  git branch --sort=-committerdate | fzf --height 40% | xargs git checkout
}
gdm() {
  git branch --sort=-committerdate | fzf --height 40% | xargs -I {} git diff main...{}
}

# 今いるリポジトリのワークツリーを ~/dev/worktrees/<リポジトリ名>/<ブランチ名の / を - にしたもの> に作って移動する
# 置き場所は、herdr がワークツリーを作る場所（herdr/config.toml の worktrees.directory）と同じにしている
# 使い方: リポジトリの中で wt-add <ブランチ名>
#   例: wt-add fix-foo → ブランチ taiyo914/fix-foo を ~/dev/worktrees/freee-payroll/taiyo914-fix-foo に作る
#   ブランチ名に / がないときは、先頭に「git の user.name/」を付ける
#   ブランチが手元か GitHub にあればそのブランチを使い、どちらにもなければ origin のデフォルトブランチから新しく作る
wt-add() {
  if [[ -z $1 ]]; then
    echo "使い方: wt-add <ブランチ名>" >&2
    return 1
  fi

  # 本家のリポジトリ・ブランチ名・ワークツリーの場所を決める
  local main_repo branch dir
  main_repo=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || {
    echo "wt-add: Git リポジトリの中で実行してください" >&2
    return 1
  }
  main_repo=${main_repo:h}
  branch=$1
  [[ $branch == */* ]] || branch="$(git -C $main_repo config user.name)/$branch"
  dir=~/dev/worktrees/${main_repo:t}/${branch//\//-}
  if [[ -e $dir ]]; then
    echo "wt-add: $dir はすでにあります" >&2
    return 1
  fi

  # ブランチがある場所に合わせてワークツリーを作る
  echo "==> $branch のワークツリーを $dir に作ります"
  if git -C $main_repo show-ref --verify --quiet refs/heads/$branch; then
    git -C $main_repo worktree add $dir $branch || return 1
  elif git -C $main_repo ls-remote --exit-code --heads origin $branch >/dev/null; then
    git -C $main_repo fetch origin $branch &&
    git -C $main_repo worktree add --track -b $branch $dir origin/$branch || return 1
  else
    local base
    base=$(git -C $main_repo symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null) || base=origin/main
    git -C $main_repo fetch origin ${base#origin/} &&
    git -C $main_repo worktree add --no-track -b $branch $dir $base || return 1
  fi

  cd $dir
}