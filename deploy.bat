@echo off
echo =========================================================================
echo HEISENBERG LAB SUPPLY INTELLIGENCE - FIREBASE HOSTING DEPLOYMENT
echo =========================================================================
echo Project Target: heisenberg-6d136 (Spark Plan - Free)
echo.

set NODE_EXE="C:\Users\binoy\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set FIREBASE_JS="C:\Users\binoy\.gemini\antigravity-ide\scratch\tools\node_modules\firebase-tools\lib\bin\firebase.js"

echo [1/3] Authenticating with Firebase...
%NODE_EXE% %FIREBASE_JS% login
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Login failed or cancelled. Please try again.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/3] Setting active project to heisenberg-6d136...
%NODE_EXE% %FIREBASE_JS% use heisenberg-6d136

echo.
echo [3/3] Deploying to Firebase Hosting and applying Firestore Rules...
%NODE_EXE% %FIREBASE_JS% deploy --only hosting,firestore:rules

echo.
echo =========================================================================
echo DEPLOYMENT COMPLETE!
echo Live URL: https://heisenberg-6d136.web.app
echo =========================================================================
pause
