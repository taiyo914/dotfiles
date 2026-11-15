import { map, rule } from 'karabiner.ts'
import { ifChrome } from '../conditions.ts'

// Cmd+D で分割ビューを開いて右側を新しいタブにする。Cmd+Shift+D は右側を「タブを選択」画面のままにする
export default rule('chrome-split-view', ifChrome).manipulators([
  map('d', ['command', 'shift']).to('n', ['command', 'option']),
  map('d', 'command')
    .to('n', ['command', 'option'])
    .to$('/bin/sh $HOME/dotfiles/karabiner/scripts/chrome-split-newtab.sh'),
])
