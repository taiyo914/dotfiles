/* 
ファームウェアを書き込むコマンド
```
cd /path/to/qmk
make keyball/keyball61:my-keymap:flash
```
*/

#include QMK_KEYBOARD_H

#include "quantum.h"

// Keyball61 はトラックボールが右手側にあるため、右手側の下段中央3つにはスイッチが無いため XXXXXXX にしている。

// clang-format off
const uint16_t PROGMEM keymaps[][MATRIX_ROWS][MATRIX_COLS] = {
  // 文字入力
  [0] = LAYOUT_universal(
    KC_ESC  , KC_SCRL    , KC_PAUS    , KC_KB_MUTE , KC_KB_VOLUME_DOWN , KC_KB_VOLUME_UP ,                                  G(A(KC_I))    , C(S(G(KC_4))) , S(G(KC_2)) , _______   , _______ , KC_DEL,
    KC_TAB  , KC_Q       , KC_W       , KC_E       , KC_R              , KC_T            ,                                  KC_Y          , KC_U          , KC_I       , KC_O      , KC_P    , KC_BSPC,
    KC_LCTL , KC_A       , KC_S       , KC_D       , KC_F              , KC_G            ,                                  KC_H          , KC_J          , KC_K       , KC_L      , KC_MINS , KC_ENT,
    KC_LSFT , KC_Z       , KC_X       , KC_C       , KC_V              , KC_B            , _______      , TG(2)           , KC_N          , KC_M          , KC_COMM    , KC_DOT    , KC_SLSH , KC_RSFT,
    MO(3)   , KC_LCTL    , KC_RSFT    , KC_LALT    , LGUI_T(KC_LNG2)   , LT(2,KC_SPC)    , LT(3,KC_SPC) , RGUI_T(KC_LNG1) , LT(1,KC_LNG1) , XXXXXXX       , XXXXXXX    , XXXXXXX   , KC_RALT , KC_HOME
  ),
  // 数字と記号
  [1] = LAYOUT_universal(
    _______ , _______    , _______    , _______    , _______           , _______         ,                                  _______       , _______       , _______    , _______   , _______ , _______,
    _______ , KC_9       , KC_8       , KC_7       , KC_6              , KC_5            ,                                  KC_LBRC       , KC_RBRC       , S(KC_9)    , S(KC_0)   , S(KC_2) , _______,
    _______ , KC_4       , KC_3       , KC_2       , KC_1              , KC_0            ,                                  S(KC_3)       , KC_GRV        , S(KC_8)    , S(KC_DOT) , KC_MINS , _______,
    _______ , S(KC_4)    , S(KC_6)    , S(KC_7)    , S(KC_EQL)         , S(KC_5)         , _______      , _______         , KC_QUOT       , KC_SCLN       , KC_BSLS    , KC_EQL    , S(KC_1) , _______,
    _______ , _______    , _______    , _______    , _______           , _______         , _______      , _______         , _______       , XXXXXXX       , XXXXXXX    , XXXXXXX   , _______ , _______
  ),
  // ファンクション・カーソル・マウス（オートマウスレイヤー）
  [2] = LAYOUT_universal(
    _______ , KC_F1      , KC_F2      , KC_F3      , KC_F4             , KC_F5           ,                                  KC_F6         , KC_F7         , KC_F8      , KC_F9     , KC_F10  , _______,
    _______ , S(KC_LEFT) , A(KC_LEFT) , KC_UP      , A(KC_RGHT)        , S(KC_RGHT)      ,                                  _______       , KC_BTN4       , _______    , KC_BTN5   , _______ , _______,
    _______ , G(KC_LEFT) , KC_LEFT    , KC_DOWN    , KC_RGHT           , G(KC_RGHT)      ,                                  KC_BSPC       , KC_BTN1       , SCRL_MO    , KC_BTN2   , _______ , _______,
    _______ , _______    , _______    , _______    , _______           , _______         , _______      , TG(2)           , _______       , _______       , _______    , _______   , _______ , _______,
    _______ , _______    , _______    , _______    , _______           , _______         , _______      , _______         , _______       , XXXXXXX       , XXXXXXX    , XXXXXXX   , _______ , _______
  ),
  // Keyball の設定（このレイヤーを押している間はスクロールモードになる）
  [3] = LAYOUT_universal(
    _______ , _______    , _______    , _______    , _______           , _______         ,                                  _______       , _______       , _______    , _______   , _______ , _______,
    _______ , SSNP_FRE   , SSNP_HOR   , SSNP_VRT   , AML_D50           , AML_I50         ,                                  _______       , _______       , _______    , _______   , _______ , _______,
    _______ , AML_TO     , SCRL_DVD   , SCRL_DVI   , SCRL_MO           , SCRL_TO         ,                                  _______       , _______       , _______    , _______   , _______ , _______,
    _______ , CPI_D1K    , CPI_I1K    , CPI_D100   , CPI_I100          , KBC_SAVE        , KBC_RST      , EE_CLR          , _______       , _______       , _______    , _______   , _______ , _______,
    _______ , _______    , _______    , _______    , _______           , _______         , _______      , _______         , _______       , XXXXXXX       , XXXXXXX    , XXXXXXX   , _______ , _______
  ),
};
// clang-format on

