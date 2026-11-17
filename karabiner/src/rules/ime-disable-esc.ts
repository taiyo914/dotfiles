import { map, rule } from 'karabiner.ts'
import { imeComposing } from './ime-composing.ts'

// 日本語の入力途中に Esc を押しても、入力した文字が消えないようにする。
// ime_composing はクリックで確定したときなどに 1 のまま残ることがあるので、1 回目の Esc で 0 に戻し、2 回目の Esc は通す
export default rule('ime-disable-esc').manipulators([
  map('escape', null, 'caps_lock').toVar(imeComposing, 0).condition({ type: 'variable_if', name: imeComposing, value: 1 }),
])
