import { map, rule } from 'karabiner.ts'
import { ifSlack } from '../conditions.ts'

// Slack で Esc を押しても何も起きないようにする。Esc でスレッドが閉じないようにするため
export default rule('slack-disable-esc', ifSlack).manipulators([map('escape', null, 'caps_lock').toNone()])
