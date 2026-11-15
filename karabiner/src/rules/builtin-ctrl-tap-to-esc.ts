import { map, rule } from 'karabiner.ts'
import { ifBuiltinKeyboard } from '../conditions.ts'

// 左 Ctrl をタップしたら Esc、200 ms 以上押すかほかのキーと一緒に押したら Ctrl にする
export default rule('builtin-ctrl-tap-to-esc', ifBuiltinKeyboard).manipulators([
  map('left_control', null, 'any')
    .to('left_control')
    .toIfAlone('escape')
    .parameters({ 'basic.to_if_alone_timeout_milliseconds': 200 }),
])
