# Karabiner

ルールは [karabiner.ts](https://karabiner.ts.evanliu.dev/) を使って TypeScript で書き、`npm run build` で `karabiner.json` を作る。ルールの使い方はこのファイルに記録する。ルールを追加・変更するときはこのファイルも編集する。

## 1. 追加・変更するとき

### 1-1. フォルダ構成

- `src/rules/`
	- ルールのソースファイル。1 つのファイルに 1 つの機能を書く
- `src/stages.ts`
	- どのルールの出力をどのルールに渡すかを決める場所（「1-3. ルールのつなぎ方」）
- `src/pipe.ts`
	- ルールをつなぐ仕組み
- `src/conditions.ts`
	- 複数のルールで使う条件（キーボードの種類、アプリ）
- `karabiner.json`
	- 実際に karabiner が読み込む設定ファイル
	- Complex Modifications のルールは `npm run build` で作り直すので、直接編集しない。デバイスの設定など、ほかの部分は Karabiner の画面で変えてよい
- `scripts/`
	- ルールから呼ぶスクリプト
- `automatic_backups/`
	- Karabiner が自動で作るバックアップ
	- git の管理対象外

### 1-2. ルール名の付け方

- ファイル名（`.ts` を除く）と `rule()` に渡す名前（Karabiner の画面に出る名前）を揃える
- ルール名はなるべく短くシンプルにする
- 特定の場面で有効なルールは、名前の頭に範囲を付ける
	- 例 ：`builtin-` （内蔵キーボードと Magic Keyboard with Touch ID だけ）

### 1-3. ルールのつなぎ方

Karabiner-Elements は、あるルールが出したキーをほかのルールに通さない。そのため、`src/pipe.ts` の `pipe()` が、前の段のルールが出したキーを次の段のルールに通した結果を `npm run build` のときに計算して、1 つのルールにまとめる。

各ルールは、ほかのルールのことを書かずに「このキーが来たらこのキーを出す」だけを書く。どのルールの出力をどのルールに渡すかは、`src/stages.ts` に並べる順番だけで決める。

- 上の段のルールが出したキーは、下の段のルールに渡る
- 同じ段に並べたルールは、上にあるものが先に判定され、お互いの出力は受け取らない
- 1 段目は物理キーを受け取る
- タップと長押しで動きを変えるルール（`to_if_alone` などを使うルール）は 1 段目にしか置けない。Karabiner には、ほかのルールが出したキーを押した時間や離したタイミングを調べる方法がないため
- 2 段目以降のルールは Karabiner の画面で ON / OFF を切り替えられない。前の段のルールに組み込まれるため

`pipe()` は、押されていた修飾キーを出し直すときに左右を区別できない。たとえば右 Cmd を押していても、組み合わせたルールからは左 Cmd として出る。

`npm test` で、`pipe()` が作ったルールの動きが、段ごとに順番にルールを通したときの動きと同じになるかを確かめられる。

### 1-4. ルールを追加・変更する手順

1. はじめて使うときは `npm install` を実行する
2. `src/rules/<ルール名>.ts` を作成・更新する
3. 新しいルールなら `src/stages.ts` に追加する
4. `npm test` を実行して、テストが通るか確かめる
5. `npm run build` を実行して、`karabiner.json` に書き込む
	- `npm run dry-run` なら、書き込まずに結果を表示する
	- `npm run build` を実行するたびに、Karabiner の画面で切り替えたルールの ON / OFF は `src/` に書いてある状態に戻る
6. この README の「2. ルール一覧」と「3. 各ルールの使い方」を追記・更新する


## 2. ルール一覧

| ルール名 | 概要 |
| - | - |
| `keyboard-cleaner` | 掃除用に全キーを無効化。Karabiner の画面で都度 ON / OFF する |
| `magic-keyboard-disabled` | Magic Keyboard with Touch ID のキーを Touch ID 以外すべて無効化 |
| `space-layer` | Space 長押しで矢印・削除レイヤー。タップで Space ＋ 英数 |
| `builtin-fn-to-option` | fn（地球儀）キー → 右 Option |
| `builtin-ctrl-tap-to-esc` | 左 Ctrl タップ → Esc |
| `builtin-tab-hold-to-option` | Tab ホールド → 左 Option |
| `chrome-split-view` | Chrome で `Cmd+D` → 分割ビュー |
| `chrome-img-width` | Chrome で `Cmd+Ctrl+I` → `<img>` の width を 800 に |
| `chrome-arrow-tab-switch` | Chrome で `Cmd+↓` / `Cmd+↑` → 次 / 前のタブ |
| `chrome-zoom-in` | Chrome で `Cmd+Shift+;` / `Cmd+Shift+-` → 拡大 |
| `builtin-jis-symbols` | 内蔵 JIS キーボードの記号を印字どおりに入力 |
| `builtin-swap-semicolon-hyphen` | 内蔵キーボードで `;` と `-` を入れ替え |
| `magic-keyboard-us-layout` | JIS の Magic Keyboard を US 配列として使う |
| `slack-disable-esc` | Slack で Esc を無効にする |
| `shift-backspace-to-delete` | `Shift+Backspace` → Delete forward |
| `ctrl-emacs` | Ctrl + H/D/F/B/N/P/A/E/U → Emacs 風の移動・削除 |
| `ime-composing` | 日本語の入力途中かどうかを変数 `ime_composing` に記録する |

## 3. 各ルールの使い方

前提として、外付けキーボードとの互換性を保つために、**仮想キーボードは ANSI（US 配列）にしている。** 

そのままだと内蔵の JIS キーボードの記号がずれるので、 `builtin-jis-symbols` で直している。JIS の Magic Keyboard は、試しに印字を直さず US 配列として使っている（`magic-keyboard-us-layout`）。

`builtin-` で始まるルールは、内蔵キーボードと Magic Keyboard with Touch ID（Vendor ID 1452 / Product ID 666）に適用する。ただし、`builtin-jis-symbols` と `builtin-swap-semicolon-hyphen` は内蔵キーボードだけに適用する。

`magic-keyboard-disabled` を ON にしたときは、Magic Keyboard のキーが先に無効になるので、Magic Keyboard ではほかのルールは動かない。

### 3-1. `space-layer`

Space を押しながら左手のキーを押すと、カーソル移動や削除になる。

| 操作                            | 結果                                               |
| ----------------------------- | ------------------------------------------------ |
| Space を単独でタップ                 | Space を入力し、英数に切り替える。日本語の入力途中（変換が確定する前）は英数に切り替えない |
| Space を素早く 2 回押して、2 回目を長押し    | Space が連続で入力される                                  |
| Space + `E` / `S` / `D` / `F` | ↑ / ← / ↓ / →                                    |
| Space + `A` / `G`             | 行頭 / 行末（`Cmd+←` / `Cmd+→`）                       |
| Space + `W` / `R`             | 1 単語左 / 右（`Option+←` / `Option+→`）               |
| Space + `Q`                   | カーソルの左の 1 単語を削除（`Option+Delete`）                 |
| Space + `T`                   | カーソルの右の 1 文字を削除（`Delete forward`）                |

注意: Space を押してから 0.1 秒以内にほかのキーを押すと、文章を速く打っているとみなして、Space とそのキーを順番に入力する（qmk ファームウェアのデフォルト）

日本語の入力途中かどうかは、`ime-composing` が記録する変数 `ime_composing` で判断している。Space を単独で押したときは、この変数が 0 のときだけ英数に切り替える。

Space を押している間に、レイヤーのキー以外のキーを押したときは、そのキーをそのまま出す。そのキーは下の段のルールにも渡るので、たとえば Space を押しながら内蔵キーボードの記号のキーを押しても、`builtin-jis-symbols` で印字どおりの記号になる。

### 3-2. `builtin-fn-to-option`

fn（地球儀）キーを右 Option にする。内蔵キーボードと Magic Keyboard のみ適用。

### 3-3. `builtin-ctrl-tap-to-esc`

左 Ctrl をタップで Esc にする。200 ms 以上長押しすると Ctrl になる。

hold-preferredで、200 ms 以内でも他のキーと組み合わさったときは Ctrl にする。

内蔵キーボードと Magic Keyboard のみ適用。

### 3-4. `builtin-tab-hold-to-option`

Tab をホールドで Option にする。200 ms 以上長押しすると Option になる。

hold-preferredで、200 ms 以内でも他のキーと組み合わさったときは Option にする。

内蔵キーボードと Magic Keyboard のみ適用。

注意: Tab を押し続けても Tab は連続で入力されない。

### 3-5. `chrome-split-view`

Chrome の分割ビューを `Cmd+D` で開く。Chrome でのみ適用。

| 操作            | 結果                       |
| ------------- | ------------------------ |
| `Cmd+D`       | 分割ビューを開き、右側を新しいタブにする     |
| `Cmd+Shift+D` | 分割ビューを開き、右側は「タブを選択」画面にする |

注意: Chrome 本来の `Cmd+D`（ブックマークに追加）は使えなくなる。

### 3-6. `chrome-img-width`

`<img>` タグを含む文章を選択して `Cmd+Ctrl+I` を押すと、選択した文章の中の `<img>` タグの width を 800 にし、height を消す。GitHub に貼った画像の大きさをそろえるために使う。Chrome でのみ適用。

### 3-7. `builtin-jis-symbols`

内蔵 JIS キーボードのキーに書かれている記号がそのまま入力されるようにする。仮想キーボードを ANSI にしたことでずれた記号を、JIS の印字どおりに直す。内蔵キーボードのみ適用。

### 3-8. `builtin-swap-semicolon-hyphen`

`-` と `;` だけを入れ替える。Shift を押したときは入れ替えず、`builtin-jis-symbols` が出す印字どおりの記号（`=` と `+`）のままにする。`src/stages.ts` では `builtin-jis-symbols` の下の段に置く。

| 押すキー（印字） | 入力される記号 |
| - | - |
| `-` | `;` |
| `;` | `-` |
| `Shift` + `-` | `=` |
| `Shift` + `;` | `+` |

Cmd や Ctrl を一緒に押しても入れ替える。たとえば Ghostty では `Cmd+;`（印字）で文字を縮小できる（`Cmd+-` が送られる）。

注意: `Cmd+Shift+;`（印字）や `Cmd+Shift+-`（印字）は、このルールも `builtin-jis-symbols` も何もしないので、押したキーのまま送られる。Ghostty の `cmd+shift+minus`（文字を拡大）が動くのは `Cmd+Shift+-`（印字）のほう。

### 3-9. `slack-disable-esc`

Slack が前面にあるときは、Esc キーを押しても何も起きないようにする。Esc でスレッドが閉じないようにするため。

Shift や Cmd と一緒に押したとき（たとえば `Shift+Esc` で全チャンネルを既読にする操作）は、そのまま使える。

`builtin-ctrl-tap-to-esc` で左 Ctrl をタップしたときの Esc も、このルールに渡るので出なくなる。

### 3-10. `shift-backspace-to-delete`

`Shift+Backspace` で、カーソルの右の 1 文字を消す（Delete forward）。

### 3-11. `ctrl-emacs`

左 Ctrl を押しながらキーを押すと、矢印キーや削除キーになる。

| 操作                  | 結果                                     | Shift も押したとき |
| ------------------- | -------------------------------------- | ------------ |
| `Ctrl+H`            | Backspace                              |              |
| `Ctrl+D`            | Delete（カーソルの右の 1 文字を消す）                |              |
| `Ctrl+F` / `Ctrl+B` | → / ←                                  | 1 文字ずつ選択     |
| `Ctrl+N` / `Ctrl+P` | ↓ / ↑                                  | 1 行ずつ選択      |
| `Ctrl+A` / `Ctrl+E` | 行頭 / 行末（`Cmd+←` / `Cmd+→`）             | 行頭 / 行末まで選択  |
| `Ctrl+U`            | 行頭までを消す（`Cmd+Backspace`）               |              |

注意： vim では cmd をうまく認識してくれないため、 ctrl A/E/U はうまくうごかない

### 3-12. `magic-keyboard-disabled`

Magic Keyboard with Touch ID（Vendor ID 1452 / Product ID 666）のキーをすべて無効にする。Touch ID の指紋認証は使える。

通常のキー（`key_code`）と、音量や明るさなどのメディアキー（`consumer_key_code`）を何も入力しないキー（`vk_none`）に変える。ほかのルールより先に判定させるため、`src/stages.ts` の 1 段目の一番上に置く。

普段は OFF。`npm run build` を実行すると OFF に戻る。

注意: fn（地球儀）キーは `any` で指定できない種類のキーなので、無効にならない。

### 3-13. `chrome-arrow-tab-switch`

Chrome で `Cmd+↓` を押すと次のタブ（`Ctrl+Tab`）、`Cmd+↑` を押すと前のタブ（`Ctrl+Shift+Tab`）に移る。herdr でスペースを移るキー（`Cmd+↓` / `Cmd+↑`）とそろえるため。Chrome でのみ適用。

Space レイヤーの `Cmd+Space+D` / `Cmd+Space+E` でも同じようにタブを移る。`space-layer` が出した `Cmd+↓` / `Cmd+↑` がこのルールに渡るため。

注意: Chrome 本来の `Cmd+↓` / `Cmd+↑`（ページの一番下 / 一番上まで移る）は使えなくなる。

### 3-14. `keyboard-cleaner`

キーボードを掃除するときに、すべてのキーボードのキーをすべて無効にする。

普段は OFF にしておく。掃除するときだけ、Karabiner-Elements の設定画面の Complex Modifications でこのルールを ON にし、終わったら OFF に戻す。キーボードが使えない間も、トラックパッドとマウスで OFF に戻せる。

ほかのルールより先に判定させるため、`src/stages.ts` の 1 段目の一番上に置く。`npm run build` を実行すると OFF に戻る。

このルールだけは、Karabiner の画面に出る名前を `keyboard-cleaner (💡Turn on only while cleaning)` にしている。掃除のときだけ ON にするルールだとわかるようにするため。ファイル名は `keyboard-cleaner` のまま。

注意: fn（地球儀）キーは `any` で指定できない種類のキーなので、無効にならない。トラックパッドとマウスは無効にならない。

### 3-15. `ime-composing`

日本語の入力途中（変換が確定する前）かどうかを、変数 `ime_composing` に記録する。`space-layer` がこの変数を使う。

- 日本語入力でアルファベットを打つと 1 にする
- Enter・英数・かなキーを押すと 0 にする

ほかのルールが出したアルファベットや英数キーも見て記録するため、`src/stages.ts` の一番下の段に置く。

### 3-16. `chrome-zoom-in`

Chrome で `Cmd+Shift+;` か `Cmd+Shift+-` を押すと、ページを拡大する（Chrome の拡大のキー `Cmd+=` を送る）。Chrome でのみ適用。Ghostty の `cmd+shift+semicolon` / `cmd+shift+minus` の設定と同じ使い方になる。

| キーボード | 縮小 | 拡大 |
| - | - | - |
| 内蔵キーボード | `Cmd+;`（印字。`builtin-swap-semicolon-hyphen` で `Cmd+-` になる） | `Cmd+Shift+;`（印字） |
| 外付けキーボード | `Cmd+-` | `Cmd+Shift+-` |

注意: Chrome で `Cmd+Shift+-` を押したときの本来の動きは使えなくなる。

### 3-17. `magic-keyboard-us-layout`

JIS の Magic Keyboard with Touch ID（外付け。Vendor ID 1452 / Product ID 666）を、印字を直さずに US 配列として使う。試しに使っている設定。

US 配列のキーの位置のままにして、次の 2 つだけを変える。修飾キーと一緒に押しても同じように変わる。

| 押すキー（JIS の印字） | US 配列のどのキーとして扱うか |
| - | - |
| `¥` | `` ` `` / `~`（JIS には US 配列の `` ` `` / `~` のキーがないため） |
| `-` | `;` / `:`（`;` のキーと入れ替え） |
| `;` | `-` / `_`（`-` のキーと入れ替え） |

ほかのキーは US 配列の同じ位置のキーとして扱う。たとえば `^` のキーは `=` / `+`、`@` のキーは `[` / `{`、`:` のキーは `'` / `"`、`]` のキーは `\` / `|` になる。`_` のキーには何も割り当てていない。
