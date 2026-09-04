; Defining customCheckAppRunning disables these declarations in electron-builder.
!include "getProcessInfo.nsh"
Var pid

!macro customCheckAppRunning
  !insertmacro IS_POWERSHELL_AVAILABLE
  ; The updater starts NSIS before app.quit(). Give normal shutdown time to finish.
  ; Keep the stock running-app check and its timeout fallback for locked files.
  StrCpy $R1 0
  ${Do}
    !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
    ${If} $R0 != 0
      ${ExitDo}
    ${EndIf}
    ${If} $R1 >= 15
      ${ExitDo}
    ${EndIf}
    Sleep 1000
    IntOp $R1 $R1 + 1
  ${Loop}
  !insertmacro _CHECK_APP_RUNNING
!macroend

!macro customUnInstall
  ; 3. Ask user about deleting AppData (Settings, Logs, Cache)
  MessageBox MB_ICONQUESTION|MB_YESNO "설정 파일 및 사용자 데이터(%AppData%\${PRODUCT_FILENAME})를 모두 삭제하시겠습니까?$\n(로그인 정보와 자동화 설정이 모두 초기화됩니다.)" /SD IDNO IDNO skip_appdata_cleanup
    DetailPrint "Cleaning up AppData..."

    ; [New] Run UAC cleanup script if exists (Only when user agrees to full wipe)
    ; This ensures UAC settings are kept during reinstall/update (where user usually says NO to data wipe)
    IfFileExists "$APPDATA\${PRODUCT_FILENAME}\daumgamestarter_uac\uninstall_uac.bat" 0 skip_uac_cleanup
      DetailPrint "Removing UAC Bypass settings..."
      ExecWait '"$APPDATA\${PRODUCT_FILENAME}\daumgamestarter_uac\uninstall_uac.bat"'
    skip_uac_cleanup:

    ; Attempt to remove actual data path
    RMDir /r "$APPDATA\${PRODUCT_FILENAME}"
  skip_appdata_cleanup:
!macroend
