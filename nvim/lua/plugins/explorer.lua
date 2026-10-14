return {
  {
    "folke/snacks.nvim",
    opts = {
      picker = {
        sources = {
          explorer = {
            -- . から始まるファイルとフォルダも表示する
            hidden = true,
            -- ファイルツリーの幅（文字数）。snacks.nvim の初期値は 40
            layout = { layout = { width = 25 } },
          },
          files = {
            -- ファイル検索でも . から始まるファイルを検索の対象にする
            hidden = true,
          },
        },
      },
    },
  },
}
