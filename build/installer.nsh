!macro customInit
  ; Add custom initialization logic here if needed
!macroend

!macro customInstall
  ; Add custom install logic here if needed
!macroend

!macro customUnInit
  ; Add custom uninstaller initialization logic here if needed
!macroend

!macro customUnInstall
  ; 1. Call launcher with --uninstall flag for system cleanup (UAC Bypass restoration, etc.)
  ; We use ExecWait to ensure cleanup is finished before files are deleted.
  DetailPrint "Running system cleanup..."
  ExecWait '"$INSTDIR\${PRODUCT_NAME}.exe" --uninstall'

  ; 2. Ask user about deleting AppData (Settings, Logs, Cache)
  MessageBox MB_ICONQUESTION|MB_YESNO "설정 파일 및 사용자 데이터(%AppData%\${PRODUCT_NAME})를 모두 삭제하시겠습니까?$\n(로그인 정보와 자동화 설정이 모두 초기화됩니다.)" /SD IDNO IDNO skip_appdata_cleanup
    DetailPrint "Cleaning up AppData..."
    RMDir /r "$APPDATA\${PRODUCT_NAME}"
  skip_appdata_cleanup:
!macroend
