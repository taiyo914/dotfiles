return {
  {
    "folke/snacks.nvim",
    opts = {
      picker = {
        sources = {
          explorer = {
            -- ファイルツリーの幅（文字数）。snacks.nvim の初期値は 40
            layout = { layout = { width = 25 } },
          },
        },
      },
    },
  },
}
