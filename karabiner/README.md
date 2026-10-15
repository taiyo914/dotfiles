# Karabiner

`~/.config/karabiner` からこのフォルダにシンボリックリンクを張っている。

## 1. フォルダ構成

| パス | 中身 |
| - | - |
| `karabiner.json` | 実際に使われる設定。Karabiner の画面で変更するとここが書き換わる |
| `assets/complex_modifications/` | ルールの置き場。Karabiner の「Add predefined rule」に一覧で出る |
| `scripts/` | ルールの `shell_command` から呼ぶスクリプト |
| `automatic_backups/` | Karabiner が自動で作るバックアップ |

assets に置いただけでは有効にならない。Karabiner の画面でルールを追加すると、その内容が `karabiner.json` にコピーされて初めて有効になる。

assets の中には JSON 以外のファイルを置かない。Karabiner がルールとして読み込もうとするため。

## 2. 有効なルール

上から順に評価される。同じキーに複数のルールが当たる場合は、上のルールが優先される。

| ルール | 動作 | assets | スクリプト |
| - | - | - | - |
| Space 長押しで矢印レイヤー | 下の「2-1」を参照 | `space_arrow_layer.json` | |
| Sticky Shift | Shift を単独で押して離すと、次の 1 キーだけ Shift 付きになる | `sticky_shift.json` | |
| fn → Option | 内蔵キーボードの fn（地球儀）キーを右 Option にする | `builtin_fn_to_option.json` | |
| Chrome 分割ビュー | Chrome で `Cmd+D` は新しいタブ付きの分割ビュー、`Cmd+Shift+D` は通常の分割ビューを開く | `chrome_cmd_d_to_split_view.json` | `chrome-split-newtab.sh` |
| `<img>` の width を 800 に | Chrome で `<img>` タグを選択して `Cmd+Ctrl+I` を押すと、width を 800 にして height を消す | `chrome_gh_img_width.json` | `gh-img-width.sh` |
| `;` と `-` を入れ替え | 内蔵キーボードの `;` と `-` を入れ替える | `swap_builtin_semicolon_hyphen_jis.json` | |
| JIS の印字どおりに入力 | 内蔵キーボード（JIS）で、キーに書かれている記号がそのまま入力されるようにする | `jis_symbols_on_builtin.json` | |
| Ctrl で Emacs 風の移動と削除 | 下の「2-2」を参照 | `ctrl_emacs_keys.json` | |

仮想キーボードの種類は ANSI（US 配列）にしている。そのままだと内蔵の JIS キーボードの記号がずれるので、最後の 2 つのルールで直している。

### 2-1. Space の矢印レイヤー

Space を押しながら左手のキーを押すと、カーソル移動になる。Space を単独で押したときは普通の Space になる。

| キー | 動作 |
| - | - |
| `E` / `S` / `D` / `F` | ↑ / ← / ↓ / → |
| `A` / `G` | 行頭 / 行末（`Cmd+←` / `Cmd+→`） |
| `W` / `R` | 1 単語左 / 右（`Option+←` / `Option+→`） |
| `Q` | カーソルの左の 1 単語を削除（`Option+Delete`） |
| `T` | カーソルの右の 1 文字を削除（`Delete forward`） |

### 2-2. Ctrl で Emacs 風の移動と削除

左 Ctrl を押しながら次のキーを押すと、矢印キーや削除キーに変わる。Ghostty と iTerm2 では、シェルや vim の Ctrl キーを使うため無効にしている。

| キー | 動作 | Shift も押したとき |
| - | - | - |
| `H` | Backspace | |
| `D` | Delete（カーソルの右の 1 文字を消す） | |
| `F` / `B` | → / ← | 1 文字ずつ選択 |
| `N` / `P` | ↓ / ↑ | 1 行ずつ選択 |
| `A` / `E` | 行頭 / 行末（`Cmd+←` / `Cmd+→`） | 行頭 / 行末まで選択 |
| `K` | 行末までを消す（`Shift+Cmd+→` で選択して Backspace） | |
| `U` | 行頭までを消す（`Cmd+Backspace`） | |

`Ctrl+K` は、カーソルがすでに行末にあると何も選択されないので、カーソルの左の 1 文字が消えてしまう。

### 2-3. `<img>` の width を 800 にする仕組み

1. Karabiner が `Cmd+C` を押して、選択中のテキストをコピーする
2. 0.1 秒待ってから `gh-img-width.sh` がクリップボードの中身を書き換える
3. キーを押してから 0.3 秒後に、Karabiner が `Cmd+V` を押して貼り付ける

0.3 秒の間に別のキーを押すと、貼り付けは中止される。その場合もクリップボードには書き換えた後のテキストが入っている。

## 3. 使っていない assets

`karabiner.json` で有効になっていないルール。不要なら消してよい。

| ファイル | 内容 |
| - | - |
| `builtin_left_ctrl_to_nav_layer_key.json` | 内蔵キーボードの左 Ctrl を矢印レイヤーに、Caps Lock を左 Ctrl にする |
| `nav_layer.json` | 矢印レイヤー（カーソル移動と削除） |
| `ctrl_arrow_layer.json` | Ctrl を押しながら左手で矢印キー |
| `space_layer_h_to_backspace_on_builtin.json` | 内蔵キーボードで Space レイヤーの `H` を Backspace にする |
| `disable_ctrl_h.json` | `Ctrl+H` を無効にする |
| `disable_arrows_and_delete.json` | 矢印キーと Delete を無効にする（Fn を押している間は有効） |
| `eisuu_kana_to_cmd.json` | 英数・かなキーを長押しすると Cmd になる |
| `swap_builtin_semicolon_hyphen.json` | 内蔵キーボードの `;` と `-` を入れ替える（JIS 版より前のもの） |
| `us_layout_on_builtin_jis.json` | 内蔵の JIS キーボードを US 配列のキー位置で入力する |
| `mac-remap-20260926.json` | 2026-09-26 時点のまとめ設定 |

## 4. ルールを追加するとき

1. `assets/complex_modifications/` に JSON を作る
2. スクリプトを使うなら `scripts/` に置き、`shell_command` から `$HOME/dotfiles/karabiner/scripts/...` で呼ぶ
3. Karabiner の画面で「Add predefined rule」からルールを有効にする
4. この README の「2. 有効なルール」に追記する

`shell_command` から動かすスクリプトでは `.zshrc` が読み込まれない。コマンドはフルパスで書き、日本語を扱うなら `LANG` を指定する。
