@echo off
title Punk Bolos - Ambiente Local
echo ============================================
echo  Punk Bolos - Servidor local de teste
echo  Abra http://localhost:3000 no navegador
echo  Para encerrar, feche esta janela (ou Ctrl+C)
echo ============================================
echo.
cd /d "%~dp0"
node server.js
echo.
echo O servidor encerrou. Pressione qualquer tecla para fechar.
pause > nul
