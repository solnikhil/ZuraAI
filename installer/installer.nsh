; =============================================================================
; ZuraAI — Dark Theme NSIS Include (Wizard Installer)
;
; Personalised, dark-themed install experience.
; Uses the directory page selection as the final install path.
; Uses Windows dark mode APIs, custom control coloring, and branded messages.
;
; Color palette (Catppuccin Mocha):
;   Crust   = 0B0B14     Mantle  = 181825     Base    = 1E1E2E
;   Surface = 313244     Text    = CDD6F4     Subtext = 585B70
;   Blue    = 89B4FA
; =============================================================================

!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
Var ZuraSelectedInstallDir
!endif

; ---------------------------------------------------------------------------
; customHeader — runs before MUI page macros
; ---------------------------------------------------------------------------
!macro customHeader
  ; No compile-time MUI defines here — dark theming is applied at runtime
  ; in customShowInstFiles via SetCtlColors + DarkMode_Explorer theme.
!macroend

; ---------------------------------------------------------------------------
; customPageAfterChangeDir — preserve the exact selected install directory
; ---------------------------------------------------------------------------
!macro customPageAfterChangeDir
  !ifndef BUILD_UNINSTALLER
    !undef MUI_PAGE_CUSTOMFUNCTION_PRE
    !define MUI_PAGE_CUSTOMFUNCTION_PRE zuraInstFilesPre
  !endif
!macroend

!ifndef BUILD_UNINSTALLER
Function zuraInstFilesPre
  StrCpy $ZuraSelectedInstallDir $INSTDIR
  Call instFilesPre
FunctionEnd
!endif

; ---------------------------------------------------------------------------
; Shared dark-theming logic (installer + uninstaller)
; ---------------------------------------------------------------------------
!macro _zura_applyDarkTheme
  ; 1. Force app-wide dark mode (Win10 1809+, uxtheme ordinal 135)
  System::Call 'uxtheme.dll::135(i 2)'

  ; 2. Dark title bar (DWMWA_USE_IMMERSIVE_DARK_MODE = 20)
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 20, *i 1, i 4)'

  ; 3. Dark explorer theme on main window
  System::Call 'uxtheme.dll::133(p $HWNDPARENT, i 1)'
  System::Call 'uxtheme::SetWindowTheme(p $HWNDPARENT, w "DarkMode_Explorer", w "")'

  ; 4. Main window — dark background, light text
  SetCtlColors $HWNDPARENT "CDD6F4" "1E1E2E"

  ; 5. Header area (title + subtitle)
  GetDlgItem $R0 $HWNDPARENT 1034
  SetCtlColors $R0 "CDD6F4" "181825"
  GetDlgItem $R0 $HWNDPARENT 1036
  SetCtlColors $R0 "CDD6F4" "181825"

  ; 6. Branding text
  GetDlgItem $R0 $HWNDPARENT 1028
  SetCtlColors $R0 "585B70" "1E1E2E"

  ; 7. Buttons — dark themed
  GetDlgItem $R0 $HWNDPARENT 1
  System::Call 'uxtheme.dll::133(p $R0, i 1)'
  System::Call 'uxtheme::SetWindowTheme(p $R0, w "DarkMode_Explorer", w "")'
  GetDlgItem $R0 $HWNDPARENT 2
  System::Call 'uxtheme.dll::133(p $R0, i 1)'
  System::Call 'uxtheme::SetWindowTheme(p $R0, w "DarkMode_Explorer", w "")'

  ; 8. Inner page dialog
  FindWindow $R0 "#32770" "" $HWNDPARENT
  StrCmp $R0 0 +3
    SetCtlColors $R0 "CDD6F4" "1E1E2E"
    System::Call 'uxtheme.dll::133(p $R0, i 1)'

  ; 9. Flush theme changes
  System::Call 'uxtheme.dll::136()'
!macroend

; ---------------------------------------------------------------------------
; customGUIInit — installer GUI init
; ---------------------------------------------------------------------------
!macro customGUIInit
  !insertmacro _zura_applyDarkTheme
!macroend

; ---------------------------------------------------------------------------
; customUnGUIInit — uninstaller GUI init
; ---------------------------------------------------------------------------
!macro customUnGUIInit
  !insertmacro _zura_applyDarkTheme
!macroend

; ---------------------------------------------------------------------------
; customShowInstFiles — called when the install-progress page is shown
; ---------------------------------------------------------------------------
!macro customShowInstFiles
  ${If} $ZuraSelectedInstallDir != ""
    StrCpy $INSTDIR $ZuraSelectedInstallDir
  ${EndIf}

  ; --- Dark-theme the instfiles page controls ---
  FindWindow $R0 "#32770" "" $HWNDPARENT
  StrCmp $R0 0 _zura_done_instfiles

  ; Page dialog background
  SetCtlColors $R0 "CDD6F4" "1E1E2E"

  ; Progress bar
  GetDlgItem $R1 $R0 1004
  StrCmp $R1 0 +3
    System::Call 'uxtheme.dll::133(p $R1, i 1)'
    System::Call 'uxtheme::SetWindowTheme(p $R1, w "DarkMode_Explorer", w "")'

  ; Status label
  GetDlgItem $R1 $R0 1006
  StrCmp $R1 0 +2
    SetCtlColors $R1 "CDD6F4" "1E1E2E"

  ; Details button
  GetDlgItem $R1 $R0 1016
  StrCmp $R1 0 +3
    System::Call 'uxtheme.dll::133(p $R1, i 1)'
    System::Call 'uxtheme::SetWindowTheme(p $R1, w "DarkMode_Explorer", w "")'

  ; Details listbox
  GetDlgItem $R1 $R0 1017
  StrCmp $R1 0 +4
    SetCtlColors $R1 "CDD6F4" "1E1E2E"
    System::Call 'uxtheme.dll::133(p $R1, i 1)'
    System::Call 'uxtheme::SetWindowTheme(p $R1, w "DarkMode_Explorer", w "")'

  ; --- Personalised header text ---
  ReadEnvStr $R2 "USERNAME"

  GetDlgItem $R1 $HWNDPARENT 1034
  StrCmp $R1 0 +2
    SendMessage $R1 0x000C 0 "STR:Welcome, $R2"

  GetDlgItem $R1 $HWNDPARENT 1036
  StrCmp $R1 0 +2
    SendMessage $R1 0x000C 0 "STR:Setting up ZuraAI — this will only take a moment."

  _zura_done_instfiles:
!macroend

; ---------------------------------------------------------------------------
; customInstall — runs at the end of the install section (after file copy)
; ---------------------------------------------------------------------------
!macro customInstall
  DetailPrint ""
  DetailPrint "Preparing ZuraAI for you..."
  DetailPrint "Registering application..."
  DetailPrint "Creating shortcuts..."
  DetailPrint ""
  DetailPrint "All set — launching ZuraAI!"
!macroend
