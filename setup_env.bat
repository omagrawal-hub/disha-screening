@echo off
echo.
echo  DISHA - create .env
echo  -------------------
echo  Get a key at https://aistudio.google.com/apikey  (Create API key, then Copy)
echo.
set /p KEY=Paste your Gemini API key here and press Enter: 
if "%KEY%"=="" (
  echo No key entered. Nothing was changed.
  pause
  exit /b 1
)
(
echo AI_PROVIDER=gemini
echo GEMINI_API_KEY=%KEY%
echo GEMINI_MODEL=gemini-flash-latest
echo PORT=3000
) > "%~dp0.env"
echo.
echo  Done. .env created in: %~dp0
echo  Now go back to VS Code, press Ctrl + C in the terminal, then run:  npm start
echo.
pause
