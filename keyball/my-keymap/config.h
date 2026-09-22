#pragma once

//////////////////////////////////////////////////////////////////////////////
// 設定値
//
// コメントアウトしてある行は、QMK 0.22.14 と Keyball が使う既定値をそのまま書いてある。
// 変えたいときはコメントを外して値を書き換える。
//
// 注意: 次の5つは起動時に EEPROM の保存値（KBC_SAVE で保存したもの）で
// 上書きされるため、ここに書いた値は EEPROM が未保存のときしか効かない。
//   CPI / スクロール除数 / スクロールスナップのモード /
//   オートマウスの有効無効 / オートマウスのタイムアウト
// ここの値を確実に効かせるには EE_CLR で EEPROM を消す。

// --- トラックボール（lib/keyball/keyball.h） ---

// カーソル感度。100〜12000、100 単位
//#define KEYBALL_CPI_DEFAULT 500

// スクロール量の除数。1/2^(n-1) で、数字が大きいほど遅い。1〜7。6 は 1/32
// QMK と Keyball の既定値は 4（1/8）
#define KEYBALL_SCROLL_DIV_DEFAULT 6

// マウスレポートを送る間隔(ms)。8 で 125Hz。0 で制限なし
//#define KEYBALL_REPORTMOUSE_INTERVAL 8

// スクロールモードを切り替えた直後、この時間(ms)はボールの動きを捨てる
//#define KEYBALL_SCROLLBALL_INHIVITOR 50

// スクロール方向の固定。0:機能ごと無効(常に縦横自由) 1:縦固定 2:実機で切替(SSNP_*)
// 0 にしているので、レイヤー3 の SSNP_VRT / SSNP_HOR / SSNP_FRE は何もしない
#define KEYBALL_SCROLLSNAP_ENABLE 0

// 動きが止まってから固定を解除するまでの時間(ms)。ENABLE が 1 のときだけ使われる
//#define KEYBALL_SCROLLSNAP_RESET_TIMER 100

// 固定した方向から抜けるのに必要な、直交方向の移動量。ENABLE が 1 のときだけ使われる
//#define KEYBALL_SCROLLSNAP_TENSION_THRESHOLD 12

// センサーに SROM を書き込む。0x04 か 0x81。ファームが 4KB 以上大きくなる
//#define KEYBALL_PMW3360_UPLOAD_SROM_ID 0x04

// --- ポインティングデバイス（quantum/pointing_device/pointing_device.c） ---
// Keyball のドライバが出したレポートに対して、後段で適用される

// カーソルの左右・上下を反転する。スクロールには効かない
//#define POINTING_DEVICE_INVERT_X
//#define POINTING_DEVICE_INVERT_Y

// センサーの向きを回す。3つのうち1つだけ定義できる
//#define POINTING_DEVICE_ROTATION_90
//#define POINTING_DEVICE_ROTATION_180
//#define POINTING_DEVICE_ROTATION_270

// センサーを読む間隔(ms)。既定は未定義で制限なし。
// Keyball は KEYBALL_REPORTMOUSE_INTERVAL で同じことをしている
//#define POINTING_DEVICE_TASK_THROTTLE_MS 1

// 1レポートで送れる移動量の上限を ±127 から ±32767 に広げる
//#define MOUSE_EXTENDED_REPORT

// --- オートマウスレイヤー（quantum/pointing_device/pointing_device_auto_mouse.h） ---

#define POINTING_DEVICE_AUTO_MOUSE_ENABLE

// マウスレイヤーとして使うレイヤー番号
#define AUTO_MOUSE_DEFAULT_LAYER 2

// レイヤーから抜けるまでの時間(ms)。QMK の既定値は 650。
// 実機では AML_I50 / AML_D50 で 100〜1000 を 50 刻みで変更できる
// 1000 を超える値は keyball.c が起動時に EEPROM の値で上書きしてしまうので、
// keymap.c の keyboard_post_init_user() で同じ値を set_auto_mouse_timeout() に渡している
#define AUTO_MOUSE_TIME 10000

// キーを打った後、この時間(ms)はレイヤーに入らない。既定は TAPPING_TERM と同じ値
//#define AUTO_MOUSE_DELAY 200

// レイヤーの状態を更新する間隔(ms)
//#define AUTO_MOUSE_DEBOUNCE 25

// レイヤーに入るのに必要なボールの累積移動量。keymap.c の auto_mouse_activation() で使う
#define AML_ENTER_THRESHOLD 40

// ボールがこの時間(ms)止まったら累積移動量を捨てる。keymap.c の auto_mouse_activation() で使う
#define AML_ENTER_RESET_MS 200

// --- タップとホールド（quantum/action_tapping.h） ---
// 親指の LT() や LGUI_T() の効き方を決める

// ホールドと判定するまでの時間(ms)
//#define TAPPING_TERM 200

// タップ直後に押し直したとき、連打として扱う時間(ms)。既定は TAPPING_TERM と同じ値
//#define QUICK_TAP_TERM 200

// TT() でトグルするのに必要な連打回数
//#define TAPPING_TOGGLE 5

// 他のキーを押して離したら、時間が来ていなくてもホールド扱いにする
//#define PERMISSIVE_HOLD

// 他のキーを押した時点でホールド扱いにする
//#define HOLD_ON_OTHER_KEY_PRESS

// ホールドしたが何も押さなかったとき、離した時点でタップを送る
//#define RETRO_TAPPING

// キーごとに TAPPING_TERM を変える get_tapping_term() を使えるようにする
//#define TAPPING_TERM_PER_KEY

// --- その他 ---

// tap_code() 関数がキーを押している時間(ms)。 デフォルトで設定されている。
#define TAP_CODE_DELAY 5

// Remap で編集できるレイヤー数。増やすと EEPROM の消費が増える
//#define DYNAMIC_KEYMAP_LAYER_COUNT 4

// 無操作で OLED を消すまでの時間(ms)。0 で消さない
//#define OLED_TIMEOUT 60000

// OLED の明るさ。0〜255
//#define OLED_BRIGHTNESS 255

// RGB ライトを機能ごと無効にしたい場合は、config.h ではなく
// rules.mk の RGBLIGHT_ENABLE を no にする

// 以下はRGBLIGHT_ENABLEをonにしたときに、どのような光り方をファームウェアに入れるかの設定
#ifdef RGBLIGHT_ENABLE
//#    define RGBLIGHT_EFFECT_BREATHING
//#    define RGBLIGHT_EFFECT_RAINBOW_MOOD
//#    define RGBLIGHT_EFFECT_RAINBOW_SWIRL
//#    define RGBLIGHT_EFFECT_SNAKE
//#    define RGBLIGHT_EFFECT_KNIGHT
//#    define RGBLIGHT_EFFECT_CHRISTMAS
#    define RGBLIGHT_EFFECT_STATIC_GRADIENT
//#    define RGBLIGHT_EFFECT_RGB_TEST
//#    define RGBLIGHT_EFFECT_ALTERNATING
//#    define RGBLIGHT_EFFECT_TWINKLE
#endif