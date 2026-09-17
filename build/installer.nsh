!macro customUnInstall
  ; Keep local preferences and recovery records; remove only the Chrome registration.
  DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\org.chrorganizer.bridge"
!macroend
