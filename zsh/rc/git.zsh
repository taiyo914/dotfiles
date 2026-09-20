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

# mainと作業ブランチを最新化するコマンド
git-update() {
  local current_branch
  current_branch=$(git symbolic-ref --short HEAD) || return 1

  if [[ "$current_branch" == "main" ]]; then
    git pull
    return
  fi

  git checkout main &&
  git pull &&
  git checkout "$current_branch" &&
  git rebase main
}