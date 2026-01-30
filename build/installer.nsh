!macro customInit
  ; Check if the app is running and kill it before installation
  DetailPrint "Checking for running instance..."
  ExecWait 'taskkill /F /IM "${PRODUCT_FILENAME}.exe" /T' $R0
  Sleep 1000
!macroend

!macro customInstall
  ; Add custom install logic here if needed
!macroend

!macro customUnInit
  ; Check if the app is running and kill it using taskkill (Plugin-free)
  DetailPrint "Checking for running instance..."
  ExecWait 'taskkill /F /IM "${PRODUCT_FILENAME}.exe" /T' $R0
  Sleep 1000

  ; [Cleaned] No extra logic here.
  ; Verification: UAC disable logic moved to customUnInstall to support reinstall/update scenarios.
!macroend

!macro customUnInstall
  ; 3. Ask user about deleting AppData (Settings, Logs, Cache)
  MessageBox MB_ICONQUESTION|MB_YESNO "설정 파일 및 사용자 데이터(%AppData%\${PRODUCT_FILENAME})를 모두 삭제하시겠습니까?$\n(로그인 정보와 자동화 설정이 모두 초기화됩니다.)" /SD IDNO IDNO skip_appdata_cleanup
    DetailPrint "Cleaning up AppData..."

    ; [New] Run UAC cleanup script if exists (Only when user agrees to full wipe)
    ; This ensures UAC settings are kept during reinstall/update (where user usually says NO to data wipe)
    IfFileExists "$APPDATA\${PRODUCT_FILENAME}\uac_bypass\uninstall_uac.bat" 0 skip_uac_cleanup
      DetailPrint "Removing UAC Bypass settings..."
      ExecWait '"$APPDATA\${PRODUCT_FILENAME}\uac_bypass\uninstall_uac.bat"'
    skip_uac_cleanup:

    ; Attempt to remove actual data path
    RMDir /r "$APPDATA\${PRODUCT_FILENAME}"
  skip_appdata_cleanup:
!macroend
