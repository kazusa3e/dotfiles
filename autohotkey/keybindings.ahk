#Requires AutoHotkey v2.0

; caps to toggle ime
CapsLock::Send "^#{Space}"

; remap shift + esc as tilde
+Escape::Send "~"

; remap RShift, RCtrl as scroll up and down
RShift::Send "{WheelUp}"
RCtrl::Send "{WheelDown}"

; use alt + q to toggle alacritty terminal
!q:: {
    AlacrittyPath := "C:\Users\kazusa\scoop\apps\alacritty\current\alacritty.exe"

    AlacrittyClass := "ahk_class Window Class"
    AlacrittyExe := "ahk_exe alacritty.exe"

    WinToTarget := AlacrittyClass " " AlacrittyExe

    if WinExist(WinToTarget) {
        if WinActive(WinToTarget) {
            WinMinimize(WinToTarget)
        } else {
            WinActivate(WinToTarget)
        }
    } else {
        Run AlacrittyPath
    }
}
