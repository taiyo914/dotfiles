import { map, rule } from 'karabiner.ts'

// Shift + Backspace で、カーソルの右の 1 文字を消す（Delete forward）
export default rule('shift-backspace-to-delete').manipulators([
  map('delete_or_backspace', 'shift', 'caps_lock').to('delete_forward'),
])
