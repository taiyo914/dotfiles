import { map, rule } from 'karabiner.ts'
import { ifChrome } from '../conditions.ts'

// Cmd+↓ / Cmd+↑ で次 / 前のタブに移る
export default rule('chrome-arrow-tab-switch', ifChrome).manipulators([
  map('down_arrow', 'command').to('tab', 'control'),
  map('up_arrow', 'command').to('tab', ['control', 'shift']),
])
