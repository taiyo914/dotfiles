import { map, rule } from 'karabiner.ts'
import { ifChrome } from '../conditions.ts'

// Cmd+Shift+; と Cmd+Shift+- で拡大する（Chrome の拡大の Cmd+= を送る）
export default rule('chrome-zoom-in', ifChrome).manipulators([
  map('semicolon', ['command', 'shift']).to('equal_sign', 'command'),
  map('hyphen', ['command', 'shift']).to('equal_sign', 'command'),
])
