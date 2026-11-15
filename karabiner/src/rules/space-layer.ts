import { ifExpression, ifVar, map, rule, toKey, type ToEvent } from 'karabiner.ts'
import { unlessImeComposing } from './ime-composing.ts'

const layerActive = 'space_layer'
const layerUsed = 'space_used'
const pressedAt = 'space_down_ms'
const tappedAt = 'space_tap_ms'

// Space を押している間にキーを押したときに出すキー。左手はカーソル移動と削除、右手は数字
const layerKeys = {
  e: toKey('up_arrow'),
  s: toKey('left_arrow'),
  d: toKey('down_arrow'),
  f: toKey('right_arrow'),
  a: toKey('left_arrow', 'left_command'),
  g: toKey('right_arrow', 'left_command'),
  w: toKey('left_arrow', 'left_option'),
  r: toKey('right_arrow', 'left_option'),
  q: toKey('delete_or_backspace', 'left_option'),
  t: toKey('delete_forward'),
  h: toKey('0'),
  j: toKey('1'),
  k: toKey('2'),
  l: toKey('3'),
  // L の右のキー。物理キーを受け取る段なので、印字や入れ替えに関係なく semicolon として届く
  semicolon: toKey('4'),
  y: toKey('5'),
  u: toKey('6'),
  i: toKey('7'),
  o: toKey('8'),
  p: toKey('9'),
}

// Space をタップしたときに出すキー。Space を入力して英数に切り替える
const tapEvents: ToEvent[] = [toKey('spacebar'), unlessImeComposing(toKey('japanese_eisuu'))]

const setVar = (name: string, value: number): ToEvent => ({ set_variable: { name, value } })
const setNow = (name: string): ToEvent => ({ set_variable: { name, expression: 'system.now.milliseconds' } })
const ifLayerUnused = { type: 'variable_if', name: layerUsed, value: 0 } as const

// Space 長押しで矢印・削除レイヤー、タップで Space ＋ 英数にする
export default rule('space-layer').manipulators([
  // Space をタップした直後にもう一度押したら、レイヤーにせず Space を連続で入力する
  map('spacebar', null, 'any')
    .to([tapEvents[1], tapEvents[0]])
    .condition(ifExpression(`system.now.milliseconds - ${tappedAt} < 200`)),

  map('spacebar', null, 'any')
    .to([setVar(layerActive, 1), setVar(layerUsed, 0), setNow(pressedAt)])
    .toAfterKeyUp([
      setVar(layerActive, 0),
      ...tapEvents.map((e) => ({ ...e, conditions: [ifLayerUnused, ...(e.conditions ?? [])] })),
      { ...setNow(tappedAt), conditions: [ifLayerUnused] },
    ]),

  // Space を押してから 0.1 秒以内にほかのキーを押したら、文章を速く打っているとみなして Space とそのキーを順番に出す
  map({ any: 'key_code', modifiers: { optional: ['any'] } })
    .to([...tapEvents, setVar(layerActive, 0), setVar(layerUsed, 1), { from_event: true }])
    .condition(ifVar(layerActive, 1), ifExpression(`system.now.milliseconds - ${pressedAt} < 100`)),

  ...Object.entries(layerKeys).map(([key, event]) =>
    map(key as 'e', null, 'any')
      .to([setVar(layerUsed, 1), event])
      .condition(ifVar(layerActive, 1)),
  ),

  map({ any: 'key_code', modifiers: { optional: ['any'] } })
    .to([setVar(layerUsed, 1), { from_event: true }])
    .condition(ifVar(layerActive, 1)),
])
