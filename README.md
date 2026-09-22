# dotfiles

マシン共通の設定ファイルの実体をここに置き、各所からシンボリックリンクで参照する。

public リポジトリなので、 **機密情報や業務に関わる情報は絶対に入れない**。 

マシン依存を避けるため、ホームディレクトリのパスは直接書かず、`$HOME` や `$DOTFILES` を使う。

## 1. 設定ファイル一覧

| 項目         | ファイル                        | リンク先                                                    |
| ----------- | ------------------------------ | ---------------------------------------------------------- |
| zsh         | `zsh/.zshrc`                   | `~/.zshrc`                                                 |
|             | `zsh/.zprofile`                | `~/.zprofile`                                              |
| Claude Code | `claude/settings.json`         | `~/.claude/settings.json`                                  |
|             | `claude/CLAUDE.md`             | `~/.claude/CLAUDE.md`                                      |
|             | `claude/scripts/`              | `~/.claude/scripts`                                        |
|             | `claude/hooks/`                | `~/.claude/hooks`                                          |
|             | `claude/keybindings.json`      | `~/.claude/keybindings.json`                               |
|             | `claude/skills/`               | `~/.claude/skills`                                         |
|             | `claude/commands/`             | `~/.claude/commands`                                       |
| VS Code     | `vscode/settings.json`         | `~/Library/Application Support/Code/User/settings.json`    |
|             | `vscode/keybindings.json`      | `~/Library/Application Support/Code/User/keybindings.json` |
|             | `vscode/tasks.json`            | `~/Library/Application Support/Code/User/tasks.json`       |
| Git         | `git/`                         | `~/.config/git`                                            |
| Ghossty     | `ghostty/config`               | `~/.config/ghostty/config`                                 |
| Starship    | `starship/starship.toml`       | `~/.config/starship.toml`                                  |
| HammerSpoon | `hammerspoon/`                 | `~/.hammerspoon`                                           |
| Neovim      | `nvim/`                        | `~/.config/nvim`                                           |
| herdr       | `herdr/config.toml`            | `~/.config/herdr/config.toml`                              |
| Karabiner   | `karabiner/`                   | `~/.config/karabiner`                                      |
| macOS       | `macos/DefaultKeyBinding.dict` | `~/Library/KeyBindings/DefaultKeyBinding.dict`             |
| Keyball     | `keyball/my-keymap/`           | `{keyballへのパス}/qmk_firmware/keyboards/keyball/keyball61/keymaps/my-keymap` |
| Obsidian    | `obsidian/plugins/*/`          | `~/vault/.obsidian/plugins/*/`                             |
|             | `obsidian/snippets/`           | `~/vault/.obsidian/snippets`                               |
|             | `obsidian/hotkeys.json`        | `~/vault/.obsidian/hotkeys.json`                           |

## 2. dotfiles-local 

公開できない、またはそのマシンでしか使わない設定は `~/dotfiles-local` に置く。

次の2つは `~/dotfiles-local` を読み込む。

- zsh
    - `zsh/.zshrc` の一番下で `~/dotfiles-local/zsh/local.zsh` を読み込んでいる。
- git
    - `git/config` の一番下で `~/dotfiles-local/git/local.config` を include している。


> **Claude Codeのグローバル設定について**
>
> Claude Code のグローバルの設定ファイル `~/.claude/settings.json` は、別の設定ファイルを読み込んだり継承したりする仕組みを持っていない。そこで、そのマシン特有の設定は各プロジェクトの `.claude/settings.local.json` に書くことにする。ただし、これだと claude を使うすべてのプロジェクトで同じ設定を書かなければいけないので、あくまで暫定的な対応。プロジェクトの数が増えてきてきたらまた考える。

## 3. セットアップ

新しいマシンで復元するときは、ホームディレクトリ直下に clone してからシンボリックリンクを貼る。

### 3-1. バックアップと既存ファイルの削除
   
同じ場所にファイルがあるとシンボリックリンクを貼れないので、既存のファイルは移動または削除する必要がある。

次のコマンドは、既存ファイル/フォルダの内容をコピーして、 `~/dotfiles-bak` へ退避させる。

なお、すでにシンボリックリンクの場合はその実体ファイルの中身をコピーする。

```bash
BAK=~/dotfiles-bak

targets=(
  .zshrc
  .zprofile
  .claude/settings.json
  .claude/CLAUDE.md
  .claude/scripts
  .claude/hooks
  .claude/keybindings.json
  .claude/skills
  .claude/commands
  "Library/Application Support/Code/User/settings.json"
  "Library/Application Support/Code/User/keybindings.json"
  "Library/Application Support/Code/User/tasks.json"
  .config/git
  .config/ghostty/config
  .config/starship.toml
  .hammerspoon
  .config/nvim
  .config/herdr/config.toml
  .config/karabiner
)

for t in "${targets[@]}"; do
  src="$HOME/$t"
  [ -e "$src" ] || [ -L "$src" ] || { echo "既存ファイルがないのでスキップ: $t"; continue; }
  mkdir -p "$BAK/$(dirname "$t")"
  rm -rf "$BAK/$t"
  if cp -RL "$src" "$BAK/$t" 2>/dev/null; then
    rm -rf "$src"
    echo "既存ファイルを移動しました: $t"
  else
    echo "コピーに失敗しました。既存ファイルを確認してください: $t"
  fi
done
```

