#Requires AutoHotkey v2.0

; caps to toggle ime
CapsLock::Send "^#{Space}"

; remap shift + esc as tilde
+Escape::Send "~"

; remap RShift, RCtrl as scroll up and down
RShift::Send "{WheelUp}"
RCtrl::Send "{WheelDown}"

; use alt + q to toggle wezterm terminal
!q:: {
    WezTermPath := "C:\Program Files\WezTerm\wezterm-gui.exe"

    WezTermClass := "ahk_class org.wezfurlong.wezterm"
    WezTermExe := "ahk_exe wezterm-gui.exe"

    WinToTarget := WezTermClass " " WezTermExe

    if WinExist(WinToTarget) {
        if WinActive(WinToTarget) {
            WinMinimize(WinToTarget)
        } else {
            WinActivate(WinToTarget)
        }
    } else {
        Run WezTermPath
    }
}
