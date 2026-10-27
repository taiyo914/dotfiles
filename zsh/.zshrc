# dotfiles の置き場所
# zprofile を通らずに zsh を起動したときのために、ここでも既定値を入れる
export DOTFILES="${DOTFILES:-$HOME/dotfiles}"
export LOCAL_DOTFILES="${LOCAL_DOTFILES:-$HOME/dotfiles-local}"

# EDITOR を nvim にすると zsh が自動で vi 風のキー操作にするため、通常の emacs 風操作に固定する
# これでプロンプトで Esc を押しても vi のノーマルモードに入らなくなる
bindkey -e

# zsh-autocomplete
# zsh-autocomplete は移動したフォルダの履歴をこのフォルダに保存する。フォルダがないとフォルダを移動するたびにエラーが出るので、先に作っておく
mkdir -p "${XDG_DATA_HOME:-$HOME/.local/share}/zsh"
source ${HOMEBREW_PREFIX}/share/zsh-autocomplete/zsh-autocomplete.plugin.zsh
# Tab で補完候補の一覧に入り、一覧の中では Tab / Shift+Tab で次 / 前の候補に移動する
bindkey             '^I' menu-select
bindkey "$terminfo[kcbt]" menu-select
bindkey -M menuselect              '^I'         menu-complete
bindkey -M menuselect "$terminfo[kcbt]" reverse-menu-complete

# エディター
export EDITOR='nvim'

# direnv
eval "$(direnv hook zsh)"

# mise
eval "$(mise activate zsh)"

# starship
eval "$(starship init zsh)"

# zsh-autosuggestions & zsh-syntax-highlight
source ${HOMEBREW_PREFIX}/share/zsh-autosuggestions/zsh-autosuggestions.zsh
source ${HOMEBREW_PREFIX}/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE='fg=#999999' # 補完の文字色を指定

# fzf
source <(fzf --zsh)

# === 他の設定の読み込み ===
ZSH_RC="$DOTFILES/zsh/rc"

source $ZSH_RC/claude.zsh
source $ZSH_RC/git.zsh
source $ZSH_RC/utils.zsh

# === このマシンだけで必要な設定の読み込み ===
# ファイルが無ければ何もしない
if [ -f "$LOCAL_DOTFILES/zsh/local.zsh" ]; then
  source "$LOCAL_DOTFILES/zsh/local.zsh"
fi
