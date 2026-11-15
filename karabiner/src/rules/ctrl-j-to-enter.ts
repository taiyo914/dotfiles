import { map, rule } from 'karabiner.ts'

// 左 Ctrl + J で Enter を入力する
export default rule('ctrl-j-to-enter').manipulators([map('j', 'left_control').to('return_or_enter')])
