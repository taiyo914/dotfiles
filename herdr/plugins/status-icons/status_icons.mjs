// herdr のサイドバーに、エージェントの状態ごとに違うアイコンを出す。
//
// herdr のプラグインはサイドバーに直接文字を書けない。そのため、このスクリプトが
// 各ペインとスペースに「$icon_working」などのトークンとして「アイコン ワークスペース名」の文字を送り、
// config.toml のサイドバーの行の設定でそのトークンを表示する。
// 今の状態のトークンだけに文字が入るので、config.toml で状態ごとに色を変えられる。
// herdr は別々のトークンの間に必ず「 · 」を入れるので、アイコンとワークスペース名を1つのトークンにまとめている。
//
// Node.js に最初から入っている機能だけを使うので、npm install はいらない。
// herdr-icons (https://github.com/dzhiganov/herdr-icons) の minimal セットを参考にした。

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

// 状態ごとのアイコンのコマと、1秒あたりに切り替えるコマの数（0 なら動かない）
// herdr は空の文字のトークンを消してしまうので、点滅で消えているコマには見えない点字の文字を使う
const INVISIBLE = "⠀";
const ICONS = {
  working: { fps: 10, frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] },
  blocked: { fps: 2, frames: ["!", "!", "!", INVISIBLE] },
  done: { fps: 0, frames: ["✓"] },
  idle: { fps: 0, frames: ["○"] },
  unknown: { fps: 0, frames: ["›"] },
};

// herdr とのやりとりの間隔と、トークンが自動で消えるまでの時間
// このスクリプトが止まったら、TTL_MS がたつとアイコンが消える。止まったアイコンが残り続けないようにするため
const SOURCE = "user:dotfiles.status-icons";
const POLL_MS = 500;
const ANIMATION_TICK_MS = 100;
const TTL_MS = 15_000;
const RESEND_MS = 5_000;
const GIVE_UP_MS = 30_000;
const SCRIPT_NAME = "status_icons.mjs";

// herdr のソケット API を呼ぶ
class HerdrApiError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

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
      conn.write(`${JSON.stringify({ id: "status-icons", method, params })}\n`);
    });
    conn.on("data", (chunk) => {
      response += chunk;
      const end = response.indexOf("\n");
      if (end < 0) return;
      conn.destroy();
      try {
        const message = JSON.parse(response.slice(0, end));
        if (message.error) {
          reject(new HerdrApiError(message.error.code ?? "error", message.error.message ?? ""));
        } else {
          resolve(message.result);
        }
      } catch (error) {
        reject(error);
      }
    });
    conn.on("error", reject);
    conn.on("close", () => reject(new Error(`${method}: herdr closed the connection`)));
  });
}

// worktree のスペースで、今 checkout しているブランチ名を調べる
// herdr のサイドバーは worktree の行にブランチ名を出さないので、このスクリプトが $worktree_branch として送る
// 0.5 秒ごとに調べるので、git コマンドを起動せずに HEAD のファイルを直接読む
function linkedWorktreeBranch(workspace) {
  const worktree = workspace.worktree;
  if (!worktree?.is_linked_worktree) return null;
  try {
    const gitDir = readFileSync(join(worktree.checkout_path, ".git"), "utf8").match(/^gitdir: (.+)$/m)?.[1];
    if (!gitDir) return null;
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    return head.match(/^ref: refs\/heads\/(.+)$/)?.[1] ?? head.slice(0, 7);
  } catch {
    return null;
  }
}

// 各ペインとスペースで、サイドバーに出す状態を調べる
function shownState(item) {
  const state = item.agent_status;
  // herdr のサイドバーは、見ているペインの「回答完了」を「確認済み」として表示する
  if (state === "done" && item.focused) return "idle";
  return state in ICONS ? state : "unknown";
}

async function currentTargets() {
  const [agentList, workspaceList] = await Promise.all([
    callHerdr("agent.list", {}),
    callHerdr("workspace.list", {}),
  ]);
  const workspaces = workspaceList.workspaces ?? [];
  const labels = new Map(workspaces.map((w) => [w.workspace_id, w.label ?? ""]));
  const targets = new Map();
  for (const agent of agentList.agents ?? []) {
    targets.set(`pane ${agent.pane_id}`, {
      kind: "pane",
      id: agent.pane_id,
      state: shownState(agent),
      label: labels.get(agent.workspace_id) ?? "",
    });
  }
  for (const workspace of workspaces) {
    targets.set(`workspace ${workspace.workspace_id}`, {
      kind: "workspace",
      id: workspace.workspace_id,
      state: shownState(workspace),
      label: workspace.label ?? "",
      branch: linkedWorktreeBranch(workspace),
    });
  }
  return targets;
}

