hs.urlevent.bind('win-sizing', function (eventName, params)
    hs.window.animationDuration = 0

    local win = hs.window.focusedWindow()
    local f = win:frame()
    local screen = win:screen()
    local max = screen:frame()

    if (params.method == 'left') then
        f.x = max.x f.y = max.y f.w = max.w / 2 f.h = max.h
    elseif (params.method == 'right') then
        f.x = max.x + (max.w / 2) f.y = max.y f.w = max.w / 2 f.h = max.h
    elseif (params.method == 'up') then
        f.x = max.x f.y = max.y f.w = max.w f.h = max.h / 2
    elseif (params.method == 'down') then
        f.x = max.x f.y = max.y + (max.h / 2) f.w = max.w f.h = max.h / 2
    elseif (params.method == 'q') then
        f.x = max.x f.y = max.y f.w = max.w / 2 f.h = max.h / 2
    elseif (params.method == 'e') then
        f.x = max.x + (max.w / 2) f.y = max.y f.w = max.w / 2 f.h = max.h / 2
    elseif (params.method == 'z') then
        f.x = max.x f.y = max.y + (max.h / 2) f.w = max.w / 2 f.h = max.h / 2
    elseif (params.method == 'c') then
        f.x = max.x + (max.w / 2) f.y = max.y + (max.h / 2) f.w = max.w / 2 f.h = max.h / 2
    elseif (params.method == 'max') then
        f.x = max.x f.y = max.y f.w = max.w f.h = max.h
    elseif (params.method == 'center') then
        -- margin: 10%
        f.x = max.x + (max.w * 10 / 100) f.y = max.y + (max.h * 10 / 100) f.w = max.w * 80 / 100 f.h =max.h * 80 / 100
        -- -- margin: 15%
        -- f.x = max.x + (max.w * 15 / 100) f.y = max.y + (max.h * 15 / 100) f.w = max.w * 70 / 100 f.h =max.h * 70 / 100
        -- f.x = max.x + (max.w * 20 / 100) f.y = max.y + (max.h * 20 / 100) f.w = max.w * 60 / 100 f.h =max.h * 60 / 100
    elseif (params.method == 'r') then
        f.x = max.x f.y = max.y f.w = max.w / 3 * 2 f.h = max.h
    elseif (params.method == 't') then
        f.x = max.x f.y = max.y f.w = max.w / 3 f.h = max.h
    elseif (params.method == 'o') then
        f.x = max.x + (max.w / 3 * 2) f.y = max.y f.w = max.w / 3 f.h  = max.h
    elseif (params.method == 'p') then
        f.x = max.x + (max.w / 3) f.y = max.y f.w = max.w / 3 * 2 f.h = max.h
    end
    win:setFrame(f)
end)
