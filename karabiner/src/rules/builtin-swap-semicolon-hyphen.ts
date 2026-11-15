import { map, rule } from 'karabiner.ts'
import { ifInternalKeyboard } from '../conditions.ts'

// Shift 以外の修飾キー。Shift と一緒のときは builtin-jis-symbols が出す印字どおりの記号のままにするため
const exceptShift = ['command', 'control', 'option', 'caps_lock', 'fn'] as const

// - と ; を入れ替える。Cmd や Ctrl と一緒に押しても入れ替える
export default rule('builtin-swap-semicolon-hyphen', ifInternalKeyboard).manipulators([
  map('semicolon', null, [...exceptShift]).to('hyphen'),
  map('hyphen', null, [...exceptShift]).to('semicolon'),
])
