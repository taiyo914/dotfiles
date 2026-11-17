import type { Stage } from './pipe.ts'
import appleKeyboardsCtrlTapToEsc from './rules/apple-keyboards-ctrl-tap-to-esc.ts'
import appleKeyboardsCustomUsLayout from './rules/apple-keyboards-custom-us-layout.ts'
import appleKeyboardsFnToOption from './rules/apple-keyboards-fn-to-option.ts'
import appleKeyboardsKanaSymbolLayer from './rules/apple-keyboards-kana-symbol-layer.ts'
import appleKeyboardsTabHoldToOption from './rules/apple-keyboards-tab-hold-to-option.ts'
import chromeArrowTabSwitch from './rules/chrome-arrow-tab-switch.ts'
import chromeImgWidth from './rules/chrome-img-width.ts'
import chromeNewTabInGroup from './rules/chrome-new-tab-in-group.ts'
import chromeSplitView from './rules/chrome-split-view.ts'
import chromeZoomIn from './rules/chrome-zoom-in.ts'
import ctrlEmacs from './rules/ctrl-emacs.ts'
import imeComposing from './rules/ime-composing.ts'
import imeDisableEsc from './rules/ime-disable-esc.ts'
import macbookKeyboardDisabled from './rules/macbook-keyboard-disabled.ts'
import magicKeyboardDisabled from './rules/magic-keyboard-disabled.ts'
import shiftBackspaceToDelete from './rules/shift-backspace-to-delete.ts'
import slackDisableEsc from './rules/slack-disable-esc.ts'
import spaceLayer from './rules/space-layer.ts'

// 上の段のルールが出したキーを、下の段のルールに順番に通す。
// 同じ段に並べたルールは、上にあるものが先に判定され、お互いの出力は受け取らない。
// 1 段目は物理キーを受け取る。タップと長押しで動きを変えるルールは 1 段目にしか置けない
export const stages: Stage[] = [
  [
    macbookKeyboardDisabled,
    magicKeyboardDisabled,
    spaceLayer,
    appleKeyboardsKanaSymbolLayer,
    appleKeyboardsFnToOption,
    appleKeyboardsCtrlTapToEsc,
    appleKeyboardsTabHoldToOption,
    chromeImgWidth,
  ],
  appleKeyboardsCustomUsLayout,
  [ctrlEmacs, shiftBackspaceToDelete],
  [chromeArrowTabSwitch, chromeSplitView, chromeZoomIn, chromeNewTabInGroup],
  [slackDisableEsc, imeDisableEsc],
  imeComposing,
]
