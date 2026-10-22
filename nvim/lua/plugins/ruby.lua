local method_search_dirs = { "app", "lib", "config" }
local method_search_globs = { "*.rb", "*.erb", "*.rake", "*.jbuilder" }

local function ruby_word_under_cursor()
  local line = vim.api.nvim_get_current_line()
  local cursor_col = vim.api.nvim_win_get_cursor(0)[2] + 1
  local search_start = 1
  while true do
    local word_start, word_end = line:find("[@$]*[%w_]+[?!]?", search_start)
    if not word_start then
      return nil
    end
    if word_start <= cursor_col and cursor_col <= word_end then
      return line:sub(word_start, word_end)
    end
    search_start = word_end + 1
  end
end

local function is_method_name(word)
  return word ~= nil and not word:match("^[%u@$]")
end

local function escape_method_name(method_name)
  return (method_name:gsub("[?!]", "\\%0"))
end

local function method_search_paths()
  local root = LazyVim.root()
  local existing_dirs = {}
  for _, dir in ipairs(method_search_dirs) do
    if vim.uv.fs_stat(root .. "/" .. dir) then
      table.insert(existing_dirs, root .. "/" .. dir)
    end
  end
  if #existing_dirs == 0 then
    return { root }
  end
  return existing_dirs
end

local function open_grep_picker(title, pattern)
  Snacks.picker.grep({
    title = title,
    search = pattern,
    live = false,
    supports_live = false,
    args = { "--pcre2" },
    dirs = method_search_paths(),
    glob = method_search_globs,
  })
end

local function grep_method_references(method_name)
  -- コメントの行、ハッシュのキー（foo:）、名前の一部だけが同じもの（foo?、@foo、other_foo）は結果から外す
  local pattern = "^(?!\\s*#).*?(?<![\\w@$])\\K" .. escape_method_name(method_name) .. "(?![\\w?!]|:(?!:))"
  open_grep_picker("References: " .. method_name, pattern)
end

local function find_references()
  local word = ruby_word_under_cursor()
  if is_method_name(word) then
    grep_method_references(word)
  else
    Snacks.picker.lsp_references()
  end
end

local method_defining_calls = {
  "attr_reader",
  "attr_writer",
  "attr_accessor",
  "alias_method",
  "define_method",
  "delegate",
  "scope",
  "belongs_to",
  "has_one",
  "has_many",
  "has_and_belongs_to_many",
}

-- def foo= のような代入用のメソッドは外し、attr_reader :foo などのメソッドを作る呼び出しも定義として探す
local function method_definition_pattern(method_name)
  local escaped_method_name = escape_method_name(method_name)
  return "^\\s*(def\\s+(self\\.)?"
    .. escaped_method_name
    .. "(?![\\w?!=])|("
    .. table.concat(method_defining_calls, "|")
    .. ")\\b.*:"
    .. escaped_method_name
    .. "(?![\\w?!]))"
end

local function grep_method_definitions(pattern)
  local command = { "rg", "--pcre2", "--vimgrep" }
  for _, glob in ipairs(method_search_globs) do
    vim.list_extend(command, { "-g", glob })
  end
  vim.list_extend(command, { "--", pattern })
  vim.list_extend(command, method_search_paths())

  local output = vim.system(command, { text = true }):wait().stdout or ""
  local matches = {}
  for line in output:gmatch("[^\n]+") do
    local path, line_number, column = line:match("^(.-):(%d+):(%d+):")
    if path then
      table.insert(matches, { path = path, line = tonumber(line_number), col = tonumber(column) - 1 })
    end
  end
  return matches
end

local function jump_to_grep_match(match)
  vim.cmd("normal! m'")
  vim.cmd.edit(vim.fn.fnameescape(match.path))
  vim.api.nvim_win_set_cursor(0, { match.line, match.col })
end

local function goto_method_definition_by_grep(method_name)
  local pattern = method_definition_pattern(method_name)
  local matches = grep_method_definitions(pattern)
  if #matches == 0 then
    vim.notify("定義が見つかりませんでした: " .. method_name, vim.log.levels.WARN)
  elseif #matches == 1 then
    jump_to_grep_match(matches[1])
  else
    open_grep_picker("Definitions: " .. method_name, pattern)
  end
end

local function unique_lsp_definitions(results)
  local definitions = {}
  local seen_positions = {}
  for client_id, response in pairs(results) do
    local client = vim.lsp.get_client_by_id(client_id)
    local locations = response.result or {}
    if locations.uri or locations.targetUri then
      locations = { locations }
    end
    for _, location in ipairs(locations) do
      local uri = location.targetUri or location.uri
      local range = location.targetSelectionRange or location.range
      local path = vim.uri_to_fname(uri)
      local position_key = (vim.uv.fs_realpath(path) or path) .. ":" .. range.start.line
      if client and not seen_positions[position_key] then
        seen_positions[position_key] = true
        table.insert(definitions, { location = location, encoding = client.offset_encoding })
      end
    end
  end
  return definitions
end

local function show_lsp_definitions(definitions)
  if #definitions == 1 then
    vim.cmd("normal! m'")
    vim.lsp.util.show_document(definitions[1].location, definitions[1].encoding, { focus = true })
    return
  end

  local items = {}
  for _, definition in ipairs(definitions) do
    vim.list_extend(items, vim.lsp.util.locations_to_items({ definition.location }, definition.encoding))
  end
  vim.fn.setqflist({}, " ", { title = "Definitions", items = items })
  Snacks.picker.qflist()
end

local function goto_definition()
  local word = ruby_word_under_cursor()
  vim.lsp.buf_request_all(0, "textDocument/definition", function(client)
    return vim.lsp.util.make_position_params(0, client.offset_encoding)
  end, function(results)
    local definitions = unique_lsp_definitions(results)
    if #definitions > 0 then
      show_lsp_definitions(definitions)
    elseif is_method_name(word) then
      goto_method_definition_by_grep(word)
    else
      vim.notify("定義が見つかりませんでした: " .. tostring(word), vim.log.levels.WARN)
    end
  end)
end

return {
  {
    "neovim/nvim-lspconfig",
    opts = {
      servers = {
        ["*"] = {
          keys = {
            { "<CR>", vim.lsp.buf.definition, desc = "Goto Definition", has = "definition" },
          },
        },
        ruby_lsp = {
          mason = false,
          keys = {
            { "gr", find_references, desc = "References", nowait = true },
            { "<CR>", goto_definition, desc = "Goto Definition" },
          },
          cmd = function(dispatchers, config)
            return vim.lsp.rpc.start({ "ruby-lsp" }, dispatchers, {
              cwd = config.cmd_cwd or config.root_dir,
            })
          end,
        },
        sorbet = {
          mason = false,
          root_dir = function(bufnr, on_dir)
            local root = vim.fs.root(bufnr, "sorbet")
            if root and vim.uv.fs_stat(root .. "/sorbet/config") then
              on_dir(root)
            end
          end,
          cmd = function(dispatchers, config)
            return vim.lsp.rpc.start({ "bundle", "exec", "srb", "tc", "--lsp" }, dispatchers, {
              cwd = config.cmd_cwd or config.root_dir,
            })
          end,
        },
        rubocop = {
          enabled = false,
        },
      },
    },
  },
  {
    "stevearc/conform.nvim",
    opts = function(_, opts)
      opts.formatters_by_ft.ruby = {}
    end,
  },
}
