# Karabiner

JSON にはコメントが書けない & description も短く保ちたいので、ルールの詳細はこのファイルに記録する。ルールを追加・変更するときはこのファイルを編集する。

## 1. 追加・変更するとき

### 1-1. フォルダ構成

- `karabiner.json`
	- 実際に karabiner が読み込む設定ファイル
- `assets/complex_modifications/`
	- ルールのソースファイルを保存する場所
	- `karabiner.json` にコピーされて初めて有効になる
- `scripts/`
	- ルールから呼ぶスクリプト
- `automatic_backups/`
	- Karabiner が自動で作るバックアップ
	- git の管理対象外

### 1-2. ルール名の付け方

- assets/ におくソースファイルは次の 3 つを統一する
	- ファイル名（`.json` を除く）
	- `title`
	- `description`
- ルール名はなるべく短くシンプルにする
- 特定の場面で有効なルールは、名前の頭に範囲を付ける
	- 例 ：`builtin-` （内蔵キーボードだけ）

### 1-3. ルールを追加・変更する手順

1. `assets/complex_modifications/<ルール名>.json` を作成・更新する
2. `karabiner.json` にも同じ内容を入れる
	- assets と `karabiner.json` は必ず内容を揃える
3. この README の「2. ルール一覧」と「3. 各ルールの使い方」を追記・更新する


## 2. ルール一覧

| ルール名 | 概要 |
| - | - |
| `magic-keyboard-disabled` | Magic Keyboard with Touch ID のキーを Touch ID 以外すべて無効化 |
| `space-layer` | Space 長押しで矢印・削除レイヤー。タップで Space ＋ 英数 |
| `builtin-fn-to-option` | fn（地球儀）キー → 右 Option |
| `builtin-ctrl-tap-to-esc` | 左 Ctrl タップ → Esc |
| `builtin-tab-hold-to-option` | Tab ホールド → 左 Option |
| `chrome-split-view` | Chrome で `Cmd+D` → 分割ビュー |
| `chrome-img-width` | Chrome で `Cmd+Ctrl+I` → `<img>` の width を 800 に |
| `builtin-jis-symbols` | 内蔵 JIS キーボードの記号を印字どおりに入力 |
| `builtin-swap-semicolon-hyphen` | `;` と `-` を入れ替え |
| `slack-disable-esc` | Slack で Esc と左 Ctrl タップの Esc を無効にする |
| `shift-backspace-to-delete` | `Shift+Backspace` → Delete forward |
| `ctrl-emacs` | Ctrl + H/D/F/B/N/P/A/E/U → Emacs 風の移動・削除 |

## 3. 各ルールの使い方

前提として、外付けキーボードとの互換性を保つために、**仮想キーボードは ANSI（US 配列）にしている。** 

そのままだと内蔵の JIS キーボードの記号がずれるので、 `builtin-jis-symbols` で直している。

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

注意: Space を押してから 0.15 秒以内にほかのキーを押すと、文章を速く打っているとみなして、Space とそのキーを順番に入力する（qmk ファームウェアのデフォルト）

日本語の入力途中かどうかは、変数 `ime_composing` で判断している。日本語入力でアルファベットを打つと `ime_composing` を 1 にし、Enter・英数・かなキーで 0 に戻す。Space を単独で押したときは、この変数が 0 のときだけ英数に切り替える。

### 3-2. `builtin-fn-to-option`

fn（地球儀）キーを右 Option にする。内蔵キーボードのみ適用。

### 3-3. `builtin-ctrl-tap-to-esc`

左 Ctrl をタップで Esc にする。200 ms 以上長押しすると Ctrl になる。

hold-preferredで、200 ms 以内でも他のキーと組み合わさったときは Ctrl にする。

内蔵キーボードのみ適用。

### 3-4. `builtin-tab-hold-to-option`

Tab をホールドで Option にする。200 ms 以上長押しすると Option になる。

hold-preferredで、200 ms 以内でも他のキーと組み合わさったときは Option にする。

内蔵キーボードのみ適用。

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

内蔵 JIS キーボードのキーに書かれている記号がそのまま入力されるようにする。仮想キーボードを ANSI にしたことでずれた記号を、JIS の印字どおりに直す。

### 3-8. `builtin-swap-semicolon-hyphen`

`;` と `-` だけを入れ替える。Shift を押したときの `=` と `+` は印字どおりのまま。 `builtin-jis-symbols` には依存していないが、一緒に使う場合は `builtin-jis-symbols` より上に置かないと無視される。

| 押すキー（印字） | 入力される記号 |
| - | - |
| `-` | `;` |
| `;` | `-` |
| `Shift` + `-` | `=` |
| `Shift` + `;` | `+` |

Cmd や Ctrl を一緒に押しても同じ記号に変わる。たとえば Ghostty で文字の大きさを変えるときは次のキーを押す。

- `Cmd+;`（印字）で縮小（`Cmd+-` が送られる）
- `Cmd+Shift+;`（印字）で拡大（`Cmd++` が送られる）

### 3-9. `slack-disable-esc`

Slack が前面にあるときは、Esc キーを押しても何も起きないようにする。Esc でスレッドが閉じないようにするため。

Shift や Cmd と一緒に押したとき（たとえば `Shift+Esc` で全チャンネルを既読にする操作）は、そのまま使える。

`builtin-ctrl-tap-to-esc` で左 Ctrl をタップしたときの Esc も出さない。Slack では左 Ctrl はただの Ctrl になる。このため、`karabiner.json` では `builtin-ctrl-tap-to-esc` より上に置く。

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

通常のキー（`key_code`）と、音量や明るさなどのメディアキー（`consumer_key_code`）を何も入力しないキー（`vk_none`）に変える。ほかのルールより先に判定させるため、ルール一覧の一番上に置く。

注意: fn（地球儀）キーは `any` で指定できない種類のキーなので、無効にならない。
