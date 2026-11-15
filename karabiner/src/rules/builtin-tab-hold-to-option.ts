import { map, rule } from 'karabiner.ts'
import { ifBuiltinKeyboard } from '../conditions.ts'

// Tab をタップしたら Tab、200 ms 以上押すかほかのキーと一緒に押したら左 Option にする
export default rule('builtin-tab-hold-to-option', ifBuiltinKeyboard).manipulators([
  map('tab', null, 'any')
    .to('left_option')
    .toIfAlone('tab')
    .parameters({ 'basic.to_if_alone_timeout_milliseconds': 200 }),
])
