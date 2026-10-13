// ===1.準備 ===

// iframe（GoogleMapやYouTubeなどの埋め込みページ）はスキップ
// ※ Chrome拡張機能はページ内のすべてのフレームにcontent.jsを注入するのでこれのチェックが必要
if (window !== window.top) {
  throw new Error("My Mini Memo Extension: iframe execution skipped.");

  // メモ:
  // JSファイルはエラーが投げられるとそこで処理が終了するので、以降のコードは実行されない
  // returnガード節と似ているが、returnは関数の中でないと使えないので、今回はエラーを投げる方法を採用
}

// sessionStorageキーの名前を生成するヘルパー関数
function getStorageKey(type) {
  return `my_mini_memo_ext_${type}_${window.location.href}`;
  
  // メモ:
  // window.locationは現在のページの場所（URL）に関する情報や操作を持つオブジェクト
  // 例: protocol(https:), hostname(www.example.com), port(8080), pathname(/path/to/page),
  //     href(完全なURL), assign()(ページ移動), reload()(リロード) など
}


// ====2.要素の作成 ====

// コンテナ（メモの大枠）
const memoContainer = document.createElement('div');
memoContainer.id = 'my-floating-memo';

// ヘッダー
const header = document.createElement('div');
header.id = 'my-memo-header';
header.innerText = 'Memo';
memoContainer.appendChild(header);

// テキストエリア
const textarea = document.createElement('textarea');
textarea.id = 'my-memo-text';
textarea.placeholder = 'メモを入力...';
memoContainer.appendChild(textarea);

// リサイズハンドル（SE = SouthEast:右下）
const resizeHandleSE = document.createElement('div');
resizeHandleSE.className = 'memo-resize-handle memo-resize-se';
memoContainer.appendChild(resizeHandleSE);

// リサイズハンドル（SW = SouthWest:左下）
const resizeHandleSW = document.createElement('div');
resizeHandleSW.className = 'memo-resize-handle memo-resize-sw';
memoContainer.appendChild(resizeHandleSW);

// メモ: 
// SEやSWはCSSで右下・左下を表すプレフィクスとしてよく使われる
// 例: cursor: se-resize; (ウィンドウの右下に置いたときの斜めの矢印)


// ===3.データの復元 ===

const savedContent = sessionStorage.getItem(getStorageKey('content'));
if (savedContent) textarea.value = savedContent;

// メモ:
// 以下では、sessionStorageには文字列しか保存できないことに注意
// - '{left:"100px", top:"200px"}'などの文字列はオブジェクトに変換(JSON.parse)する
// - 真偽値も文字列 'true', 'false' を使用する

const savedPosition = JSON.parse(sessionStorage.getItem(getStorageKey('position')));
if (savedPosition) {
  memoContainer.style.left = savedPosition.left;
  memoContainer.style.top = savedPosition.top;
}

const savedSize = JSON.parse(sessionStorage.getItem(getStorageKey('size')));
if (savedSize) {
  memoContainer.style.width = savedSize.width;
  memoContainer.style.height = savedSize.height;
}

const isVisible = sessionStorage.getItem(getStorageKey('visible')) === 'true';
memoContainer.style.display = isVisible ? 'flex' : 'none';
// メモ: コンテナは要素を縦にならべるのでflexを使っている


// === 4.機能関数の定義 ===

// 表示切り替え (Control + M)
function toggleMemo() {
  const isHidden = window.getComputedStyle(memoContainer).display === 'none';
  // メモ：getComputedStyleは実際の画面に適用されいている最終的なスタイルを取得する

  if (isHidden) {
    memoContainer.style.display = 'flex';
    sessionStorage.setItem(getStorageKey('visible'), 'true');
    textarea.focus();
  } else {
    memoContainer.style.display = 'none';
    sessionStorage.setItem(getStorageKey('visible'), 'false');
  }
}

