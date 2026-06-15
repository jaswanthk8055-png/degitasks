@echo off
echo Packaging DegiTask Teams app...
cd /d "%~dp0teams-app"
if not exist color.png (
  echo ERROR: color.png not found in teams-app\. Please add a 192x192 PNG icon.
  pause
  exit /b 1
)
if not exist outline.png (
  echo ERROR: outline.png not found in teams-app\. Please add a 32x32 PNG icon.
  pause
  exit /b 1
)
powershell -Command "Compress-Archive -Path manifest.json,color.png,outline.png -DestinationPath ..\degitask-teams.zip -Force"
echo Done! Upload degitask-teams.zip to Microsoft Teams Admin Center or sideload it.
pause
