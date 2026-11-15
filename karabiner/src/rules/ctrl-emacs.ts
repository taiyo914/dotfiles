import { map, rule, toKey, type ToEvent } from 'karabiner.ts'

// 左 Ctrl と一緒に押したときに出すキー。Shift も押したら選択になるキーは selectable を true にする
const keys: Record<string, { to: ToEvent; selectable: boolean }> = {
  h: { to: toKey('delete_or_backspace'), selectable: false },
  f: { to: toKey('right_arrow'), selectable: true },
  b: { to: toKey('left_arrow'), selectable: true },
  n: { to: toKey('down_arrow'), selectable: true },
  p: { to: toKey('up_arrow'), selectable: true },
  d: { to: toKey('delete_forward'), selectable: false },
  a: { to: toKey('left_arrow', 'left_command'), selectable: true },
  e: { to: toKey('right_arrow', 'left_command'), selectable: true },
  u: { to: toKey('delete_or_backspace', 'left_command'), selectable: false },
}

// 左 Ctrl ＋ H/D/F/B/N/P/A/E/U を Emacs 風の移動・削除にする
export default rule('ctrl-emacs').manipulators(
  Object.entries(keys).map(([key, { to, selectable }]) =>
    map(key as 'a', 'left_control', selectable ? 'shift' : undefined).to(to),
  ),
)
