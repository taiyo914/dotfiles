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
