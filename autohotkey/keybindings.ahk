#Requires AutoHotkey v2.0

; caps to toggle ime
CapsLock::Send "#{Space}"

; remap shift + esc as tilde
+Escape::Send "~"

; remap RShift, RCtrl as scroll up and down
RShift::Send "{WheelUp}"
RCtrl::Send "{WheelDown}"
