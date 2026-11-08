# ClaudeCodeの設定やエイリアス

# claudecodeの画面設定
export CLAUDE_CODE_NO_FLICKER=1

cc() {
  local model
  case "$1" in
    haiku)  model="haiku";        shift ;;
    sonnet) model="sonnet[1m]";   shift ;;
    opus)   model="opus[1m]";     shift ;;
    opus4)  model="claude-opus-4-6[1m]"; shift ;;
    fable)  model="fable";        shift ;;
    *)      model="opus[1m]" ;;
  esac
  # モデル名の次に effort のレベルが書かれていたら --effort で渡す
  local -a effort_opt
  case "$1" in
    low|medium|high|xhigh|max) effort_opt=(--effort "$1"); shift ;;
  esac
  claude --permission-mode auto --model "$model" "${effort_opt[@]}" "$@"
}

vcc() { cd ~/vault && cc "$@"; }

# emoji キーワード で、キーワードに合う絵文字を sonnet に挙げてもらう
emoji() {
  if [[ $# -eq 0 ]]; then
    echo "使い方: emoji キーワード" >&2
    return 1
  fi
  # 速く答えさせるため、ツールを使わせず会話の履歴も残さない
  claude -p "キーワード: $*" \
    --model sonnet \
    --tools "" \
    --no-session-persistence \
    --system-prompt "あなたは日本語または英語のキーワードに合う絵文字を探す。合う絵文字を10個、関係の強い順に挙げる。各行は必ず絵文字1個で始め、半角スペースの後に絵文字の英語名を書く。絵文字以外の文字で行を始めない。それ以外の文は書かない。"
}

# ccc = claude code config
alias ccc='nvim "$DOTFILES/claude/settings.json"'