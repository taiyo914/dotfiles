-- カーソル行を最後に変更したコミットの作者、日時、メッセージを行末に表示する
return {
  "lewis6991/gitsigns.nvim",
  opts = {
    current_line_blame = true,
    current_line_blame_opts = {
      delay = 300,
    },
  },
}
