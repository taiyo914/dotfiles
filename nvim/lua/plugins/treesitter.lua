return {
  'nvim-treesitter/nvim-treesitter',
  lazy = false,
  build = ':TSUpdate',
  config = function()
    require('nvim-treesitter').install {
      "lua", "javascript", "ruby", "typescript",
      "yaml", "toml", "json", "html", "scss",
      "bash", "dockerfile", "markdown",
    }

    vim.api.nvim_create_autocmd('FileType', {
      pattern = {
        'lua', 'javascript', 'ruby', 'typescript',
        'yaml', 'toml', 'json', 'html', 'scss',
        'bash', 'dockerfile', 'markdown',
      },
      callback = function() vim.treesitter.start() end,
    })
  end,
}
