const obsidian = require("obsidian");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const WORKSPACE_FILE = "dotfiles-vault.code-workspace";

class OpenVscodeWorkspacePlugin extends obsidian.Plugin {
  async onload() {
    this.addCommand({
      id: "open-dotfiles-vault-workspace",
      name: "Open dotfiles + vault workspace in VS Code",
      callback: () => this.openWorkspace(),
    });
  }

  openWorkspace() {
    const linkedPath = path.join(
      this.app.vault.adapter.getBasePath(),
      this.manifest.dir,
      WORKSPACE_FILE,
    );

    // プラグインのフォルダは vault からシンボリックリンクでつないでいる。
    // ワークスペース内の相対パスは dotfiles 側の実際の場所から数えて書いているので、
    // リンクをたどった先の実際のパスで開く
    const realPath = fs.realpathSync(linkedPath);

    execFile("open", ["-a", "Visual Studio Code", realPath], (error) => {
      if (error) new obsidian.Notice(`VS Code を開けませんでした: ${error.message}`);
    });
  }
}

module.exports = OpenVscodeWorkspacePlugin;
