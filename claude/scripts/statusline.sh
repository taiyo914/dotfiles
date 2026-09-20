#!/bin/bash
input=$(cat)

MODEL_RAW=$(echo "$input" | jq -r '.model.display_name')

# "(1M context)" -> "(1M)" に短縮する
MODEL=$(echo "$MODEL_RAW" | sed -E 's/\(([0-9]+[A-Za-z]*) context\)/(\1)/')

DIR=$(echo "$input" | jq -r '.workspace.current_dir')
COST=$(echo "$input" | jq -r '.cost.total_cost_usd // 0')
DURATION_MS=$(echo "$input" | jq -r '.cost.total_duration_ms // 0')
PCT=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)

CYAN='\033[36m'; GREEN='\033[32m'; YELLOW='\033[33m'; RED='\033[31m'; RESET='\033[0m'

# git ブランチ / 変更状態
BRANCH_INFO=""
if git rev-parse --git-dir > /dev/null 2>&1; then
    BRANCH=$(git branch --show-current 2>/dev/null)
    STAGED=$(git diff --cached --numstat 2>/dev/null | wc -l | tr -d ' ')
    MODIFIED=$(git diff --numstat 2>/dev/null | wc -l | tr -d ' ')
    GIT_STATUS=""
    [ "$STAGED" -gt 0 ] && GIT_STATUS="${GREEN}+${STAGED}${RESET}"
    [ "$MODIFIED" -gt 0 ] && GIT_STATUS="${GIT_STATUS}${YELLOW}~${MODIFIED}${RESET}"
    BRANCH_INFO=" | $BRANCH $GIT_STATUS"
fi

# コンテキスト使用率バー（閾値で色を変える、幅6文字の細めバー）
if [ "$PCT" -ge 90 ]; then BAR_COLOR="$RED"
elif [ "$PCT" -ge 70 ]; then BAR_COLOR="$YELLOW"
else BAR_COLOR="$GREEN"; fi

BAR_WIDTH=6
FILLED=$((PCT * BAR_WIDTH / 100)); EMPTY=$((BAR_WIDTH - FILLED))
printf -v FILL "%${FILLED}s"; printf -v PAD "%${EMPTY}s"
BAR="${FILL// /█}${PAD// /░}"

COST_FMT=$(printf '$%.2f' "$COST")
MINS=$((DURATION_MS / 60000))

# 画面幅を取得し、収まらなければ2行に折り返す
COLS=$(stty size </dev/tty 2>/dev/null | awk '{print $2}')
COLS=${COLS:-${COLUMNS:-$(tput cols 2>/dev/null || echo 120)}}

LINE1="${CYAN}[$MODEL]${RESET} | ${DIR##*/}${BRANCH_INFO}"
LINE2="${BAR_COLOR}${BAR}${RESET} ${PCT}% | ${YELLOW}${COST_FMT}${RESET} | ${MINS}m"

visible_len=$(echo -e "${LINE1} | ${LINE2}" | sed 's/\x1b\[[0-9;]*m//g' | tr -d '\n' | wc -m)

if [ "$visible_len" -gt "$COLS" ]; then
    echo -e "$LINE1"
    echo -e "$LINE2"
else
    echo -e "${LINE1} | ${LINE2}"
fi