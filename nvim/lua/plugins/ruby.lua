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
          cmd = function(dispatchers, config)
            return vim.lsp.rpc.start({ "ruby-lsp" }, dispatchers, {
              cwd = config.cmd_cwd or config.root_dir,
              -- Sorbet の LSP は使わず、常に ruby-lsp を使用する設定
              env = { RUBY_LSP_BYPASS_TYPECHECKER = "1" },
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