// 起動(ケーブルの抜き差し)のたびにオートマウスレイヤーを有効にする
// Kb 10でオートマウスレイヤーをOFFにしてもケーブルを抜き差しするともとに戻る
void keyboard_post_init_user(void) {
#ifdef POINTING_DEVICE_AUTO_MOUSE_ENABLE
    set_auto_mouse_enable(true);
    // keyball.c の keyboard_post_init_kb() は EEPROM に保存された値でタイムアウトを上書きする。
    // その保存領域は 5bit(最大 1600ms 相当)しかなく AUTO_MOUSE_TIME の 10000 を保てないので、
    // 後から呼ばれるこの関数で毎回 config.h の値に戻す
    set_auto_mouse_timeout(AUTO_MOUSE_TIME);
#endif
}

// Shift の有無で送る文字を入れ替える共通処理
static bool swap_shift(uint8_t plain, uint16_t shifted, keyrecord_t *record) {
    if (record->event.pressed) {
        uint8_t mods = get_mods();
        if (mods & MOD_MASK_SHIFT) {
            // Shift を一時的に外して、素のキーコードを送る
            del_mods(MOD_MASK_SHIFT);
            send_keyboard_report();
            tap_code(plain);
            set_mods(mods);
            send_keyboard_report();
        } else {
            // Shift なしのときに、Shift 付きの文字を送る
            tap_code16(shifted);
        }
    }
    return false;   // 既定の処理はさせない
}

bool process_record_user(uint16_t keycode, keyrecord_t *record) {
    switch (keycode) {
        case KC_SCLN:                                  // 単押し ':' / Shift ';'
            return swap_shift(KC_SCLN, KC_COLN, record);
        case KC_BSLS:                                  // 単押し '|' / Shift '\'
            return swap_shift(KC_BSLS, KC_PIPE, record);
    }
    return true;
}

layer_state_t layer_state_set_user(layer_state_t state) {
    // Auto enable scroll mode when the highest layer is 3
    keyball_set_scroll_mode(get_highest_layer(state) == 3);
    return state;
}

#ifdef POINTING_DEVICE_AUTO_MOUSE_ENABLE
#    include <stdlib.h>

// AML_ENTER_THRESHOLD と AML_ENTER_RESET_MS は config.h で定義している

static int16_t  aml_travel    = 0;
static uint16_t aml_last_move = 0;

// レイヤーに入っていない間だけ移動量を足し込み、合計がしきい値に達したときに入る
bool auto_mouse_activation(report_mouse_t mouse_report) {
    // ボタンを押している間は必ずレイヤーを維持する
    if (mouse_report.buttons) {
        aml_travel = 0;
        return true;
    }

    int16_t delta = abs(mouse_report.x) + abs(mouse_report.y) + abs(mouse_report.h) + abs(mouse_report.v);

    // すでにレイヤーに入っているときは QMK の既定と同じ判定にする。
    // ここでもしきい値を課すと、ゆっくり動かしている最中にレイヤーが抜ける。
    if (layer_state_is(get_auto_mouse_layer())) {
        aml_travel = 0;
        return delta > 0;
    }

    if (delta == 0) {
        if (timer_elapsed(aml_last_move) > AML_ENTER_RESET_MS) {
            aml_travel = 0;
        }
        return false;
    }

    aml_last_move = timer_read();
    aml_travel += delta;
    if (aml_travel >= AML_ENTER_THRESHOLD) {
        aml_travel = 0;
        return true;
    }
    return false;
}
#endif

#ifdef OLED_ENABLE

#    include "lib/oledkit/oledkit.h"

void oledkit_render_info_user(void) {
    keyball_oled_render_keyinfo();
    keyball_oled_render_ballinfo();
    keyball_oled_render_layerinfo();
}
#endif 
