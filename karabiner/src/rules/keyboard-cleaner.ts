import { map, rule } from 'karabiner.ts'
import { disabledByDefault } from '../pipe.ts'

// 掃除のときだけ、すべてのキーボードのキーを無効にする。普段は OFF にしておき、Karabiner の画面で ON にする
export default disabledByDefault(
  rule('keyboard-cleaner (💡Turn on only while cleaning)').manipulators([
    map({ any: 'key_code', modifiers: { optional: ['any'] } }).toNone(),
    map({ any: 'consumer_key_code', modifiers: { optional: ['any'] } }).toNone(),
  ]),
)
