#Requires AutoHotkey v2.0
#SingleInstance Force
Persistent

toggle := false

; Press F8 to start/stop the loop
F8::
    {
        global toggle
        toggle := !toggle
        if (toggle)
            SetTimer(DoActions, 100)
        else
            SetTimer(DoActions, 0)
    }

    DoActions()
    {
        Send("{Right}")
        Sleep(200)
        Send("!+q") ; Alt + Shift + Q
        Sleep(100)
    }
