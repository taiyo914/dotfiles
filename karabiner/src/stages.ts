import type { Stage } from './pipe.ts'
import builtinCtrlTapToEsc from './rules/builtin-ctrl-tap-to-esc.ts'
import builtinFnToOption from './rules/builtin-fn-to-option.ts'
import builtinKeyboardCleaner from './rules/builtin-keyboard-cleaner.ts'
import builtinKanaSymbolLayer from './rules/builtin-kana-symbol-layer.ts'
import builtinTabHoldToOption from './rules/builtin-tab-hold-to-option.ts'
import builtinCustomUsLayout from './rules/builtin-custom-us-layout.ts'
import chromeArrowTabSwitch from './rules/chrome-arrow-tab-switch.ts'
import chromeImgWidth from './rules/chrome-img-width.ts'
import chromeNewTabInGroup from './rules/chrome-new-tab-in-group.ts'
import chromeSplitView from './rules/chrome-split-view.ts'
import chromeZoomIn from './rules/chrome-zoom-in.ts'
import ctrlEmacs from './rules/ctrl-emacs.ts'
import imeComposing from './rules/ime-composing.ts'
import imeDisableEsc from './rules/ime-disable-esc.ts'
import magicKeyboardDisabled from './rules/magic-keyboard-disabled.ts'
import shiftBackspaceToDelete from './rules/shift-backspace-to-delete.ts'
import slackDisableEsc from './rules/slack-disable-esc.ts'
import spaceLayer from './rules/space-layer.ts'

// 上の段のルールが出したキーを、下の段のルールに順番に通す。
// 同じ段に並べたルールは、上にあるものが先に判定され、お互いの出力は受け取らない。
// 1 段目は物理キーを受け取る。タップと長押しで動きを変えるルールは 1 段目にしか置けない
export const stages: Stage[] = [
  [
    builtinKeyboardCleaner,
    magicKeyboardDisabled,
    spaceLayer,
    builtinKanaSymbolLayer,
    builtinFnToOption,
    builtinCtrlTapToEsc,
    builtinTabHoldToOption,
    chromeImgWidth,
  ],
  builtinCustomUsLayout,
  [ctrlEmacs, shiftBackspaceToDelete],
  [chromeArrowTabSwitch, chromeSplitView, chromeZoomIn, chromeNewTabInGroup],
  [slackDisableEsc, imeDisableEsc],
  imeComposing,
]
