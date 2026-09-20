vim.cmd("set expandtab")
vim.cmd("set tabstop=2")
vim.cmd("set softtabstop=2")
vim.cmd("set shiftwidth=2")
vim.g.mapleader= " "

local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not (vim.uv or vim.loop).fs_stat(lazypath) then
  vim.fn.system({
    "git",
    "clone",
    "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable", -- latest stable release
    lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

require("lazy").setup("plugins") 

-- catppuccin config
require("catppuccin").setup()
vim.cmd.colorscheme "catppuccin"

-- telescope config
local builtin = require('telescope.builtin')
vim.keymap.set('n', '<leader><leader>', builtin.find_files, {})
vim.keymap.set('n', '<leader>fg', builtin.live_grep, {})
vim.keymap.set('n', '<leader>fb', builtin.buffers, {})

-- treesitter config
require('nvim-treesitter').install  {
  "lua", "javascript", "ruby", "typescript", "yaml", "toml",
  "json", "html", "scss", "bash", "dockerfile", "markdown",
}

-- treesitter highlighting
vim.api.nvim_create_autocmd('FileType', {
  pattern = { 'lua', 'javascript', 'ruby', 'typescript', 'yaml', 'toml', 'json', 'html', 'scss', 'bash', 'dockerfile', 'markdown' },
  callback = function() vim.treesitter.start() end,
})

-- treesitter indentation
vim.bo.indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"

-- ヤンクでクリップボードに保存する設定
vim.opt.clipboard = "unnamedplus"

-- keymap for Neotree
vim.keymap.set('n', '<C-n>', ':Neotree filesystem reveal float<CR>')

