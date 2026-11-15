import { map, rule } from 'karabiner.ts'
import { ifChrome } from '../conditions.ts'

// 選択した文章の中の <img> タグの width を 800 にして height を消す
// コピー → スクリプトで書き換え → 貼り付けの順に動かすため、貼り付けを to_delayed_action で 0.3 秒遅らせる
export default rule('chrome-img-width', ifChrome).manipulators([
  map('i', ['command', 'control'])
    .to('c', 'command')
    .to$('sleep 0.1; /bin/sh $HOME/dotfiles/karabiner/scripts/gh-img-width.sh')
    .toDelayedAction({ key_code: 'v', modifiers: ['command'] }, [])
    .parameters({ 'basic.to_delayed_action_delay_milliseconds': 300 }),
])
