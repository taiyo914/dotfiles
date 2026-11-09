-- Ghostty で、クリップボードに画像だけが入っているときに cmd + v を押すと、ctrl + v を送る
-- Claude Code は ctrl + v でしか画像を貼れないため

local GHOSTTY_BUNDLE_ID = "com.mitchellh.ghostty"
local V_KEY_CODE = hs.keycodes.map["v"]

local function isGhosttyFrontmost()
    local app = hs.application.frontmostApplication()
    return app ~= nil and app:bundleID() == GHOSTTY_BUNDLE_ID
end

-- 文字が入っているときは、今までどおり cmd + v で文字を貼るために除外する
local function clipboardHasOnlyImage()
    return hs.pasteboard.readImage() ~= nil and hs.pasteboard.readString() == nil
end

-- cmd + v を ctrl + v に置き換える
-- local ではなくグローバル変数にして、Hammerspoon が eventtap を片付けて止めてしまうのを防ぐ
ImagePaste_eventtap = hs.eventtap.new({ hs.eventtap.event.types.keyDown }, function(event)
    local isCmdV = event:getKeyCode() == V_KEY_CODE and event:getFlags():containExactly({ "cmd" })
    if not (isCmdV and isGhosttyFrontmost() and clipboardHasOnlyImage()) then
        return false
    end

    return true, {
        hs.eventtap.event.newKeyEvent({ "ctrl" }, "v", true),
        hs.eventtap.event.newKeyEvent({ "ctrl" }, "v", false),
    }
end)
ImagePaste_eventtap:start()

-- eventtap はスリープ復帰などで止まることがあるので、止まっていたら動かし直す
ImagePaste_heartbeat = hs.timer.doEvery(30, function()
    if not ImagePaste_eventtap:isEnabled() then
        ImagePaste_eventtap:start()
    end
end)
