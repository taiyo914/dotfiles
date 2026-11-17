import { map, rule, type FromKeyCode, type ToKeyCode } from 'karabiner.ts'
import { ifBuiltinKeyboard } from '../conditions.ts'

// JIS キーボードのキーを、US 配列のどのキーとして扱うか。ここに書いていないキーは US 配列の同じ位置のキーのまま
const keys: Array<[FromKeyCode, ToKeyCode]> = [
  // ¥ のキーを ` / ~ にする。JIS には US 配列の ` / ~ のキーがないため
  ['international3', 'grave_accent_and_tilde'],
  // ] のキーを \ / | にする。キーボードによって backslash ではなく non_us_pound として届くため
  ['non_us_pound', 'backslash'],
  // - / _ のキーと ; / : のキーを入れ替える
  ['hyphen', 'semicolon'],
  ['semicolon', 'hyphen'],
]

// JIS の - のキーで、単独なら :、Shift と一緒なら ; を入力する。Cmd などと一緒のときは上の keys のとおり ; のキーとして送り、ショートカットを変えない
const colonFirst = [
  map('hyphen', null, 'caps_lock').to('semicolon', 'left_shift'),
  map('hyphen', 'shift', 'caps_lock').to('semicolon'),
]

// 内蔵と Magic Keyboard の JIS キーボードを、少し手を加えた US 配列として使う
export default rule('builtin-custom-us-layout', ifBuiltinKeyboard).manipulators([
  ...colonFirst,
  ...keys.map(([from, to]) => map(from, null, 'any').to(to)),
])
