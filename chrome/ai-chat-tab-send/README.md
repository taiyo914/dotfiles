# AI Chat Tab Send

claude.ai、Gemini（gemini.google.com）、ChatGPT（chatgpt.com）の入力欄で、キーの役割を次のように変える Chrome 拡張機能。

| キー | 変更後の動き |
| - | - |
| Enter | 改行する（Shift + Enter と同じ） |
| Tab | 送信する（Enter と同じ） |

- 日本語入力で変換中の Enter は、そのまま変換の確定に使われる。
- Shift / Cmd / Ctrl / Option と一緒に押したときは何も変えない。Shift + Enter はそのまま改行になる。
- 入力欄（複数行の入力欄）の外で押した Tab は、ふつうの Tab のまま。

## インストール

1. `chrome://extensions` を開く
2. 右上の「デベロッパーモード」を ON にする
3. 「パッケージ化されていない拡張機能を読み込む」からこのフォルダを選ぶ

すでに開いているタブには効かないので、読み込んだあとに各サイトを再読み込みする。
