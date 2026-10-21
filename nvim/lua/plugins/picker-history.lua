-- グローバル検索（<leader>/ と <leader>sg）とファイル検索（<leader><leader>）の入力欄が空のときに、過去に検索した文字列を候補に出す。
-- 履歴は snacks.nvim が内部で持っているデータ（picker.history）から読む。

---@param picker snacks.Picker
local function record_cwd_in_history(picker)
  local history = picker.history
  if history.records_cwd then
    return
  end
  history.records_cwd = true
  local record = history.record
  history.record = function(self, value)
    value.cwd = picker:cwd()
    return record(self, value)
  end
end

-- 過去に検索した文字列を、新しい順・重複なしの候補リストにして返す
---@param picker snacks.Picker
---@param main_field "search"|"pattern"
local function history_items(picker, main_field)
  local data = picker.history.kv.data
  local cwd = picker:cwd()
  local items, seen = {}, {}
  -- data は古い順に並んでいるので、後ろから読む
  for i = #data, 1, -1 do
    local hist = data[i]
    if type(hist) == "table" and hist.cwd == cwd and (hist[main_field] or "") ~= "" then
      local key = (hist.search or "") .. "\0" .. (hist.pattern or "")
      if not seen[key] then
        seen[key] = true
        items[#items + 1] = {
          text = hist[main_field],
          history = true,
          -- search / pattern という名前は snacks.nvim が別の用途で使うので、hist_ を付ける
          hist_search = hist.search or "",
          hist_pattern = hist.pattern or "",
          hist_live = hist.live ~= false,
        }
      end
    end
  end
  return items
end

---@param main_field "search"|"pattern"
local function format_history(main_field)
  return function(item, picker)
    if not item.history then
      return Snacks.picker.format.file(item, picker)
    end
    local sub_text = main_field == "search" and item.hist_pattern or item.hist_search
    -- \u{f1da} は Nerd Font の「履歴」アイコン
    local ret = { { "\u{f1da} ", "SnacksPickerDimmed" }, { item.text } }
    if sub_text ~= "" then
      ret[#ret + 1] = { "  > " .. sub_text, "SnacksPickerDimmed" }
    end
    return ret
  end
end

-- 履歴を選んだときは、ファイルを開く代わりに、その文字列を入力欄に入れて検索し直す
local function confirm_history(picker, item, action)
  if not (item and item.history) then
    return Snacks.picker.actions.jump(picker, item, action)
  end
  picker.opts.live = item.hist_live
  picker.input:set(item.hist_pattern, item.hist_search)
  picker:find()
end

-- プレビュー欄の各行の左に入れる余白
local PAD = " "

-- プレビュー欄の行番号の設定（number）の元の値。最初にプレビューを表示したときに覚える
local default_number ---@type boolean?

local function history_preview(preview_history)
  ---@param ctx snacks.picker.preview.ctx
  return function(ctx)
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
      ctx.preview:reset()
      ctx.preview:set_title(ctx.item.text)
      return preview_history(ctx)
    end
    return Snacks.picker.preview.file(ctx)
  end
end

-- result.lines をプレビュー欄に表示して、result.marks の位置に色を付ける
---@param ctx snacks.picker.preview.ctx
local function show_preview(ctx, result)
  -- 検索の結果が返ってくる前に、別の履歴にカーソルが移っていたら表示しない
  local item, picker = ctx.item, ctx.picker
  local current = picker:current({ resolve = false })
  if
    picker.closed
    or not (current and current.hist_search == item.hist_search and current.hist_pattern == item.hist_pattern)
  then
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
      priority = mark.priority,
    })
  end
end

local function searching_result()
  return { lines = { PAD .. "Searching..." }, marks = {} }
end

