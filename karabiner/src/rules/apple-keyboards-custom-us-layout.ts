import { map, rule, type FromKeyCode, type ToEvent, type ToKeyCode } from 'karabiner.ts'
import { ifAppleKeyboards } from '../conditions.ts'

// JIS キーボードのキーを、US 配列のどのキーとして扱うか。ここに書いていないキーは US 配列の同じ位置のキーのまま
const keys: Array<[FromKeyCode, ToKeyCode]> = [
  // JIS の - のキーを ' / " にする。JIS の ^ のキーは US 配列と同じ = / + のまま
  ['hyphen', 'quote'],
  // JIS の ¥ のキーを \ / | にする
  ['international3', 'backslash'],
  // JIS の ] のキーを ` / ~ にする
  ['backslash', 'grave_accent_and_tilde'],
  // ; / + のキーを - / _ にする
  ['semicolon', 'hyphen'],
  // : / * のキーを : / ; にする。単独で : になるのは下の colonFirst による
  ['quote', 'semicolon'],
]

// JIS の : のキーで、単独なら :、Shift と一緒なら ; を入力する。Cmd などと一緒のときは上の keys のとおり ; のキーとして送り、ショートカットを変えない
const colonFirst = [
  map('quote', null, 'caps_lock').to('semicolon', 'left_shift'),
  map('quote', 'shift', 'caps_lock').to('semicolon'),
]

// 内蔵と Magic Keyboard の JIS キーボードを、少し手を加えた US 配列として使う
export default rule('apple-keyboards-custom-us-layout', ifAppleKeyboards).manipulators([
  ...colonFirst,
  ...keys.map(([from, to]) => map(from, null, 'any').to(to)),
])

// このルールを通ったあとに event のキーになるように、内蔵と Magic Keyboard から届く JIS のキーに置き換える
// 1 段目のルールが出したキーもこのルールを通るため、1 段目で決まった文字を出したいときに使う
export function beforeCustomUsLayout(event: ToEvent): ToEvent {
  if (!('key_code' in event)) return event
  const jisKey = keys.find(([, to]) => to === event.key_code)?.[0]
  return jisKey ? { ...event, key_code: jisKey as ToKeyCode } : event
}
