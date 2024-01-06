local function isRunning(app)
    local app = hs.appfinder.appFromName(app)
    -- hs.alert.show(app)
    return app ~= nil and app:isRunning()
end

local function hasInstance(n)
    -- hs.alert.show(n)
    local app = hs.appfinder.appFromName(n)
    if app == nil then return false end

    if n == 'Finder' then return #app:allWindows() > 1 end
    -- hs.alert.show(#app:allWindows())
    return #app:allWindows() >= 1
end

local function createInstance(app)
    if app == 'iTerm2' then
        hs.appfinder.appFromName(app):selectMenuItem(
            { 'Shell', 'New Window' }
        )
    elseif app == 'Safari' then
        hs.appfinder.appFromName(app):selectMenuItem(
            { 'File', 'New Window' }
        )
    elseif app == 'Finder' then
        hs.appfinder.appFromName(app):selectMenuItem(
            { 'File', 'New Finder Window' }
        )
    elseif app == 'Skim' then
        hs.appfinder.appFromName(app):selectMenuItem( { 'File', 'Open...' }
        )
    elseif app == 'Typora' then
        hs.appfinder.appFromName(app):selectMenuItem(
            { 'File', 'New' }
        )
    elseif app == 'Microsoft Edge' then
        hs.appfinder.appFromName(app):selectMenuItem(
            { 'File', 'New Window' }
        )
    elseif app == 'Visual Studio Code' then
        hs.appfinder.appFromName(app):selectMenuItem(
            'File', 'New Window'
        )
    elseif app == 'Visual Studio Code - Insiders' then
        hs.appfinder.appFromName(app):selectMenuItem(
            'File', 'New Window'
        )
    elseif app == 'Alacritty' then
        hs.execute('open -n /Applications/Alacritty.app')
    end
end

local function focus(app)
    local win = hs.appfinder.appFromName(app):allWindows()[1]
    if win:isMinimized() then
        win:unminimize()
    end
    win:focus()
end

local function wm(app)
    -- if app is not running, launch it
    if not isRunning(app) then
        -- hs.alert.show('DEBUG: not running')
        hs.application.launchOrFocus(app)
        return
    end

    -- if app has no instance, create one
    if not hasInstance(app) then
        -- hs.alert.show('DEBUG: has no instance')
        createInstance(app)
        focus(app)
        return
    end

    -- if app has instance, focus it
    -- hs.alert.show('DEBUG: has instance')
    focus(app)
end

hs.urlevent.bind('wm', function(eventName, params)
    if params.app == 'Screenshot' then
        hs.application.launchOrFocus('Screenshot')
    end
    wm(params.app)
end)

hs.hotkey.bind({ 'cmd' }, 'e', function()
    hs.window.focusedWindow():minimize()
    hs.window.frontmostWindow():focus()
end)

hs.hotkey.bind({ 'cmd' }, 'escape', function()
    -- focus("Chromium");
    hs.eventtap.keyStroke({ 'cmd' }, "8");
end)
