import { map, rule } from 'karabiner.ts'
import { ifChrome } from '../conditions.ts'

// Cmd+Shift+- で拡大する（Chrome の拡大の Cmd+= を送る）。縮小の Cmd+- と同じキーで拡大・縮小できるようにするため
export default rule('chrome-zoom-in', ifChrome).manipulators([
  map('hyphen', ['command', 'shift']).to('equal_sign', 'command'),
])