// 状態の変化とアニメーションのコマに合わせて、トークンを herdr に送る
function tokenName(state) {
  return `icon_${state}`;
}

function frameAt(state, nowMs) {
  const { fps, frames } = ICONS[state];
  if (fps === 0) return frames[0];
  return frames[Math.floor((nowMs / 1000) * fps) % frames.length];
}

const BRANCH_TOKEN = "worktree_branch";

function clearedTokens() {
  return {
    ...Object.fromEntries(Object.keys(ICONS).map((state) => [tokenName(state), null])),
    [BRANCH_TOKEN]: null,
  };
}

class IconReporter {
  sent = new Map();

  get animating() {
    return [...this.sent.values()].some(({ state }) => ICONS[state].fps > 0);
  }

  async update(targets, nowMs) {
    for (const [key, target] of targets) {
      await this.updateTarget(key, target, nowMs);
    }
    for (const [key, previous] of this.sent) {
      if (targets.has(key)) continue;
      await this.send(key, previous, clearedTokens());
      this.sent.delete(key);
    }
  }

  async updateTarget(key, target, nowMs) {
    const text = `${frameAt(target.state, nowMs)} ${target.label}`;
    const previous = this.sent.get(key);
    let tokens;
    if (!previous) {
      tokens = clearedTokens();
    } else if (previous.state !== target.state) {
      tokens = { [tokenName(previous.state)]: null };
    } else if (
      previous.text === text &&
      previous.branch === target.branch &&
      nowMs - previous.sentAt < RESEND_MS
    ) {
      return;
    } else {
      tokens = {};
    }
    tokens[tokenName(target.state)] = text;
    // TTL はトークンごとに数えられるので、アイコンを送るたびにブランチ名も一緒に送り直す
    if (target.kind === "workspace") tokens[BRANCH_TOKEN] = target.branch;
    if (await this.send(key, target, tokens)) {
      this.sent.set(key, {
        kind: target.kind,
        id: target.id,
        state: target.state,
        text,
        branch: target.branch,
        sentAt: nowMs,
      });
    }
  }

  async clearAll() {
    for (const [key, previous] of this.sent) {
      await this.send(key, previous, clearedTokens());
    }
    this.sent.clear();
  }

  forgetAll() {
    this.sent.clear();
  }

  async send(key, { kind, id }, tokens) {
    // seq は付けない。付けると、前に別のプロセスが大きい seq で送っていたときに、herdr がこの報告を黙って捨ててしまう
    // 1つずつ順番に送るので、送った順番が入れ替わることはなく、seq がなくても困らない
    const params = { source: SOURCE, tokens, ttl_ms: TTL_MS, [`${kind}_id`]: id };
    try {
      await callHerdr(`${kind}.report_metadata`, params);
      return true;
    } catch (error) {
      if (!(error instanceof HerdrApiError)) throw error;
      // 状態を調べてから送るまでの間にペインやスペースが閉じられたときに起きる
      this.sent.delete(key);
      return false;
    }
  }
}

// 同じ herdr に対してこのスクリプトが2つ動かないように、動いているスクリプトのプロセス ID をファイルに書いておく
// replace が true なら、動いているほうを止めて入れ替わる
function lockPath() {
  const stateDir =
    process.env.HERDR_PLUGIN_STATE_DIR || join(homedir(), ".local", "state", "herdr-status-icons");
  mkdirSync(stateDir, { recursive: true });
  const socketId = createHash("sha1").update(socketPath()).digest("hex").slice(0, 12);
  return join(stateDir, `status-icons-${socketId}.pid`);
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

// herdr が止まるまで、状態を調べてアイコンを送り続ける
async function main() {
  const lock = await takeLock(process.argv.includes("--replace"));
  if (lock === null) return;

  let stopping = false;
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
    process.on(signal, () => {
      stopping = true;
    });
  }

  const reporter = new IconReporter();
  let targets = new Map();
  let polledAt = 0;
  let lastContact = Date.now();
  try {
    while (!stopping) {
      const now = Date.now();
      try {
        if (now - polledAt >= POLL_MS) {
          polledAt = now;
          targets = await currentTargets();
        }
        await reporter.update(targets, now);
        lastContact = now;
      } catch {
        // herdr が再起動するとトークンが消えるので、つながり直したら全部送り直す
        reporter.forgetAll();
        if (now - lastContact > GIVE_UP_MS) return;
      }
      const interval = reporter.animating ? ANIMATION_TICK_MS : POLL_MS;
      await sleep(Math.max(0, interval - (Date.now() - now)));
    }
  } finally {
    await reporter.clearAll().catch(() => {});
    releaseLock(lock);
  }
}

await main();
