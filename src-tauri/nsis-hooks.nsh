!include nsDialogs.nsh

; 설치가 끝난 뒤 시작프로그램 등록 여부를 묻는다.
!macro NSIS_HOOK_POSTINSTALL
  MessageBox MB_YESNO|MB_ICONQUESTION "Windows 시작 시 MG 매니지를 자동으로 실행하시겠습니까?" IDYES create_startup
  Goto startup_done
  create_startup:
    CreateShortCut "$SMSTARTUP\MG 매니지.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "--hidden" "$INSTDIR\${MAINBINARYNAME}.exe" 0
  startup_done:
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$SMSTARTUP\MG 매니지.lnk"
!macroend
