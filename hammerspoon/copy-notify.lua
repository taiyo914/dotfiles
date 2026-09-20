-- Cmd+C が押されたら画面に「Copied!」と表示する
--
-- eventtap が勝手に死ぬ問題への対策:
--   1. local ではなくグローバル変数に格納して GC による回収を防ぐ
--   2. hs.application.watcher でアプリ切り替え時に再起動
--   3. hs.caffeinate.watcher でスリープ復帰時に再起動

local DISPLAY_SECONDS = 0.5

-- デバッグ: true にすると Hammerspoon コンソールにログを出す
local DEBUG = false
local CHECK_INTERVAL = 30 -- 生存チェックの間隔（秒）

local log = hs.logger.new("copy-notify", "info")

local function debugLog(msg)
    if DEBUG then log.i(msg) end
end

local function tapStatus()
    return CopyNotify_eventtap:isEnabled() and "alive" or "DEAD"
end

-- グローバル変数に格納して GC を防ぐ
CopyNotify_eventtap = hs.eventtap.new({ hs.eventtap.event.types.keyDown }, function(event)
    local flags = event:getFlags()
    local keyCode = event:getKeyCode()

    if keyCode == 8 and flags:containExactly({ "cmd" }) then
        hs.alert.show("✓ Copied!", DISPLAY_SECONDS)
    end

    return false
end)

CopyNotify_eventtap:start()
debugLog("eventtap started")

local function ensureTapRunning(reason)
    local wasAlive = CopyNotify_eventtap:isEnabled()
    if not wasAlive then
        CopyNotify_eventtap:start()
        debugLog("RECOVERED by " .. reason .. " (was DEAD → restarted)")
    else
        debugLog("checked by " .. reason .. " → alive")
    end
    return not wasAlive -- true なら復旧が必要だった
end

-- アプリ切り替え時に再起動
CopyNotify_appWatcher = hs.application.watcher.new(function(appName, eventType, _)
    if eventType == hs.application.watcher.activated then
        ensureTapRunning("appSwitch(" .. (appName or "?") .. ")")
    end
end)
CopyNotify_appWatcher:start()

-- スリープ復帰時に再起動
CopyNotify_sleepWatcher = hs.caffeinate.watcher.new(function(eventType)
    local names = {
        [hs.caffeinate.watcher.systemDidWake]   = "systemDidWake",
        [hs.caffeinate.watcher.screensDidWake]   = "screensDidWake",
        [hs.caffeinate.watcher.screensDidSleep]  = "screensDidSleep",
        [hs.caffeinate.watcher.systemWillSleep]  = "systemWillSleep",
        [hs.caffeinate.watcher.screensDidLock]   = "screensDidLock",
        [hs.caffeinate.watcher.screensDidUnlock] = "screensDidUnlock",
    }
    local name = names[eventType] or ("unknown(" .. tostring(eventType) .. ")")
    debugLog("caffeinate event: " .. name .. " | tap=" .. tapStatus())

    if eventType == hs.caffeinate.watcher.systemDidWake
        or eventType == hs.caffeinate.watcher.screensDidUnlock then
        hs.timer.doAfter(1, function()
            CopyNotify_eventtap:stop()
            CopyNotify_eventtap:start()
            debugLog("force-restarted after " .. name)
        end)
    end
end)
CopyNotify_sleepWatcher:start()

-- 定期的な生存チェック
CopyNotify_heartbeat = hs.timer.doEvery(CHECK_INTERVAL, function()
    ensureTapRunning("heartbeat")
end)
