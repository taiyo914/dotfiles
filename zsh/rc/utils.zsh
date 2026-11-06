# 雑に便利なコマンドを入れる

alias c="clear" 

alias fzf-preview="fzf --preview 'bat --color=always {}' --preview-window '~3'"

# fzfで曖昧検索→vscode/neovimで開く
alias fcode='dir=$(fd . ~ -H -I -E Library -E .cache -E .git --max-depth 4 | fzf) && code "$dir"'
alias fcode-c='dir=$(fd . . -H -I -E Library -E .cache -E .git --max-depth 4 | fzf) && code "$dir"'
alias fvim='dir=$(fd . ~ -H -I -E Library -E .cache -E .git --max-depth 4 | fzf) && nvim "$dir"'
alias fvim-c='dir=$(fd . . -H -I -E Library -E .cache -E .git --max-depth 4 | fzf) && nvim "$dir"'

# 現在のディレクトリを nvim で開き、起動が終わったら lazygit の画面を開く
ngit() {
  nvim -c 'autocmd User VeryLazy ++once lua vim.schedule(function() Snacks.lazygit() end)' "$@"
}

# rg のラッパー: 検索対象から spec/** を常に除外し、Perl正規表現を常に使う
rg-app() {
  command rg -P -g '!spec/**' "$@"
}

# eza はデフォルトでアイコンをつける
# hint: --icons=auto は出力がターミナルのときだけアイコンを付ける設定
eza() { command eza --icons=auto "$@"; }

# eza-tree 2 のように階層を指定できる（デフォルトは1）
eza-tree() {
  local level=1
  if [[ "$1" == <-> ]]; then
    level=$1
    shift
  fi
  eza -T -L "$level" "$@"
}

# よく使うディレクトリへのcdエイリアス
alias v='cd ~/vault'
alias dev='cd ~/dev'
alias dot='cd ~/dotfiles'
alias key='cd ~/keyboards'
alias cline='cd ~/keyboards/cline46/zmk-config'
alias keyball='cd ~/keyboards/keyball61'

# ~/dev にあるリポジトリを fzf で選んで移動する
repo() {
  local name
  name=$(print -l ~/dev/*(/:t) | fzf --height 40% --reverse) || return
  cd ~/dev/"$name"
}

# zshの設定ファイルはよく開くのでエイリアスを設定
alias e-zsh='nvim "$DOTFILES/zsh/.zshrc"'
alias s-zsh='source ~/.zshrc'

# Lazydocker エイリアス
alias lzd="lazydocker"

# Ghostty を light の設定で開く
# --config-default-files=false で、ふだんの config を読み込ませないようにする
ghostty-light() {
  open -na Ghostty --args \
    --config-default-files=false \
    --config-file="$DOTFILES/ghostty/light.config"
}

# Ghostty の設定ファイルを nvim で開く
alias ghostty-config='nvim "$DOTFILES/ghostty/config"'
 
# コマンドの履歴がグローバル&リアルタイムに共有されるzshのオプション
setopt SHARE_HISTORY
