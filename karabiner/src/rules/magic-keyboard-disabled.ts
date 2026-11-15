import { map, rule } from 'karabiner.ts'
import { ifMagicKeyboard } from '../conditions.ts'
import { disabledByDefault } from '../pipe.ts'

// Magic Keyboard with Touch ID のキーを、Touch ID 以外すべて無効にする
export default disabledByDefault(
  rule('magic-keyboard-disabled', ifMagicKeyboard).manipulators([
    map({ any: 'key_code', modifiers: { optional: ['any'] } }).toNone(),
    map({ any: 'consumer_key_code', modifiers: { optional: ['any'] } }).toNone(),
  ]),
)
