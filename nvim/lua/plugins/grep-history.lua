-- グローバル検索（<leader>/ と <leader>sg）の入力欄が空のときに、過去に検索した文字列を候補に出す。
-- 履歴は snacks.nvim が内部で持っているデータ（picker.history）から読む。

-- 過去に検索した文字列を、新しい順・重複なしの候補リストにして返す
---@param picker snacks.Picker
local function history_items(picker)
  local data = picker.history.kv.data
  local items, seen = {}, {}
  -- data は古い順に並んでいるので、後ろから読む
  for i = #data, 1, -1 do
    local hist = data[i]
    if type(hist) == "table" and (hist.search or "") ~= "" then
      local key = hist.search .. "\0" .. (hist.pattern or "")
      if not seen[key] then
        seen[key] = true
        items[#items + 1] = {
          text = hist.search,
          history = true,
          -- search / pattern という名前は snacks.nvim が別の用途で使うので、hist_ を付ける
          hist_search = hist.search,
          hist_pattern = hist.pattern or "",
          hist_live = hist.live ~= false,
        }
      end
    end
  end
  return items
end

-- プレビュー欄の各行の左に入れる余白
local PAD = " "

-- プレビュー欄の行番号の設定（number）の元の値。最初にプレビューを表示したときに覚える
local default_number ---@type boolean?

-- 履歴の文字列で検索したときにヒットするファイルの一覧を、プレビュー欄に表示する
---@param ctx snacks.picker.preview.ctx
local function preview_files(ctx)
  local item = ctx.item
  local picker = ctx.picker
  ctx.preview:reset()
  ctx.preview:set_title(item.hist_search)

  -- result.lines を表示して、result.marks の位置に色を付ける
  local function show(result)
    -- rg の結果が返ってくる前に、別の履歴にカーソルが移っていたら表示しない
    local current = picker:current({ resolve = false })
    if picker.closed or not (current and current.hist_search == item.hist_search) then
      return
    end
    -- 行番号の列を消して、左の余白をなくす
    ctx.preview:minimal()
    ctx.preview:set_lines(result.lines)
    local buf = ctx.preview.win.buf
    if not buf then
      return
    end
    for _, mark in ipairs(result.marks) do
      vim.api.nvim_buf_set_extmark(buf, ctx.preview:ns(), mark.row, mark.col, {
        end_col = mark.end_col,
        hl_group = mark.hl,
      })
    end
  end

  -- 同じ履歴を 2 回目に表示するときは、前回の結果を使う
  if item.hist_files then
    return show(item.hist_files)
  end
  show({ lines = { PAD .. "Searching..." }, marks = {} })

  local pattern, pargs = Snacks.picker.util.parse(item.hist_search)
  local cmd = { "rg", "--count-matches", "--with-filename", "--color=never", "--smart-case", "--glob=!.git" }
  local opts = picker.opts --[[@as snacks.picker.grep.Config]]
  cmd[#cmd + 1] = opts.hidden and "--hidden" or "--no-hidden"
  if opts.ignored then
    cmd[#cmd + 1] = "--no-ignore"
  end
  if opts.regex == false then
    cmd[#cmd + 1] = "--fixed-strings"
  end
  vim.list_extend(cmd, pargs)
  -- 検索する場所を "." と明示する（省略すると rg が標準入力を読もうとして止まることがある）
  vim.list_extend(cmd, { "--", pattern, "." })

  vim.system(
    cmd,
    { cwd = picker:cwd(), text = true },
    vim.schedule_wrap(function(res)
      -- rg は「./ファイルのパス:ヒット件数」を 1 行ずつ出力する
      local files, total = {}, 0
      for line in (res.stdout or ""):gmatch("[^\n]+") do
        local path, count = line:match("^%./(.*):(%d+)$")
        if path then
          files[#files + 1] = { path = path, count = tonumber(count) }
          total = total + tonumber(count)
        end
      end
      table.sort(files, function(a, b)
        return a.path < b.path
      end)
      local header = PAD .. ("%d files, %d matches"):format(#files, total)
      local lines = { header, "" }
      local marks = { { row = 0, col = 0, end_col = #header, hl = "SnacksPickerDimmed" } }
      -- 1 ファイルにつき「アイコン フォルダ/ファイル名  件数」の 1 行を作る
      for _, file in ipairs(files) do
        local text = PAD
        local function add(str, hl)
          marks[#marks + 1] = { row = #lines, col = #text, end_col = #text + #str, hl = hl }
          text = text .. str
        end
        local icon, icon_hl = Snacks.util.icon(file.path, "file")
        local dir, name = file.path:match("^(.*/)([^/]*)$")
        add(icon .. " ", icon_hl)
        add(dir or "", "SnacksPickerDir")
        add(name or file.path, "SnacksPickerFile")
        add("  " .. file.count, "SnacksPickerDimmed")
        lines[#lines + 1] = text
      end
      item.hist_files = { lines = lines, marks = marks }
      show(item.hist_files)
    end)
  )
end

return {
  {
    "folke/snacks.nvim",
    opts = {
      picker = {
        sources = {
          grep = {
            -- 入力が空なら履歴を返し、入力があれば通常の grep を実行する
            finder = function(opts, ctx)
              if ctx.filter.search == "" then
                return history_items(ctx.picker)
              end
              return require("snacks.picker.source.grep").grep(opts, ctx)
            end,
            format = function(item, picker)
              if not item.history then
                return Snacks.picker.format.file(item, picker)
              end
              -- \u{f1da} は Nerd Font の「履歴」アイコン
              local ret = { { "\u{f1da} ", "SnacksPickerDimmed" }, { item.hist_search } }
              if item.hist_pattern ~= "" then
                ret[#ret + 1] = { "  > " .. item.hist_pattern, "SnacksPickerDimmed" }
              end
              return ret
            end,
            preview = function(ctx)
              -- 履歴のプレビューでは、行番号の列を出さない。
              -- number を false にしても、statuscolumn（LazyVim が行番号や印を描く列）が幅を確保したまま
              -- 残るので、statuscolumn も空にする。
              -- snacks.nvim は画面を描き直すときに win.opts.wo の値をプレビュー欄に設定し直すので、
              -- ウィンドウの設定だけでなく win.opts.wo も書き換える。
              local wo = ctx.preview.win.opts.wo
              if default_number == nil then
                default_number = wo.number ~= false
              end
              if ctx.item.history then
                wo.number, wo.statuscolumn = false, ""
              else
                wo.number, wo.statuscolumn = default_number, vim.go.statuscolumn
              end
              ctx.preview:wo({ number = wo.number, statuscolumn = wo.statuscolumn })
              if ctx.item.history then
                return preview_files(ctx)
              end
              return Snacks.picker.preview.file(ctx)
            end,
            -- 履歴を選んだときは、ファイルを開く代わりに、その文字列を入力欄に入れて検索し直す
            confirm = function(picker, item, action)
              if not (item and item.history) then
                return Snacks.picker.actions.jump(picker, item, action)
              end
              picker.opts.live = item.hist_live
              picker.input:set(item.hist_pattern, item.hist_search)
              picker:find()
            end,
          },
        },
      },
    },
  },
}
