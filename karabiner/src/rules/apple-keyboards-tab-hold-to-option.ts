import { map, rule } from 'karabiner.ts'
import { ifAppleKeyboards } from '../conditions.ts'

// Tab をタップしたら Tab、200 ms 以上押すかほかのキーと一緒に押したら左 Option にする
export default rule('apple-keyboards-tab-hold-to-option', ifAppleKeyboards).manipulators([
  map('tab', null, 'any')
    .to('left_option')
    .toIfAlone('tab')
    .parameters({ 'basic.to_if_alone_timeout_milliseconds': 200 }),
])
