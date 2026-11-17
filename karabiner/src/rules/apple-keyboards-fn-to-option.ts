import { map, rule } from 'karabiner.ts'
import { ifAppleKeyboards } from '../conditions.ts'

// fn（地球儀）キーを右 Option にする
export default rule('apple-keyboards-fn-to-option', ifAppleKeyboards).manipulators([
  map('fn', null, 'any').to('right_option'),
])
