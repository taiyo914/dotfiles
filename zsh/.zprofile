# パスの設定は zprofile に集約する
# パスの読み込みの順番を整理しやすくする
# zprofile はターミナルアプリ起動時に1度だけ実行され、 zshrc と違い source するたびに $PATH を上書きしない
# 上に書くほど優先順位は低くなり、下に書くほど優先順位は高くなる

# dotfiles の置き場所
export DOTFILES="${DOTFILES:-$HOME/dotfiles}"
export LOCAL_DOTFILES="${LOCAL_DOTFILES:-$HOME/dotfiles-local}"

# homebrew
# $HOMEBREW_PREFIX も定義する
eval "$(/opt/homebrew/bin/brew shellenv)"

# asdf
export PATH="$HOME/.asdf/shims:$PATH"

# .local/bin (claude code など)
export PATH="$HOME/.local/bin:$PATH"

# QMK のツール群
export PATH="$HOME/Library/Application Support/qmk/bin:$PATH" 

# my-bin (その他自分でコマンドを上書きしたいときに使う)
export PATH="$HOME/my-bin:$PATH"
