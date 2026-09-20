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
  claude --permission-mode auto --model "$model" "$@"
}

vcc() { cd ~/vault && cc "$@"; }

# ccc = claude code config
alias ccc='code "$DOTFILES/claude/settings.json"'