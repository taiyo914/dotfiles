# dotfiles の置き場所
# zprofile を通らずに zsh を起動したときのために、ここでも既定値を入れる
export DOTFILES="${DOTFILES:-$HOME/dotfiles}"
export LOCAL_DOTFILES="${LOCAL_DOTFILES:-$HOME/dotfiles-local}"

# ツールやシステムが提供するTab補完を有効化する設定
autoload -Uz compinit && compinit
zstyle ':completion:*' menu select # 補完をハイライトし矢印キーでも選択可能にする設定

# エディター
export EDITOR='code -w'

# direnv
eval "$(direnv hook zsh)"

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
# 読み込むのは local.zsh だけ。そこから先の順番は local.zsh 側で決める
# ファイルが無ければ何もしないので、私用PCでは置かなくてよい
[ -f "$LOCAL_DOTFILES/zsh/local.zsh" ] && source "$LOCAL_DOTFILES/zsh/local.zsh"
