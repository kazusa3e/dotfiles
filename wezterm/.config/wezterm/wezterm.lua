local wezterm = require 'wezterm'

local function is_found (str, pattern)
    return string.find(str, pattern) ~= nil
end

local function get_platform ()
    local is_windows = is_found(wezterm.target_triple, "windows")
    local is_linux = is_found(wezterm.target_triple, "linux")
    local is_macos = is_found(wezterm.target_triple, "apple")
    local os = is_windows and "windows" or is_linux and "linux" or is_macos and "macos"
    return {
        os = os,
        is_macos = is_macos,
        is_linux = is_linux,
        is_windows = is_windows,
    }
end
local platform = get_platform()

local config = wezterm.config_builder()

config.front_end = "WebGpu"

config.enable_tab_bar = false

config.initial_cols = 120
config.initial_rows = 30

config.color_scheme = 'Edge Dark (base16)'
config.cursor_blink_rate = 0

config.font = wezterm.font_with_fallback {
    'Maple Mono NF CN',
    'Source Han Sans SC',
    'Consolas'
}
if platform.is_macos then
    config.font_size = 12
elseif platform.is_windows then
    config.font_size = 9
end


return config
