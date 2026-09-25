# 雑に便利なコマンドを入れる

alias c="clear" 

alias fzf-preview="fzf --preview 'bat --color=always {}' --preview-window '~3'"

# fzfで曖昧検索→vscode/neovimで開く
alias fcode='dir=$(fd . ~ -H -I -E Library -E .cache -E .git --max-depth 4 | fzf) && code "$dir"'
alias fcode-c='dir=$(fd . . -H -I -E Library -E .cache -E .git --max-depth 4 | fzf) && code "$dir"'
alias fvim='dir=$(fd . ~ -H -I -E Library -E .cache -E .git --max-depth 4 | fzf) && nvim "$dir"'
alias fvim-c='dir=$(fd . . -H -I -E Library -E .cache -E .git --max-depth 4 | fzf) && nvim "$dir"'

# rg のラッパー: 検索対象から spec/** を常に除外し、Perl正規表現を常に使う
rg-app() {
  command rg -P -g '!spec/**' "$@"
}

# eza
eza() {
  local args=()
  for arg in "$@"; do
    if [[ "$arg" == "--ic" ]]; then
      args+=(--icons=always)
    else
      args+=("$arg")
    fi
  done
  command eza "${args[@]}"
}
ls() { eza --icons=always "$@"; }
ls-l() { eza --icons=always -l "$@"; }
ls-a() { eza --icons=always -la "$@"; }
ls-tree() { eza --icons=always -T -L 2 "$@"; }

# よく使うディレクトリへのcdエイリアス
alias v='cd ~/vault'
alias dev='cd ~/dev'
alias dot='cd ~/dotfiles'

# zshの設定ファイルはよく開くのでエイリアスを設定
alias e-zsh='code "$DOTFILES/zsh/.zshrc"'
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
 
# コマンドの履歴がグローバル&リアルタイムに共有されるzshのオプション
setopt SHARE_HISTORY