// 位置とサイズのリセット (Control + Shift + M)
// "Rect"は要素の位置とサイズ(left,top,width,height)をセットで表す用語
function resetRect() {
  // スタイルを強制的に初期値に戻す
  // 非表示だった場合には表示させる仕様にする
  memoContainer.style.display = 'flex';
  memoContainer.style.top = '20px';
  memoContainer.style.left = ''; //[解説]
  memoContainer.style.width = '250px';
  memoContainer.style.height = '300px';

  // 解説:
  // コンテナの位置はleftとtopで監視・保存している(計算が簡単になるため)
  // 一方、初期値はrightとtopで指定されている(right:20px, top:20px)
  // CSSはrightとleftが両方指定されている場合(左書きの場合は)leftが優先されるため、
  // leftの値を追加すれば、初期値のright:20pxは無効化され、
  // 逆にleftの値を消去すれば、right:20pxが再び有効になる
  // ちなみに、style.right = '20px'をここで指定するのは保守性が下がるので避けるべき

  // ストレージの情報もリセット
  sessionStorage.setItem(getStorageKey('visible'), 'true');
  sessionStorage.removeItem(getStorageKey('position'));
  sessionStorage.removeItem(getStorageKey('size'));
  
  textarea.focus();
}

// 位置とサイズの保存
function saveRect() {
  // この関数はドラッグ移動やリサイズの完了時に呼ばれるため、表示されていることが前提だが、
  // 誤ってdisplay: noneの状態で実行されると位置やサイズが0になるので、念のため存在性のチェックをする
  if (memoContainer.style.display !== 'none') {
    const position = { left: memoContainer.style.left, top: memoContainer.style.top };
    sessionStorage.setItem(getStorageKey('position'), JSON.stringify(position));

    const size = { width: memoContainer.style.width, height: memoContainer.style.height };
    sessionStorage.setItem(getStorageKey('size'), JSON.stringify(size));
    
    // メモ:
    // {要素}.styleはCSSファイルではなく、**インラインスタイル**を参照するため
    // widthとheightの初期値は空になる（逆にいうと、これらを空にするとCSSが適用されサイズは初期値に戻る）
    // sessionStorage.setItemの前にwidthとheightの存在性をチェックするかどうかは流派が分かれる
    // 存在性をチェックする→空文字のときは保存しない→リセットしたはずなのに前のサイズがストレージに残る
    // 存在性をチェックしない→空文字の代入は「リセット」とみなす→常に画面のサイズとストレージが同期する
    // 今回は可読性を重視して後者を採用する
  }
}


// === 5. テキスト入力処理 ===
textarea.addEventListener('input', () => {
  sessionStorage.setItem(getStorageKey('content'), textarea.value);
});


// === 6. ドラッグ&リサイズ処理 ===

// === 6-1. 準備 ===

let isMoving = false;
let isResizingSE = false;
let isResizingSW = false;

// ドラッグ移動の処理で必要なマウスと要素の位置の差分
let moveOffsetX, moveOffsetY;

// リサイズ開始時の
let resizeMouseStartX, resizeMouseStartY;
// let startLeft, startTop;
// let initialRect.width, initialRect.height;
let initialRect;

function getRect() {
  const style = window.getComputedStyle(memoContainer);
  return {
    left: parseFloat(style.left),
    top: parseFloat(style.top),
    width: parseFloat(style.width),
    height: parseFloat(style.height)
  };
  // style.leftなどは'10px'のような文字列なのでparseFloatで数値に変換する
}


// === 6-2. mousedown（ドラッグ開始時）のイベントリスナー ===

// ドラッグ移動
header.addEventListener('mousedown', (e) => {
  isMoving = true;
  const rect = memoContainer.getBoundingClientRect();
  moveOffsetX = e.clientX - rect.left;
  moveOffsetY = e.clientY - rect.top;
  header.style.cursor = 'grabbing';
  e.stopPropagation();

  // メモ:
  // getBoundingClientRectは要素の位置とサイズの情報をオブジェクトで返す
  // 例: {left: 100, top: 200, width: 250, height: 300, right: 350, bottom: 500}
  // e.clientX/Yはクリック時のマウスの位置を表す
  // e.stopPropagationはイベントの伝播を防ぐためのメソッド
  // 今回は裏にあるWebサイトのボタンなどをクリックしないようにする
});

