; Custom NSIS Installer Script for WA ParkStay Bookings
; This file contains custom installer commands that extend the default NSIS installer

; Custom macro for installation
!macro customInstall
  ; Log installation
  DetailPrint "Installing WA ParkStay Bookings..."

  ; Create additional registry entries if needed
  ; WriteRegStr HKCU "Software\ParkStay\Bookings" "InstallPath" "$INSTDIR"

  ; Create Start Menu folder
  CreateDirectory "$SMPROGRAMS\WA ParkStay Bookings"

  ; Create desktop shortcut (always)
  CreateShortCut "$DESKTOP\WA ParkStay Bookings.lnk" "$INSTDIR\WA ParkStay Bookings.exe" \
    "" "$INSTDIR\WA ParkStay Bookings.exe" 0 SW_SHOWNORMAL \
    "" "Launch WA ParkStay Bookings"

  ; Create Start Menu shortcuts
  CreateShortCut "$SMPROGRAMS\WA ParkStay Bookings\WA ParkStay Bookings.lnk" \
    "$INSTDIR\WA ParkStay Bookings.exe" \
    "" "$INSTDIR\WA ParkStay Bookings.exe" 0 SW_SHOWNORMAL \
    "" "Launch WA ParkStay Bookings"

  CreateShortCut "$SMPROGRAMS\WA ParkStay Bookings\Uninstall.lnk" \
    "$INSTDIR\Uninstall WA ParkStay Bookings.exe" \
    "" "$INSTDIR\Uninstall WA ParkStay Bookings.exe" 0 SW_SHOWNORMAL \
    "" "Uninstall WA ParkStay Bookings"

  ; Optional: Create Quick Launch shortcut
  ; CreateShortCut "$QUICKLAUNCH\WA ParkStay Bookings.lnk" "$INSTDIR\WA ParkStay Bookings.exe"

  ; Set file associations (if needed)
  ; WriteRegStr HKCR ".parkstay" "" "ParkStayBookingFile"
  ; WriteRegStr HKCR "ParkStayBookingFile" "" "ParkStay Booking File"
  ; WriteRegStr HKCR "ParkStayBookingFile\DefaultIcon" "" "$INSTDIR\WA ParkStay Bookings.exe,0"
  ; WriteRegStr HKCR "ParkStayBookingFile\shell\open\command" "" '"$INSTDIR\WA ParkStay Bookings.exe" "%1"'

  ; Add to Windows Firewall exceptions (optional)
  ; This allows the app to access the network without user prompts
  ; Requires administrator privileges
  ; nsExec::ExecToLog 'netsh advfirewall firewall add rule name="WA ParkStay Bookings" dir=in action=allow program="$INSTDIR\WA ParkStay Bookings.exe" enable=yes'

  DetailPrint "Installation complete!"
!macroend

; Custom macro for uninstallation
!macro customUnInstall
  ; Log uninstallation
  DetailPrint "Uninstalling WA ParkStay Bookings..."

  ; Remove registry entries
  ; DeleteRegKey HKCU "Software\ParkStay\Bookings"

  ; Remove shortcuts
  Delete "$DESKTOP\WA ParkStay Bookings.lnk"
  Delete "$QUICKLAUNCH\WA ParkStay Bookings.lnk"

  ; Remove Start Menu folder
  RMDir /r "$SMPROGRAMS\WA ParkStay Bookings"

  ; Remove file associations
  ; DeleteRegKey HKCR ".parkstay"
  ; DeleteRegKey HKCR "ParkStayBookingFile"

  ; Remove Windows Firewall rule
  ; nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="WA ParkStay Bookings"'

  ; Ask user if they want to delete application data
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Do you want to delete all application data? This includes your bookings, watches, and settings.$\n$\nClick Yes to delete all data, or No to keep your data." \
    IDYES DeleteData IDNO SkipDeleteData

  DeleteData:
    ; Delete application data
    RMDir /r "$APPDATA\parkstay-bookings"
    RMDir /r "$LOCALAPPDATA\parkstay-bookings"
    DetailPrint "Application data deleted"
    Goto Done

  SkipDeleteData:
    DetailPrint "Application data preserved"

  Done:
    DetailPrint "Uninstallation complete!"
!macroend

; Custom initialization
!macro customInit
  ; Check Windows version
  ; Require Windows 10 or later
  ${If} ${AtLeastWin10}
    ; OK to proceed
  ${Else}
    MessageBox MB_OK|MB_ICONSTOP "WA ParkStay Bookings requires Windows 10 or later."
    Quit
  ${EndIf}

  ; Check for required dependencies
  ; (Add checks for .NET Framework, Visual C++ Redistributables, etc. if needed)
!macroend

; Custom page for installer
; !macro customInstallPage
;   ; Add custom installer page here if needed
; !macroend

; Custom header for installer
!macro customHeader
  ; Custom header text
  !define MUI_TEXT_WELCOME_INFO_TITLE "Welcome to WA ParkStay Bookings Setup"
  !define MUI_TEXT_WELCOME_INFO_TEXT "This wizard will guide you through the installation of WA ParkStay Bookings.$\r$\n$\r$\nThis application helps you automate campground bookings on the Western Australia Parks and Wildlife Service ParkStay system.$\r$\n$\r$\nClick Next to continue."
!macroend

; Custom finish page
!macro customFinishPage
  ; Custom finish page text
  !define MUI_FINISHPAGE_TITLE "Installation Complete"
  !define MUI_FINISHPAGE_TEXT "WA ParkStay Bookings has been successfully installed on your computer.$\r$\n$\r$\nClick Finish to close this wizard."
  !define MUI_FINISHPAGE_RUN "$INSTDIR\WA ParkStay Bookings.exe"
  !define MUI_FINISHPAGE_RUN_TEXT "Launch WA ParkStay Bookings now"
!macroend
