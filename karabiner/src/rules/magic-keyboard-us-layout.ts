import { map, rule, type FromKeyCode, type ToKeyCode } from 'karabiner.ts'
import { ifMagicKeyboard } from '../conditions.ts'

// JIS の Magic Keyboard のキーを、US 配列のどのキーとして扱うか。ここに書いていないキーは US 配列の同じ位置のキーのまま
const keys: Array<[FromKeyCode, ToKeyCode]> = [
  // ¥ のキーを ` / ~ にする。JIS には US 配列の ` / ~ のキーがないため
  ['international3', 'grave_accent_and_tilde'],
  // ] のキーを \ / | にする。キーボードによって backslash ではなく non_us_pound として届くため
  ['non_us_pound', 'backslash'],
  // - / _ のキーと ; / : のキーを入れ替える
  ['hyphen', 'semicolon'],
  ['semicolon', 'hyphen'],
]

// JIS の Magic Keyboard を US 配列として使う。修飾キーと一緒に押しても同じキーとして扱う
export default rule('magic-keyboard-us-layout', ifMagicKeyboard).manipulators(
  keys.map(([from, to]) => map(from, null, 'any').to(to)),
)
