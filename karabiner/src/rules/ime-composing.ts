import { ifInputSource, map, rule, type ToEvent } from 'karabiner.ts'

// 日本語の入力途中（変換が確定する前）なら 1、そうでなければ 0 になる変数
export const imeComposing = 'ime_composing'

const letters = 'abcdefghijklmnopqrstuvwxyz'.split('') as Array<'a'>

// 日本語入力でアルファベットを打ったら入力途中、Enter・英数・かなで確定したとみなす
export default rule('ime-composing').manipulators([
  ...(['return_or_enter', 'japanese_eisuu', 'japanese_kana'] as const).map((key) =>
    map(key, null, 'any').to(key).toVar(imeComposing, 0),
  ),
  ...letters.map((key) =>
    map(key, null, ['shift', 'caps_lock'])
      .to(key)
      .toVar(imeComposing, 1)
      .condition(ifInputSource({ language: '^ja$' })),
  ),
])

// 日本語の入力途中でないときだけ出すキーにする
export function unlessImeComposing(event: ToEvent): ToEvent {
  return { ...event, conditions: [{ type: 'variable_if', name: imeComposing, value: 0 }] }
}
