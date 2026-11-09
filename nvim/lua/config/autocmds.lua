-- Autocmds are automatically loaded on the VeryLazy event
-- Default autocmds that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/autocmds.lua
--
-- Add any additional autocmds here
-- with `vim.api.nvim_create_autocmd`
--
-- Or remove existing autocmds by their group name (which is prefixed with `lazyvim_` for the defaults)
-- e.g. vim.api.nvim_del_augroup_by_name("lazyvim_wrap_spell")

-- ファイルを開いたとき、ファイルツリーでそのファイルの行が真ん中に来るようにスクロールする
-- snacks.nvim の元の処理は、その行が画面に入る最小限しかスクロールしないので、行の位置が毎回変わる
-- ファイルツリーで選んで開いたときは、カーソルがすでにその行にあるので、スクロールしない
local explorer_actions = require("snacks.explorer.actions")
explorer_actions.reveal = function(picker, path)
  if picker.closed then
    return
  end
  for item, idx in picker:iter() do
    if item.file == path then
      if idx ~= picker.list.cursor then
        picker.list:view(idx, idx - math.floor(picker.list:height() / 2))
      end
      return true
    end
  end
end

-- nvim を起動したときに、ファイルツリーを最初から開いておく
-- カーソルはファイルツリーに移さず、編集画面に残す
local function on_start()
  Snacks.explorer({ cwd = LazyVim.root(), enter = false })
end

-- このファイルは、引数なしで起動すると VimEnter より後に読み込まれるので、その場合はすぐに開く
if vim.v.vim_did_enter == 1 then
  on_start()
else
  vim.api.nvim_create_autocmd("VimEnter", { callback = on_start })
end

-- macOS の入力ソースを英数（Google 日本語入力の英数モード）に切り替える
-- nvim からは入力ソースを直接変えられないので、Hammerspoon の hs コマンドに頼む
-- Hammerspoon が動いていないと hs コマンドが終わらないので、1秒で打ち切る
local function switch_to_eisuu()
  if vim.fn.executable("hs") ~= 1 then
    return
  end
  vim.system({ "hs", "-c", 'hs.keycodes.currentSourceID("com.google.inputmethod.Japanese.Roman")' }, { timeout = 1000 })
end

-- ノーマルモードでは日本語入力だとキー操作が効かないので、次の3つのタイミングで英数にする
-- 1. nvim を起動したとき（このファイルは起動時に1回読み込まれる）
switch_to_eisuu()

-- 2. インサートモードを抜けたとき
vim.api.nvim_create_autocmd("InsertLeave", { callback = switch_to_eisuu })

-- 3. 別のアプリから nvim の画面に戻ってきたとき
-- インサートモードで日本語を書いている途中なら、日本語入力のままにする
vim.api.nvim_create_autocmd("FocusGained", {
  callback = function()
    if vim.api.nvim_get_mode().mode == "n" then
      switch_to_eisuu()
    end
  end,
})

-- 最後に押したキーがマウスホイールかどうかを覚えておく
local wheel_keys = {}
for _, name in ipairs({ "ScrollWheelUp", "ScrollWheelDown", "ScrollWheelLeft", "ScrollWheelRight" }) do
  wheel_keys[vim.keycode("<" .. name .. ">")] = true
end
local last_key_was_wheel = false
vim.on_key(function(_, typed)
  if typed and typed ~= "" then
    last_key_was_wheel = wheel_keys[typed] == true
  end
end)

local function is_cursor_beyond_line_end()
  return vim.fn.virtcol(".") >= vim.fn.virtcol("$")
end

-- ノーマルモードでカーソルが行末より右に行ったら、行の最後の文字に戻す
-- ホイールでスクロールしたときだけは戻さない。戻すと画面が左に戻ってしまい、横スクロールできないため
-- curswant を戻しておくと、j / k で長い行に移ったときに元の列に戻れる
vim.api.nvim_create_autocmd("CursorMoved", {
  callback = function()
    if vim.api.nvim_get_mode().mode == "n" and not last_key_was_wheel and is_cursor_beyond_line_end() then
      local view = vim.fn.winsaveview()
      vim.cmd("normal! $")
      vim.fn.winrestview({ curswant = view.curswant })
    end
  end,
})

-- インサートモードの間は virtualedit を切り、行末より右から入ったら行末から書き始める
-- こうしないと、行末からカーソルの位置までスペースが自動で入る
vim.api.nvim_create_autocmd("InsertEnter", {
  callback = function()
    local was_beyond_line_end = is_cursor_beyond_line_end()
    vim.opt.virtualedit = ""
    if was_beyond_line_end then
      vim.api.nvim_win_set_cursor(0, { vim.fn.line("."), #vim.api.nvim_get_current_line() })
    end
  end,
})
vim.api.nvim_create_autocmd("InsertLeave", {
  callback = function()
    vim.opt.virtualedit = "all"
  end,
})

-- Markdown ではスペルチェックをオフにする
-- 必要なときは <leader>us でオンにできる
vim.api.nvim_create_autocmd("FileType", {
  pattern = "markdown",
  callback = function()
    vim.opt_local.spell = false
  end,
})
