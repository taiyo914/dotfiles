import { map, rule } from 'karabiner.ts'
import { ifBuiltinKeyboard } from '../conditions.ts'

// fn（地球儀）キーを右 Option にする
export default rule('builtin-fn-to-option', ifBuiltinKeyboard).manipulators([
  map('fn', null, 'any').to('right_option'),
])
