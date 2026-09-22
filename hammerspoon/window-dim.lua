-- フォーカスされていない領域を暗くする
-- 画面全体を半透明の黒で覆い、アクティブウィンドウの部分だけを切り抜く
local DIM_COLOR = { red = 0, green = 0, blue = 0, alpha = 0.35 }
local CORNER_RADIUS = 10

local overlays = {}
local enabled = false

local function destroyOverlays()
  for _, overlay in ipairs(overlays) do
    overlay.canvas:delete()
  end
  overlays = {}
end

local function buildOverlays()
  destroyOverlays()

  for _, screen in ipairs(hs.screen.allScreens()) do
    local frame = screen:frame()
    local canvas = hs.canvas.new(frame)

    canvas:appendElements({
      -- 画面全体を覆う暗幕
      type = "rectangle",
      action = "fill",
      fillColor = DIM_COLOR,
      frame = { x = 0, y = 0, w = frame.w, h = frame.h },
    }, {
      -- アクティブウィンドウの部分をくり抜く
      type = "rectangle",
      action = "fill",
      fillColor = { alpha = 1 },
      compositeRule = "clear",
      roundedRectRadii = { xRadius = CORNER_RADIUS, yRadius = CORNER_RADIUS },
      frame = { x = 0, y = 0, w = 0, h = 0 },
    })

    canvas:level(hs.canvas.windowLevels.overlay)
    canvas:clickActivating(false)
    canvas:behavior({
      hs.canvas.windowBehaviors.canJoinAllSpaces,
      hs.canvas.windowBehaviors.stationary,
    })

    table.insert(overlays, { canvas = canvas, frame = frame })
  end
end

local function updateDim()
  if not enabled then return end
  if #overlays == 0 then buildOverlays() end

  local win = hs.window.focusedWindow()
  local wf = win and win:frame()

  for _, overlay in ipairs(overlays) do
    local sf = overlay.frame
    local hole = { x = 0, y = 0, w = 0, h = 0 }

    if wf then
      -- ウィンドウ座標をキャンバス（＝スクリーン）ローカル座標に変換する
      hole = { x = wf.x - sf.x, y = wf.y - sf.y, w = wf.w, h = wf.h }
    end

    overlay.canvas[2].frame = hole
    overlay.canvas:show()
  end
end

local function rebuild()
  if not enabled then return end
  buildOverlays()
  updateDim()
end

local wfilter = hs.window.filter.default
wfilter:subscribe({
  hs.window.filter.windowFocused,
  hs.window.filter.windowUnfocused,
  hs.window.filter.windowMoved,
  hs.window.filter.windowCreated,
  hs.window.filter.windowDestroyed,
  hs.window.filter.windowMinimized,
  hs.window.filter.windowUnminimized,
  hs.window.filter.windowFullscreened,
  hs.window.filter.windowUnfullscreened,
}, updateDim)

-- モニタ構成が変わったらキャンバスを作り直す
screenWatcher = hs.screen.watcher.new(rebuild)
screenWatcher:start()

-- Space の切り替えでもフォーカスウィンドウが変わる
spacesWatcher = hs.spaces.watcher.new(updateDim)
spacesWatcher:start()

rebuild()

-- 画面共有などで一時的に無効化する（Cmd + Option + Ctrl + D）
dimToggleHotkey = hs.hotkey.bind({ "cmd", "alt", "ctrl" }, "D", function()
  enabled = not enabled
  if enabled then
    rebuild()
    hs.alert.show("Window dim: ON")
  else
    destroyOverlays()
    hs.alert.show("Window dim: OFF")
  end
end)
