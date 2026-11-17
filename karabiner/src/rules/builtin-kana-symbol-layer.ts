import { ifExpression, ifVar, map, rule, toKey, type ToEvent } from 'karabiner.ts'
import { ifBuiltinKeyboard } from '../conditions.ts'

const layerActive = 'kana_layer'
const layerUsed = 'kana_used'
const pressedAt = 'kana_down_ms'

// かなキーを押している間にキーを押したときに出す記号。CLine46 の記号レイヤー（zmk-config の layer_2）と同じ位置にする
const layerKeys: Record<string, ToEvent> = {
  q: toKey('quote'), // '
  w: toKey('quote', 'left_shift'), // "
  e: toKey('equal_sign'), // =
  r: toKey('6', 'left_shift'), // ^
  t: toKey('grave_accent_and_tilde', 'left_shift'), // ~
  u: toKey('9', 'left_shift'), // (
  i: toKey('0', 'left_shift'), // )
  p: toKey('equal_sign', 'left_shift'), // +
  a: toKey('2', 'left_shift'), // @
  s: toKey('8', 'left_shift'), // *
  d: toKey('4', 'left_shift'), // $
  g: toKey('grave_accent_and_tilde'), // `
  h: toKey('3', 'left_shift'), // #
  j: toKey('open_bracket'), // [
  k: toKey('close_bracket'), // ]
  x: toKey('1', 'left_shift'), // !
  // : / ; のキー。semicolon ではなく hyphen を出すのは、下の段の builtin-custom-us-layout が hyphen を「単独なら :、Shift と一緒なら ;」に変えるため
  c: toKey('hyphen'),
  v: toKey('backslash', 'left_shift'), // |
  b: toKey('backslash'), // \
  n: toKey('7', 'left_shift'), // &
  m: toKey('5', 'left_shift'), // %
}

const tapEvent = toKey('japanese_kana')

const setVar = (name: string, value: number): ToEvent => ({ set_variable: { name, value } })
const setNow = (name: string): ToEvent => ({ set_variable: { name, expression: 'system.now.milliseconds' } })
const ifLayerUnused = { type: 'variable_if', name: layerUsed, value: 0 } as const

// かなキー長押しで記号レイヤー、タップでかなにする
export default rule('builtin-kana-symbol-layer', ifBuiltinKeyboard).manipulators([
  map('japanese_kana', null, 'any')
    .to([setVar(layerActive, 1), setVar(layerUsed, 0), setNow(pressedAt)])
    .toAfterKeyUp([setVar(layerActive, 0), { ...tapEvent, conditions: [ifLayerUnused] }]),

  // かなキーを押してから 0.1 秒以内にほかのキーを押したら、文章を速く打っているとみなして、かなとそのキーを順番に出す
  map({ any: 'key_code', modifiers: { optional: ['any'] } })
    .to([tapEvent, setVar(layerActive, 0), setVar(layerUsed, 1), { from_event: true }])
    .condition(ifVar(layerActive, 1), ifExpression(`system.now.milliseconds - ${pressedAt} < 100`)),

  ...Object.entries(layerKeys).map(([key, event]) =>
    map(key as 'q', null, 'any')
      .to([setVar(layerUsed, 1), event])
      .condition(ifVar(layerActive, 1)),
  ),

  map({ any: 'key_code', modifiers: { optional: ['any'] } })
    .to([setVar(layerUsed, 1), { from_event: true }])
    .condition(ifVar(layerActive, 1)),
])
