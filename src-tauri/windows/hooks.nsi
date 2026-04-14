; hooks.nsi is !included at line 28 of the generated installer.nsi,
; but MAINBINARYNAME is not defined until line 42.
; Define our own constant so the binary name expands correctly at compile time.
!define HOOK_BINARY "app"

!macro NSIS_HOOK_POSTINSTALL
  ; Fix APP_ASSOCIATE's unquoted exe path — Tauri generates commands like:
  ;   C:\Program Files\层层加码\app.exe "%1"
  ; Without quotes around the exe path, Windows splits on the first space and
  ; the "%1" argument is consumed as part of the exe name, never reaching the app.
  ; Overwrite each ProgID's shell\open\command with a properly quoted version.

  Push "PNG Image"
  Call fixOpenCommand
  Push "JPEG Image"
  Call fixOpenCommand
  Push "BMP Image"
  Call fixOpenCommand
  Push "GIF Image"
  Call fixOpenCommand
  Push "WebP Image"
  Call fixOpenCommand

  ; Create the ProgID for "Open with" submenu
  Push "ImageOverlayTool"
  Call fixOpenCommand2

  ; Register for each image extension
  StrCpy $R0 ".png"
  Call registerImageExt
  StrCpy $R0 ".jpg"
  Call registerImageExt
  StrCpy $R0 ".jpeg"
  Call registerImageExt
  StrCpy $R0 ".bmp"
  Call registerImageExt
  StrCpy $R0 ".gif"
  Call registerImageExt
  StrCpy $R0 ".webp"
  Call registerImageExt

  ; Notify shell of changes
  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Clean up registry entries
  DeleteRegKey HKCR "ImageOverlayTool"

  StrCpy $R0 ".png"
  Call un.registerImageExt
  StrCpy $R0 ".jpg"
  Call un.registerImageExt
  StrCpy $R0 ".jpeg"
  Call un.registerImageExt
  StrCpy $R0 ".bmp"
  Call un.registerImageExt
  StrCpy $R0 ".gif"
  Call un.registerImageExt
  StrCpy $R0 ".webp"
  Call un.registerImageExt

  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

; Build a properly quoted open command string and write it to SHCTX.
; Expected result: "C:\...\app.exe" "%1"
; Parameter (on stack): ProgID name, e.g. "PNG Image"
Function fixOpenCommand
  Pop $R1
  ; Build the command string step by step to avoid NSIS escaping conflicts
  StrCpy $R2 "$\""                             ; $R2 = "
  StrCpy $R2 "$R2$INSTDIR\${HOOK_BINARY}.exe"  ; $R2 = "C:\...\app.exe
  StrCpy $R2 "$R2$\""                           ; $R2 = "C:\...\app.exe"
  StrCpy $R2 "$R2 $\""                          ; $R2 = "C:\...\app.exe" "
  StrCpy $R2 "$R2%1$\""                         ; $R2 = "C:\...\app.exe" "%1"
  WriteRegStr SHCTX "Software\Classes\$R1\shell\open\command" "" $R2
FunctionEnd

; Same as fixOpenCommand but writes to HKCR for the ImageOverlayTool ProgID
Function fixOpenCommand2
  Pop $R1
  StrCpy $R2 "$\""
  StrCpy $R2 "$R2$INSTDIR\${HOOK_BINARY}.exe"
  StrCpy $R2 "$R2$\""
  StrCpy $R2 "$R2 $\""
  StrCpy $R2 "$R2%1$\""
  WriteRegStr HKCR "$R1\shell\open\command" "" $R2
  WriteRegStr HKCR "$R1\DefaultIcon" "" "$INSTDIR\${HOOK_BINARY}.exe,0"
FunctionEnd

; Register function - adds OpenWithList and OpenWithProgids
Function registerImageExt
  ; Add to "Open With" list for this extension
  WriteRegStr HKCR "$R0\OpenWithProgids" "ImageOverlayTool" ""
  ; Also add to the file type's OpenWithList
  ReadRegStr $R1 HKCR "$R0" ""
  StrCmp $R1 "" +2 0
  WriteRegStr HKCR "$R1\OpenWithList" "ImageOverlayTool" ""
FunctionEnd

; Unregister function
Function un.registerImageExt
  DeleteRegValue HKCR "$R0\OpenWithProgids" "ImageOverlayTool"
  ReadRegStr $R1 HKCR "$R0" ""
  StrCmp $R1 "" +2 0
  DeleteRegValue HKCR "$R1\OpenWithList" "ImageOverlayTool"
FunctionEnd
