-- アクティブウィンドウにボーダーを表示する
local borderCanvas = nil
local BORDER_WIDTH = 7
local BORDER_COLOR = { red = 1, green = 0, blue = 0, alpha = 1.0 }
local BORDER_RADIUS = 10

local function updateBorder()
  if borderCanvas then
    borderCanvas:delete()
    borderCanvas = nil
  end

  local win = hs.window.focusedWindow()
  if not win then return end

  local f = win:frame()
  local rect = hs.geometry.rect(
    f.x - BORDER_WIDTH,
    f.y - BORDER_WIDTH,
    f.w + BORDER_WIDTH * 2,
    f.h + BORDER_WIDTH * 2
  )

  borderCanvas = hs.canvas.new(rect)
  borderCanvas:appendElements({
    type = "rectangle",
    action = "stroke",
    strokeColor = BORDER_COLOR,
    strokeWidth = BORDER_WIDTH,
    roundedRectRadii = { xRadius = BORDER_RADIUS, yRadius = BORDER_RADIUS },
  })
  borderCanvas:level(hs.canvas.windowLevels.overlay)
  borderCanvas:clickActivating(false)
  borderCanvas:behavior(hs.canvas.windowBehaviors.canJoinAllSpaces)
  borderCanvas:show()
end

local wf = hs.window.filter.default
wf:subscribe({
  hs.window.filter.windowFocused,
  hs.window.filter.windowMoved,
  hs.window.filter.windowResized,
}, updateBorder)
