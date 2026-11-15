import { map, rule, toKey, type ToEvent } from 'karabiner.ts'
import { ifInternalKeyboard } from '../conditions.ts'

// 内蔵 JIS キーボードの記号のキーを押したときに出す記号。仮想キーボードを ANSI にしたことでずれた記号を印字どおりに直す
const unshifted: Record<string, ToEvent> = {
  equal_sign: toKey('6', 'left_shift'), // ^
  international3: toKey('backslash'), // ¥
  grave_accent_and_tilde: toKey('backslash'), // ¥
  open_bracket: toKey('2', 'left_shift'), // @
  close_bracket: toKey('open_bracket'), // [
  quote: toKey('semicolon', 'left_shift'), // :
  backslash: toKey('close_bracket'), // ]
  non_us_pound: toKey('close_bracket'), // ]
  international1: toKey('hyphen', 'left_shift'), // _
}

// Shift と一緒に押したときに出す記号
const shifted: Record<string, ToEvent> = {
  '2': toKey('quote', 'left_shift'), // "
  '6': toKey('7', 'left_shift'), // &
  '7': toKey('quote'), // '
  '8': toKey('9', 'left_shift'), // (
  '9': toKey('0', 'left_shift'), // )
  '0': toKey('vk_none'),
  hyphen: toKey('equal_sign'), // =
  equal_sign: toKey('grave_accent_and_tilde', 'left_shift'), // ~
  international3: toKey('backslash', 'left_shift'), // |
  grave_accent_and_tilde: toKey('backslash', 'left_shift'), // |
  open_bracket: toKey('grave_accent_and_tilde'), // `
  close_bracket: toKey('open_bracket', 'left_shift'), // {
  semicolon: toKey('equal_sign', 'left_shift'), // +
  quote: toKey('8', 'left_shift'), // *
  backslash: toKey('close_bracket', 'left_shift'), // }
  non_us_pound: toKey('close_bracket', 'left_shift'), // }
  international1: toKey('hyphen', 'left_shift'), // _
}

// 内蔵 JIS キーボードの記号を印字どおりに入力する
export default rule('builtin-jis-symbols', ifInternalKeyboard).manipulators([
  ...Object.entries(unshifted).map(([key, event]) => map(key as 'a', null, 'caps_lock').to(event)),
  ...Object.entries(shifted).map(([key, event]) => map(key as 'a', 'shift', 'caps_lock').to(event)),
])
