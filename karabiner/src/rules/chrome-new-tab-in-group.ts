import { map, rule } from 'karabiner.ts'
import { ifChrome } from '../conditions.ts'

// Cmd+T でタブグループの中に、Cmd+Ctrl+T でタブグループの外に新しいタブを開く（chrome/new-tab-in-group のショートカットを送る）
export default rule('chrome-new-tab-in-group', ifChrome).manipulators([
  map('t', 'command').to('t', ['option', 'shift']),
  map('t', ['command', 'control']).to('y', ['option', 'shift']),
])
