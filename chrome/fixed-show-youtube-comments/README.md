# Fixed - show youtube comment while watching

Chrome ウェブストア版の「Show YouTube comments while watching」1.0.5 をコピーして、
content script と CSS を書き換えたものです。

### 1. 直した問題

#### 1-1. 自動再生でページ内遷移すると関連動画がコメントの下に潜り込む

自動再生やサムネイルのクリックでページ内遷移すると、関連動画が右カラムの
コメントの下に移動してしまう。コメントは無限スクロールで増え続けるので、
関連動画までたどり着けなくなる。ページをリロードすると直る。

#### 1-2. ページをスクロールするとコメント欄が画面から消える

関連動画を見ようとしてページを下にスクロールすると、コメント欄がページと
一緒に上へ流れて画面の外に出てしまう。

### 2. 原因

#### 2-1. YouTube が関連動画を右カラムに戻している

YouTube の `ytd-watch-flexy.updateWatchFeedLocation()` が、2 カラム表示のとき
`#secondary-inner.appendChild(#related)` を実行して、関連動画を右カラムの
一番下に付け直す。この拡張機能はコメントを `#secondary-inner` に入れているので、
関連動画がコメントの下に入る。

このメソッドを呼んでいるのは `isTwoColumnsChanged_`（カラム数が変わったとき）と
`onFixedPanelVisibilityChanged`（説明欄などのパネルの表示が変わったとき）。

元の content script は「コメントが `#primary-inner` にあり、かつ関連動画が
`#secondary-inner` にある」ときしか入れ替えをしないので、この状態からは
二度と復帰できない。

#### 2-2. 右カラムが画面に固定されていない

元の CSS は `#secondary` に `height: calc(100vh - 80px)` と `overflow: scroll` を
指定しているだけで、位置は `position: relative` のまま。そのためページを
スクロールすると右カラムごと上へ流れていく。

### 3. 変更点

#### 3-1. showYoutubeComments.js

MutationObserver で `#secondary-inner` と `#below` 内のコンテナを監視し、
YouTube が関連動画を戻すたびに再度動画の下へ移動し直すようにした。
何度実行しても結果が変わらない (idempotent) ので、拡張機能がページ遷移ごとに
スクリプトを再注入しても問題ない。1 カラム表示のときは YouTube 側の配置に任せる。

#### 3-2. showYoutubeComments.css

`#secondary` に `position: sticky` と `top: 56px`（YouTube のヘッダーの高さ）を
追加して、右カラムを画面に固定した。ページをどれだけスクロールしても
コメント欄が常に画面いっぱいに表示され、コメント欄の上でホイールを回すと
コメントだけがスクロールする。

YouTube 側のスタイルの方が詳細度が高いため `!important` が必要。
1 カラム表示のときは YouTube が `#secondary` を `display: none` にするので、
この指定は影響しない。

#### 3-3. manifest.json

`key` と `update_url` を削除した。ストア版と拡張機能 ID が衝突しないようにするためと、
自動更新で上書きされないようにするため。
