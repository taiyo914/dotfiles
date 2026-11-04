-- picker の項目を「ファイル:行番号: 行の内容」の 1 行にする。ファイルを持たない項目はそのままの文字にする
---@param item snacks.picker.Item
local function format_item_as_location(item)
  local path = Snacks.picker.util.path(item)
  if not path then
    return item.text
  end
  local relative_path = vim.fn.fnamemodify(path, ":~:.")
  local line_number = item.pos and item.pos[1] or 1
  local line_text = vim.trim(item.line or "")
  return ("%s:%d: %s"):format(relative_path, line_number, line_text)
end

-- 選んだ項目（選んでいなければ一覧の全部）をクリップボードにコピーする
---@param picker snacks.Picker
local function copy_locations(picker)
  local selected_items = picker:selected()
  local items = #selected_items > 0 and selected_items or picker:items()
  local lines = vim.tbl_map(format_item_as_location, items)
  vim.fn.setreg("+", table.concat(lines, "\n"))
  Snacks.notify(("%d 件をコピーしました"):format(#lines), { title = "Snacks Picker" })
end

-- インサートモードで文字が入っていればノーマルモードに戻り、それ以外は picker を閉じる
---@param picker snacks.Picker
local function cancel_if_input_empty(picker)
  if vim.fn.mode():find("^i") and picker.input:get() ~= "" then
    return vim.cmd.stopinsert()
  end
  Snacks.picker.actions.cancel(picker)
end

-- grep で、.gitignore に書かれていても vendor/bundle の中を検索する。
-- ripgrep は直接渡されたフォルダなら .gitignore に書かれていても検索するので、プロジェクトと vendor/bundle の 2 つを渡す
---@param opts snacks.picker.Config
local function search_vendor_bundle_too(opts)
  local finder = opts.finder
  opts.finder = function(finder_opts, ctx)
    local cwd = finder_opts.cwd or vim.uv.cwd()
    local vendor_bundle = vim.fs.joinpath(cwd, "vendor/bundle")
    local searches_other_place = finder_opts.ignored -- alt + i を押していると vendor/bundle がもう検索に入るので、足すと結果が 2 回ずつ出る
      or (finder_opts.dirs and #finder_opts.dirs > 0)
      or finder_opts.buffers
      or finder_opts.rtp
    if not searches_other_place and vim.fn.isdirectory(vendor_bundle) == 1 then
      finder_opts = vim.tbl_extend("force", finder_opts, { dirs = { cwd, vendor_bundle } })
    end
    if type(finder) == "function" then
      return finder(finder_opts, ctx)
    end
    return require("snacks.picker.source.grep").grep(finder_opts, ctx)
  end
end

return {
  {
    "folke/snacks.nvim",
    opts = {
      picker = {
        actions = {
          copy_locations = copy_locations,
          cancel_if_input_empty = cancel_if_input_empty,
        },
        win = {
          input = {
            keys = {
              -- picker で Ctrl + y を押すと、一覧を「ファイル:行番号: 行の内容」の形でクリップボードにコピーする
              ["<c-y>"] = { "copy_locations", mode = { "n", "i" } },
              -- Esc を押すと、インサートモードで文字が入っていればノーマルモードに戻り、それ以外は picker を閉じる。
              -- snacks は <Esc> の設定をモードごとではなくキーごとに 1 つしか持てないので、ノーマルモードの分もここで受け持つ
              ["<esc>"] = { "cancel_if_input_empty", mode = { "n", "i" } },
            },
          },
          -- 一覧の欄でも Ctrl + y でコピーできるようにする
          list = { keys = { ["<c-y>"] = "copy_locations" } },
        },
        sources = {
          grep = {
            config = search_vendor_bundle_too,
            layout = {
              layout = {
                backdrop = false,
                width = 0.9,
                height = 0.9,
                box = "vertical",
                border = true,
                title = "{title} {live} {flags}",
                title_pos = "center",
                { win = "input", height = 1, border = "bottom" },
                { win = "list", border = "none" },
                { win = "preview", title = "{preview}", height = 0.6, border = "top" },
              },
            },
          },
        },
      },
    },
  },
}
