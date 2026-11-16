#!/bin/sh
# フォーカスしている pane と、同じ分け目で隣り合う pane の並びを「左右」⇄「上下」で切り替える
# 隣り合う相手が 1 つの pane のときだけ動く。相手が複数の pane のかたまりのときは何もしない
# herdr の [[keys.command]] から呼ばれる前提（HERDR_* の環境変数を使う）
set -eu

herdr="${HERDR_BIN_PATH:-herdr}"
pane="$HERDR_ACTIVE_PANE_ID"
tab="$HERDR_ACTIVE_TAB_ID"

# 出力: "<1 番目の pane> <2 番目の pane> <今の分け方>"。切り替えられないときは何も出さない
target=$("$herdr" pane layout --pane "$pane" | jq -r --arg p "$pane" '
  def inside($r; $o):
    $r.x >= $o.x and $r.y >= $o.y
    and $r.x + $r.width <= $o.x + $o.width
    and $r.y + $r.height <= $o.y + $o.height;

  .result.layout as $l
  | ($l.panes[] | select(.pane_id == $p)) as $me
  # pane を含む分け目のうち一番小さいものが、その pane を直接分けている分け目
  | ([$l.splits[] | select(inside($me.rect; .rect))] | min_by(.rect.width * .rect.height)) as $parent
  | if $l.zoomed or $parent == null then empty else
      [$l.panes[] | select(inside(.rect; $parent.rect))]
      | sort_by(.rect.x, .rect.y)
      | if length == 2 then "\(.[0].pane_id) \(.[1].pane_id) \($parent.direction)" else empty end
    end
')
[ -n "$target" ] || exit 0
set -- $target
first=$1
second=$2
direction=$3

if [ "$direction" = "right" ]; then
  next="down"
else
  next="right"
fi

# 同じタブの中では move できないので、一度新しいタブに出してから元のタブに戻す
# move した pane は相手の右か下に入るので、2 番目（右か下）の pane を動かすと並び順が変わらない
moved=$("$herdr" pane move "$second" --new-tab --no-focus \
  | jq -r '.result.move_result.pane.pane_id')
# 切り替える前にフォーカスしていた pane に、切り替えたあともフォーカスする
if [ "$pane" = "$second" ]; then
  focus="--focus"
else
  focus="--no-focus"
fi
"$herdr" pane move "$moved" --tab "$tab" --split "$next" --target-pane "$first" "$focus" >/dev/null
