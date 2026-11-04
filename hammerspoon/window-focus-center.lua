-- 画面に対するウィンドウの幅と高さの割合（27インチを 60cm 離れて見たときに、首を動かさずに見られる大きさ）
local FOCUS_WIDTH_RATIO = 0.75
local FOCUS_HEIGHT_RATIO = 0.9
-- 重ねたウィンドウを右下へずらす量（ポイント）。後ろのウィンドウのタイトルバーが見えて、クリックで選べる幅にする
local CASCADE_STEP = 30
-- この差より大きくサイズが変わったウィンドウは、手で動かしたとみなして並べ直しの対象から外す
local SIZE_TOLERANCE = 2

local placedWindowIds = {}

local function focusSize(screenFrame)
  return screenFrame.w * FOCUS_WIDTH_RATIO, screenFrame.h * FOCUS_HEIGHT_RATIO
end

local function rememberAsNewest(window)
  for index, id in ipairs(placedWindowIds) do
    if id == window:id() then
      table.remove(placedWindowIds, index)
      break
    end
  end
  table.insert(placedWindowIds, window:id())
end

local function hasFocusSize(window, width, height)
  local size = window:size()
  return math.abs(size.w - width) <= SIZE_TOLERANCE and math.abs(size.h - height) <= SIZE_TOLERANCE
end

local function forgetChangedWindows(width, height, focusedWindow)
  local keptIds = {}
  for _, id in ipairs(placedWindowIds) do
    local window = hs.window.get(id)
    if window and (window == focusedWindow or hasFocusSize(window, width, height)) then
      table.insert(keptIds, id)
    end
  end
  placedWindowIds = keptIds
end

local function placedWindowsOn(screen)
  local windows = {}
  for _, id in ipairs(placedWindowIds) do
    local window = hs.window.get(id)
    if window and window:screen():id() == screen:id() then
      table.insert(windows, window)
    end
  end
  return windows
end

local function cascadeStep(screenFrame, width, height, windowCount)
  if windowCount < 2 then return 0 end
  local maxStep = math.min(screenFrame.w - width, screenFrame.h - height) / (windowCount - 1)
  return math.min(CASCADE_STEP, maxStep)
end

local function placeCascaded(windows, screenFrame, width, height)
  local step = cascadeStep(screenFrame, width, height, #windows)
  local firstOffset = -step * (#windows - 1) / 2
  for index, window in ipairs(windows) do
    local offset = firstOffset + step * (index - 1)
    window:setFrame({
      x = screenFrame.x + (screenFrame.w - width) / 2 + offset,
      y = screenFrame.y + (screenFrame.h - height) / 2 + offset,
      w = width,
      h = height,
    }, 0)
  end
end

-- Raycast の Script Command から `hs -c` で呼び出すので、グローバル関数にしている
function moveFocusedWindowToCenter()
  local focusedWindow = hs.window.focusedWindow()
  if not focusedWindow then return end

  local screen = focusedWindow:screen()
  local width, height = focusSize(screen:frame())
  forgetChangedWindows(width, height, focusedWindow)
  rememberAsNewest(focusedWindow)
  placeCascaded(placedWindowsOn(screen), screen:frame(), width, height)
end

-- control + option + c で、手前のウィンドウを中央に置いて斜めに重ねる
focusCenterHotkey = hs.hotkey.bind({ "alt", "ctrl" }, "C", moveFocusedWindowToCenter)
