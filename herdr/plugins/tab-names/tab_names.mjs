// タブの名前を、タブの中のペインで動いているプログラムから自動で付ける。
//
// ペインごとに、claude が動いていれば claude、nvim なら nvim、それ以外は term と呼ぶ。
// 1つのタブにペインが複数あるときは、同じ呼び名をまとめて「claude|term*2」のように並べる。
// 自分で付けた名前を書き換えないように、herdr が最初に付ける数字だけの名前と、このスクリプトが付けた形の名前のタブだけを書き換える。
//
// Node.js に最初から入っている機能だけを使うので、npm install はいらない。

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

// 1秒ごとに調べる。herdr と GIVE_UP_MS の間つながらなければ、herdr が止まったとみなしてスクリプトも止まる
const POLL_MS = 1_000;
const GIVE_UP_MS = 30_000;
const SCRIPT_NAME = "tab_names.mjs";

// 動いているプログラムの名前と、タブの名前に使う呼び名の対応。ここにないプログラムは term になる
const PROGRAM_NAMES = { claude: "claude", nvim: "nvim" };
const OTHER_NAME = "term";

// herdr のソケット API を呼ぶ
function socketPath() {
  if (process.env.HERDR_SOCKET_PATH) return process.env.HERDR_SOCKET_PATH;
  const configDir = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  const session = process.env.HERDR_SESSION;
  if (session) return join(configDir, "herdr", "sessions", session, "herdr.sock");
  return join(configDir, "herdr", "herdr.sock");
}

function callHerdr(method, params) {
  return new Promise((resolve, reject) => {
    const conn = createConnection(socketPath());
    let response = "";
    conn.setEncoding("utf8");
    conn.setTimeout(5_000, () => conn.destroy(new Error(`${method}: herdr did not answer`)));
    conn.on("connect", () => {
      conn.write(`${JSON.stringify({ id: "tab-names", method, params })}\n`);
    });
    conn.on("data", (chunk) => {
      response += chunk;
      const end = response.indexOf("\n");
      if (end < 0) return;
      conn.destroy();
      try {
        const message = JSON.parse(response.slice(0, end));
        if (message.error) reject(new Error(`${method}: ${message.error.message ?? ""}`));
        else resolve(message.result);
      } catch (error) {
        reject(error);
      }
    });
    conn.on("error", reject);
    conn.on("close", () => reject(new Error(`${method}: herdr closed the connection`)));
  });
}

// ペインで動いているプログラムから、そのペインの呼び名を決める
// claude はプロセスの名前がバージョン番号になっているので、起動したときのコマンド名（argv0）で見分ける
async function paneName(paneId) {
  let info;
  try {
    info = (await callHerdr("pane.process_info", { pane_id: paneId })).process_info;
  } catch {
    return OTHER_NAME;
  }
  const programs = (info?.foreground_processes ?? []).map((p) => basename(p.argv0 ?? p.name ?? ""));
  for (const [program, name] of Object.entries(PROGRAM_NAMES)) {
    if (programs.includes(program)) return name;
  }
  return OTHER_NAME;
}

// ペインの呼び名を、最初に出てきた順にまとめて「claude|term*2」の形にする
function tabLabel(names) {
  const counts = new Map();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].map(([name, count]) => (count > 1 ? `${name}*${count}` : name)).join("|");
}

// 自動で書き換えてよい名前か調べる。数字だけの名前か、tabLabel が作る形の名前なら書き換える
const KNOWN_NAMES = [...Object.values(PROGRAM_NAMES), OTHER_NAME].join("|");
const AUTO_LABEL = new RegExp(`^(\\d+|(${KNOWN_NAMES})(\\*\\d+)?(\\|(${KNOWN_NAMES})(\\*\\d+)?)*)$`);

// 全部のタブを調べて、名前が変わるタブだけ付け直す
async function renameTabs() {
  const [tabList, paneList] = await Promise.all([
    callHerdr("tab.list", {}),
    callHerdr("pane.list", {}),
  ]);
  for (const tab of tabList.tabs ?? []) {
    if (!AUTO_LABEL.test(tab.label ?? "")) continue;
    const panes = (paneList.panes ?? []).filter((pane) => pane.tab_id === tab.tab_id);
    if (panes.length === 0) continue;
    const label = tabLabel(await Promise.all(panes.map((pane) => paneName(pane.pane_id))));
    if (label === tab.label) continue;
    // 調べてから付け直すまでの間にタブが閉じられると失敗するが、次に調べるときにはもうないので気にしない
    await callHerdr("tab.rename", { tab_id: tab.tab_id, label }).catch(() => {});
  }
}

// 同じ herdr に対してこのスクリプトが2つ動かないように、動いているスクリプトのプロセス ID をファイルに書いておく
// replace が true なら、動いているほうを止めて入れ替わる
function lockPath() {
  const stateDir =
    process.env.HERDR_PLUGIN_STATE_DIR || join(homedir(), ".local", "state", "herdr-tab-names");
  mkdirSync(stateDir, { recursive: true });
  const socketId = createHash("sha1").update(socketPath()).digest("hex").slice(0, 12);
  return join(stateDir, `tab-names-${socketId}.pid`);
}

function runningInstancePid(path) {
  let pid;
  try {
    pid = Number.parseInt(readFileSync(path, "utf8"), 10);
  } catch {
    return null;
  }
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return null;
  // 前のスクリプトが落ちたあと、同じプロセス ID を別のプログラムが使っていることがあるので、コマンド名も確かめる
  try {
    const command = execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
    return command.includes(SCRIPT_NAME) ? pid : null;
  } catch {
    return null;
  }
}

async function takeLock(replace) {
  const path = lockPath();
  let stopRequested = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const fd = openSync(path, "wx");
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return path;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const pid = runningInstancePid(path);
    if (pid === null) {
      rmSync(path, { force: true });
      continue;
    }
    if (!replace) return null;
    if (!stopRequested) {
      process.kill(pid, "SIGTERM");
      stopRequested = true;
    }
    await sleep(100);
  }
  return null;
}

function releaseLock(path) {
  try {
    if (readFileSync(path, "utf8").trim() === String(process.pid)) rmSync(path);
  } catch {
    // もう消えている
  }
}

// herdr が止まるまで、タブの名前を付け直し続ける
async function main() {
  const lock = await takeLock(process.argv.includes("--replace"));
  if (lock === null) return;

  let stopping = false;
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
    process.on(signal, () => {
      stopping = true;
    });
  }

  let lastContact = Date.now();
  try {
    while (!stopping) {
      const now = Date.now();
      try {
        await renameTabs();
        lastContact = now;
      } catch {
        if (now - lastContact > GIVE_UP_MS) return;
      }
      await sleep(Math.max(0, POLL_MS - (Date.now() - now)));
    }
  } finally {
    releaseLock(lock);
  }
}

await main();
