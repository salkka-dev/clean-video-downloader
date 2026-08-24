!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
  Var DesktopShortcutCheckbox
  Var StartupCheckbox
  Var DesktopShortcutRequested
  Var StartupRequested

  !macro customInit
    StrCpy $DesktopShortcutRequested ${BST_CHECKED}
    StrCpy $StartupRequested ${BST_UNCHECKED}

    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_ID}"
    ${If} $0 != ""
      StrCpy $StartupRequested ${BST_CHECKED}
    ${EndIf}
  !macroend

  !macro customPageAfterChangeDir
    Page custom ShortcutOptionsCreate ShortcutOptionsLeave
  !macroend

  Function ShortcutOptionsCreate
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 24u "추가 설치 옵션을 선택하세요."
    Pop $0

    ${NSD_CreateCheckbox} 0 34u 100% 14u "바탕화면 바로가기 만들기"
    Pop $DesktopShortcutCheckbox
    ${NSD_SetState} $DesktopShortcutCheckbox $DesktopShortcutRequested

    ${NSD_CreateCheckbox} 0 58u 100% 14u "Windows 시작 시 클린 영상 다운로더 자동 실행"
    Pop $StartupCheckbox
    ${NSD_SetState} $StartupCheckbox $StartupRequested

    nsDialogs::Show
  FunctionEnd

  Function ShortcutOptionsLeave
    ${NSD_GetState} $DesktopShortcutCheckbox $DesktopShortcutRequested
    ${NSD_GetState} $StartupCheckbox $StartupRequested
  FunctionEnd

  !macro customInstall
    ${If} $DesktopShortcutRequested != ${BST_CHECKED}
      Delete "$newDesktopLink"
    ${EndIf}

    ${If} $StartupRequested == ${BST_CHECKED}
      WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_ID}" '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\"'
    ${Else}
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_ID}"
    ${EndIf}
  !macroend
!endif

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_ID}"
!macroend