local function result_with_header(header)
  local text = PAD .. header
  return {
    lines = { text, "" },
    marks = { { row = 0, col = 0, end_col = #text, hl = "SnacksPickerDimmed" } },
  }
end

-- 1 ファイルにつき「アイコン フォルダ/ファイル名  suffix」の 1 行を作る
local function add_file_line(result, path, suffix, match_positions)
  local row = #result.lines
  local text = PAD
  local function add(str, hl)
    result.marks[#result.marks + 1] = { row = row, col = #text, end_col = #text + #str, hl = hl }
    text = text .. str
  end
  local icon, icon_hl = Snacks.util.icon(path, "file")
  local dir, name = path:match("^(.*/)([^/]*)$")
  add(icon .. " ", icon_hl)
  local path_col = #text
  add(dir or "", "SnacksPickerDir")
  add(name or path, "SnacksPickerFile")
  if suffix then
    add("  " .. suffix, "SnacksPickerDimmed")
  end
  for _, pos in ipairs(match_positions or {}) do
    result.marks[#result.marks + 1] = {
      row = row,
      col = path_col + pos - 1,
      end_col = path_col + pos,
      hl = "SnacksPickerMatch",
      priority = 200,
    }
  end
  result.lines[#result.lines + 1] = text
end

-- 履歴の文字列でグローバル検索したときにヒットするファイルの一覧を、プレビュー欄に表示する
---@param ctx snacks.picker.preview.ctx
local function preview_grep_files(ctx)
  local item = ctx.item
  local picker = ctx.picker

  -- 同じ履歴を 2 回目に表示するときは、前回の結果を使う
  if item.hist_files then
    return show_preview(ctx, item.hist_files)
  end
  show_preview(ctx, searching_result())

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
      local result = result_with_header(("%d files, %d matches"):format(#files, total))
      for _, file in ipairs(files) do
        add_file_line(result, file.path, tostring(file.count))
      end
      item.hist_files = result
      show_preview(ctx, result)
    end)
  )
end

local MAX_PREVIEW_FILES = 300

---@param picker snacks.Picker
local function with_all_files(picker, callback)
  local opts = picker.opts --[[@as snacks.picker.files.Config]]
  local cwd = picker:cwd()
  local cache_key = table.concat({ cwd, tostring(opts.hidden), tostring(opts.ignored), tostring(opts.follow) }, "\0")
  local cache = picker.history_all_files
  if cache and cache.key == cache_key then
    if cache.files then
      return callback(cache.files)
    end
    cache.callbacks[#cache.callbacks + 1] = callback
    return
  end

  cache = { key = cache_key, callbacks = { callback } }
  picker.history_all_files = cache
  local cmd, args = require("snacks.picker.source.files").get_cmd(opts.cmd)
  if not cmd or not args then
    cache.files = {}
    return callback(cache.files)
  end
  if opts.hidden then
    args[#args + 1] = "--hidden"
  end
  if opts.ignored then
    args[#args + 1] = "--no-ignore"
  end
  if opts.follow then
    args[#args + 1] = "-L"
  end
  vim.list_extend(args, opts.args or {})

  vim.system(
    { cmd, unpack(args) },
    { cwd = cwd, text = true },
    vim.schedule_wrap(function(res)
      local files = {}
      for line in (res.stdout or ""):gmatch("[^\n]+") do
        files[#files + 1] = line:gsub("^%./", "")
      end
      cache.files = files
      for _, cb in ipairs(cache.callbacks) do
        cb(files)
      end
      cache.callbacks = {}
    end)
  )
end

---@param ctx snacks.picker.preview.ctx
local function preview_matching_files(ctx)
  local item = ctx.item
  local picker = ctx.picker

  if item.hist_files then
    return show_preview(ctx, item.hist_files)
  end
  show_preview(ctx, searching_result())

  with_all_files(picker, function(all_files)
    local matcher = require("snacks.picker.core.matcher").new(picker.opts.matcher)
    matcher:init(item.hist_pattern)
    local found = {}
    for i, path in ipairs(all_files) do
      local file = { text = path, file = path, idx = i }
      file.score = matcher:match(file)
      if file.score > 0 then
        found[#found + 1] = file
      end
    end
    table.sort(found, function(a, b)
      if a.score ~= b.score then
        return a.score > b.score
      end
      if #a.text ~= #b.text then
        return #a.text < #b.text
      end
      return a.idx < b.idx
    end)

    local result = result_with_header(("%d files"):format(#found))
    for i = 1, math.min(#found, MAX_PREVIEW_FILES) do
      add_file_line(result, found[i].text, nil, matcher:positions(found[i]).text)
    end
    item.hist_files = result
    show_preview(ctx, result)
  end)
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
              record_cwd_in_history(ctx.picker)
              if ctx.filter.search == "" then
                return history_items(ctx.picker, "search")
              end
              return require("snacks.picker.source.grep").grep(opts, ctx)
            end,
            format = format_history("search"),
            preview = history_preview(preview_grep_files),
            confirm = confirm_history,
          },
          files = {
            finder = function(opts, ctx)
              record_cwd_in_history(ctx.picker)
              if ctx.filter.pattern == "" and ctx.filter.search == "" then
                local items = history_items(ctx.picker, "pattern")
                if #items > 0 then
                  return items
                end
              end
              return require("snacks.picker.source.files").files(opts, ctx)
            end,
            filter = {
              transform = function(picker, filter)
                local input_empty = filter.pattern == "" and filter.search == ""
                if picker.history_input_empty ~= input_empty then
                  picker.history_input_empty = input_empty
                  return true
                end
              end,
            },
            format = format_history("pattern"),
            preview = history_preview(preview_matching_files),
            confirm = confirm_history,
          },
        },
      },
    },
  },
}