// 右下リサイズ
resizeHandleSE.addEventListener('mousedown', (e) => {
  isResizingSE = true;
  resizeMouseStartX = e.clientX;
  resizeMouseStartY = e.clientY;
  initialRect = getRect();
  e.stopPropagation();
  e.preventDefault();

  // メモ:
  // e.preventDefault()はブラウザのデフォルトの動作を防ぐメソッド
  // 今回はドラッグ中にテキストが選択されるのを防ぐ
});

// 左下リサイズ
resizeHandleSW.addEventListener('mousedown', (e) => {
  isResizingSW = true;
  resizeMouseStartX = e.clientX;
  resizeMouseStartY = e.clientY;
  initialRect = getRect();
  e.stopPropagation();
  e.preventDefault();
});

// === 6-3. mousemove（ドラッグ中）のイベントリスナー ===

document.addEventListener('mousemove', (e) => {
  // 位置の変更
  if (isMoving) {
    e.preventDefault();
    memoContainer.style.left = `${e.clientX - moveOffsetX}px`;
    memoContainer.style.top = `${e.clientY - moveOffsetY}px`;
  } 
  // 右下のリサイズ(簡単)
  else if (isResizingSE) {
    e.preventDefault();
    const dx = e.clientX - resizeMouseStartX;
    const dy = e.clientY - resizeMouseStartY;
    memoContainer.style.width = `${initialRect.width + dx}px`;
    memoContainer.style.height = `${initialRect.height + dy}px`;
  } 
  // 左下のリサイズ(少し複雑)
  else if (isResizingSW) {
    e.preventDefault();
    let dx = e.clientX - resizeMouseStartX; 
    const dy = e.clientY - resizeMouseStartY;
    let newWidth = initialRect.width - dx;
    if (newWidth < 200) {
      newWidth = 200;
      dx = initialRect.width - 200; 
    }
    memoContainer.style.left = `${initialRect.left + dx}px`;
    memoContainer.style.width = `${newWidth}px`;
    memoContainer.style.height = `${initialRect.height + dy}px`;

    // メモ:
    // 要素の位置の基準は左上なので、左下でリサイズするときは
    // コンテナの位置もその分だけ左右に動かす必要がある
    // そのため、style.leftも変更している(左上の基準点の移動)
    // またこれにより、コンテナが最小幅に到達したときはdxを固定して
    // 要素がそれ以上左に動かないようにするロジックが必要になる
  }
});

// === 6-4. mouseup（ドラッグ終了時）のイベントリスナー ===

document.addEventListener('mouseup', () => {
  const wasActive = isMoving || isResizingSE || isResizingSW;
  isMoving = false;
  isResizingSE = false;
  isResizingSW = false;
  header.style.cursor = 'grab';

  if (wasActive) saveRect();
});


// ===7.キーボードイベント処理 ===

// メモ帳内部でのキー入力
memoContainer.addEventListener('keydown', (e) => {
  e.stopPropagation();

  // 位置とサイズのリセット (Control + Shift + M)
  if (e.ctrlKey && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
    e.preventDefault();
    resetRect(); 
    return;
  }
  //  表示切り替え (Control + M)
  if (e.ctrlKey && (e.key === 'M' || e.key === 'm')) {
    e.preventDefault();
    toggleMemo();
    return; //なくてもよいが、明示的に終了を示すためにつけておく
  }
});

// その他遮断すべきイベント
const eventsToBlock = ['keyup', 'keypress', 'paste', 'copy', 'cut', 'mousedown', 'click', 'contextmenu', 'dblclick', 'wheel'];
eventsToBlock.forEach(eventType => {
  memoContainer.addEventListener(eventType, (e) => {
    e.stopPropagation();
  });
});

// グローバルショートカット (Webサイト側にフォーカスがある時)
document.addEventListener('keydown', (e) => {
  // 1. Control + Shift + M
  if (e.ctrlKey && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
    e.preventDefault();
    resetRect();
  }
  // 2. Control + M
  else if (e.ctrlKey && (e.key === 'M' || e.key === 'm')) {
    e.preventDefault();
    toggleMemo();
  }
});

// ===8.画面への追加 ===
document.body.appendChild(memoContainer);