<details>
<summary><b>補足：もとに戻す方法</b></summary>
    
---
    
もとの状態に戻したくなったら `targets` に戻したい設定ファイルを書いて次のコマンドを打つ。

```bash
BAK=~/dotfiles-bak

targets=(
  # 戻したい設定ファイル/フォルダ
  # .config/git
  # .zshrc
  # ...
)

for t in "${targets[@]}"; do
  [ -e "$BAK/$t" ] || continue
  rm -rf "$HOME/$t"
  mkdir -p "$(dirname "$HOME/$t")"
  cp -R "$BAK/$t" "$HOME/$t"
  echo "元の場所に戻しました: $t"
done
```
---
</details>


### 3-2. シンボリックリンクを貼る

```bash
ln -s ~/dotfiles/zsh/.zshrc ~/.zshrc
ln -s ~/dotfiles/zsh/.zprofile ~/.zprofile
ln -s ~/dotfiles/claude/settings.json ~/.claude/settings.json
ln -s ~/dotfiles/claude/CLAUDE.md ~/.claude/CLAUDE.md
ln -s ~/dotfiles/claude/scripts ~/.claude/scripts
ln -s ~/dotfiles/claude/hooks ~/.claude/hooks
ln -s ~/dotfiles/claude/keybindings.json ~/.claude/keybindings.json
ln -s ~/dotfiles/claude/skills ~/.claude/skills
ln -s ~/dotfiles/claude/commands ~/.claude/commands
ln -s ~/dotfiles/vscode/settings.json ~/Library/Application\ Support/Code/User/settings.json
ln -s ~/dotfiles/vscode/keybindings.json ~/Library/Application\ Support/Code/User/keybindings.json
ln -s ~/dotfiles/vscode/tasks.json ~/Library/Application\ Support/Code/User/tasks.json
ln -s ~/dotfiles/git ~/.config/git
ln -s ~/dotfiles/ghostty/config ~/.config/ghostty/config
ln -s ~/dotfiles/starship/starship.toml ~/.config/starship.toml
ln -s ~/dotfiles/hammerspoon ~/.hammerspoon
ln -s ~/dotfiles/nvim ~/.config/nvim
ln -s ~/dotfiles/herdr/config.toml ~/.config/herdr/config.toml
ln -s ~/dotfiles/karabiner ~/.config/karabiner
```

### 3-3. Obsidian

Obsidian の設定は各 vault の中の `.obsidian` にあるため、vault のパスを変数に入れてから貼る。

プラグインの中には特定のマシンでしか使わないものもあるため、`plugins` はフォルダ丸ごとではなく、各プラグインに対して個別にリンクを貼る。

```bash
# 設定を取り込みたい vault のパス
VAULT=~/path/to/your/vault

# 既存ファイルを退避する
# vault ごとに ~/dotfiles-bak/obsidian/{vault名}/ を作る
BAK=~/dotfiles-bak/obsidian/$(basename "$VAULT")
mkdir -p "$BAK"
for t in snippets hotkeys.json; do
  [ -e "$VAULT/.obsidian/$t" ] || continue
  cp -RL "$VAULT/.obsidian/$t" "$BAK/" && rm -rf "$VAULT/.obsidian/$t"
done

# snippets と hotkeys.json はすべてのマシン共通なので丸ごとリンクを貼る
ln -s ~/dotfiles/obsidian/snippets "$VAULT/.obsidian/snippets"
ln -s ~/dotfiles/obsidian/hotkeys.json "$VAULT/.obsidian/hotkeys.json"

# plugins は個別にリンクを貼る
# 同じ名前のものがすでにあれば退避する
mkdir -p "$VAULT/.obsidian/plugins"
for d in ~/dotfiles/obsidian/plugins/*/; do
  name=$(basename "${d%/}")
  target="$VAULT/.obsidian/plugins/$name"
  if [ -e "$target" ]; then
    mkdir -p "$BAK/plugins"
    rm -rf "$BAK/plugins/$name"
    cp -RL "$target" "$BAK/plugins/$name"
  fi
  rm -rf "$target"
  ln -s "${d%/}" "$target"
done
```

リンクを貼ったあと、Obsidian を再起動して `設定 → コミュニティプラグイン` と `設定 → 外観 → CSSスニペット` から各プラグインとCSSスニペットを有効にする。

### 3-4. UI から読み込ませるもの

次の2つはシンボリックリンクが不要で、アプリのUI上から直接読み込ませる。

- Chrome 拡張機能
    - `chrome://extensions` の「パッケージ化されていない拡張機能を読み込む」からフォルダを指定する。
- Raycast スクリプト
    - `Settings → Extensions → Script Commands → Script Directories` で、`~/dotfiles/raycast/scripts` を指定する。

### 3-5. Keyball

Keyball のキーマップは keyball リポジトリの中に置く必要があり、置き場所がマシンによって変わる。

https://github.com/Yowkees/keyball/tree/main/qmk_firmware/keyboards/keyball

```bash
# clone した keyball リポジトリのパス
KEYBALL=~/path/to/keyball/repo

ln -s ~/dotfiles/keyball/my-keymap \
  "$KEYBALL/qmk_firmware/keyboards/keyball/keyball61/keymaps/my-keymap"
```