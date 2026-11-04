local CHROME_BUNDLE_ID = "com.google.Chrome"
local NEW_WINDOW_CHECK_INTERVAL_SECONDS = 0.05
local NEW_WINDOW_MAX_CHECKS = 40

local newWindowWatcher = nil

local function placeSideBySide(leftWindow, rightWindow)
  local screenFrame = leftWindow:screen():frame()
  local halfWidth = screenFrame.w / 2
  leftWindow:setFrame({ x = screenFrame.x, y = screenFrame.y, w = halfWidth, h = screenFrame.h }, 0)
  rightWindow:setFrame({ x = screenFrame.x + halfWidth, y = screenFrame.y, w = halfWidth, h = screenFrame.h }, 0)
end

local function waitForNewWindow(app, originalWindow, onNewWindowFocused)
  if newWindowWatcher then newWindowWatcher:stop() end

  local checkCount = 0
  newWindowWatcher = hs.timer.doEvery(NEW_WINDOW_CHECK_INTERVAL_SECONDS, function()
    checkCount = checkCount + 1
    local focusedWindow = app:focusedWindow()
    if focusedWindow and focusedWindow:id() ~= originalWindow:id() then
      newWindowWatcher:stop()
      onNewWindowFocused(focusedWindow)
    elseif checkCount >= NEW_WINDOW_MAX_CHECKS then
      newWindowWatcher:stop()
    end
  end)
end

-- Raycast の Script Command から `hs -c` で呼び出すので、グローバル関数にしている
function splitChromeWindow()
  local app = hs.application.frontmostApplication()
  if app:bundleID() ~= CHROME_BUNDLE_ID then return end

  local originalWindow = app:focusedWindow()
  if not originalWindow then return end

  hs.eventtap.keyStroke({ "cmd" }, "n", 0, app)
  waitForNewWindow(app, originalWindow, function(newWindow)
    placeSideBySide(originalWindow, newWindow)
  end)
end

-- control + option + s で、Chrome の新しいウィンドウを開いて左右半分ずつに並べる
chromeSplitHotkey = hs.hotkey.bind({ "alt", "ctrl" }, "S", splitChromeWindow)
