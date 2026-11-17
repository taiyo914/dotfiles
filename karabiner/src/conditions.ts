import { ifApp, ifDevice } from 'karabiner.ts'

// 内蔵キーボードと Magic Keyboard with Touch ID（Vendor ID 1452 / Product ID 666）のときだけ動かす
export const ifAppleKeyboards = ifDevice([{ is_built_in_keyboard: true }, { vendor_id: 1452, product_id: 666 }])

// MacBook の内蔵キーボードのときだけ動かす
export const ifMacbookKeyboard = ifDevice({ is_built_in_keyboard: true })

// Magic Keyboard with Touch ID のときだけ動かす
export const ifMagicKeyboard = ifDevice({ vendor_id: 1452, product_id: 666 })

// 前面のアプリが Chrome / Slack のときだけ動かす
export const ifChrome = ifApp(/^com\.google\.Chrome$/)
export const ifSlack = ifApp(/^com\.tinyspeck\.slackmacgap$/)
