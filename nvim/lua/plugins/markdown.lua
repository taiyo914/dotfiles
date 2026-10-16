return {
  {
    "mfussenegger/nvim-lint",
    optional = true,
    opts = {
      linters = {
        -- nvim の設定ディレクトリにある markdownlint-cli2 の設定ファイルを使う
        ["markdownlint-cli2"] = {
          args = { "--config", vim.fn.stdpath("config") .. "/.markdownlint-cli2.yaml", "--" },
        },
      },
    },
  },
}
