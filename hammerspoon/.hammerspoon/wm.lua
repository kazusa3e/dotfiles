local function findWindows(appName)
    local currScreen = hs.screen.primaryScreen()
    local visible_win_filter = hs.window.filter.new(false)
    local unvisible_win_filter = hs.window.filter.new(false)

    visible_win_filter:setAppFilter(appName, {
        visible = true,
        currentSpace = true,
        allowScreens = currScreen:getUUID()
    })

    unvisible_win_filter:setAppFilter(appName, {
        visible = false,
        currentSpace = true,
        allowScreens = currScreen:getUUID()
    })


    return {
        visible = visible_win_filter:getWindows(),
        unvisible = unvisible_win_filter:getWindows()
    }
end

local function isRunning(appName)
    return hs.application.get(appName) ~= nil
end

local function createWindow(appName)
    if appName == "iTerm2" then
        hs.appfinder.appFromName(appName):selectMenuItem(
            { 'Shell', 'New Window' }
        )
    elseif appName == "Code" then
        hs.appfinder.appFromName(appName):selectMenuItem(
            { 'File', 'New Window' }
        )
    elseif appName == "Microsoft Edge" then
        hs.appfinder.appFromName(appName):selectMenuItem(
            { 'File', 'New Window' }
        )
    elseif appName == "Finder" then
        hs.appfinder.appFromName(appName):selectMenuItem(
            { 'File', 'New Finder Window' }
        )
    else
        hs.alert.show("Not support create window for " .. appName)
    end
end

local function wm(appName)
    -- if not isRunning(appName) then
    -- end
    local windows = findWindows(appName)
    if #windows.visible == 0 and #windows.unvisible == 0 then
        createWindow(appName)
    elseif #windows.visible == 0 and #windows.unvisible > 0 then
        local win = windows.unvisible[1]
        win:unminimize()
        win:focus()
    elseif #windows.visible > 0 then
        local win = windows.visible[1]
        win:focus()
    end
end

local function focus(appName)
    local win = hs.appfinder.appFromName(appName):allWindows()[1]
    win:focus();
end

hs.urlevent.bind('wm', function(eventName, params)
    if params.app == 'Screenshot' then
        hs.application.launchOrFocus('Screenshot')
    else
        wm(params.app)
    end
end)

hs.hotkey.bind({ 'cmd' }, 'e', function()
    hs.window.focusedWindow():minimize()
    hs.window.focusedWindow():focus()
end)

hs.hotkey.bind({ 'cmd' }, 'escape', function()
    -- focus('Chromium');
    focus('Mail');
    hs.eventtap.keyStroke({ 'cmd' }, '8')
end)

-- print("count of iterm2 in current space: visible: " .. #findWindows("iTerm2").visible .. " unvisible: " .. #findWindows("iTerm2").unvisible)
-- print("count of Code in current space: visible: " .. #findWindows("Code").visible .. " unvisible: " .. #findWindows("Code").unvisible)
-- print("count of Terminal in current space: visible: " .. #findWindows("Terminal").visible .. " unvisible: " .. #findWindows("Terminal").unvisible)
-- print("count of Finder in current space: visible: " .. #findWindows("Finder").visible .. " unvisible: " .. #findWindows("Finder").unvisible)

-- print("isRunning iTerm2: " .. tostring(isRunning("iTerm2")))
-- print("isRunning Code: " .. tostring(isRunning("Code")))
-- print("isRunning Terminal: " .. tostring(isRunning("Terminal")))
-- print("isRunning Finder: " .. tostring(isRunning("Finder")))

-- print("count of iterm2 in current space: " .. instanceCount("iTerm2"))
-- print("count of vscode in current space: " .. instanceCount("Code"))
-- print("count of chromium in current space: " .. instanceCount("Chromium"))
