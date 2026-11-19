import { map, rule } from 'karabiner.ts'
import { ifSlack } from '../conditions.ts'

// Cmd+↓ / Cmd+↑ で次 / 前のチャンネル、Cmd+Shift+↓ / Cmd+Shift+↑ で次 / 前の未読のチャンネルに移る
export default rule('slack-arrow-channel-switch', ifSlack).manipulators([
  map('down_arrow', 'command').to('down_arrow', 'option'),
  map('up_arrow', 'command').to('up_arrow', 'option'),
  map('down_arrow', ['command', 'shift']).to('down_arrow', ['option', 'shift']),
  map('up_arrow', ['command', 'shift']).to('up_arrow', ['option', 'shift']),
])
