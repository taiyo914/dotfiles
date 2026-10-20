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