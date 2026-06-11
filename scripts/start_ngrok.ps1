# Script de ayuda: arranca server y ngrok (PowerShell)
# Uso: ejecutar desde la carpeta del proyecto
# Requiere: node en PATH. ngrok opcionalmente en PATH si quieres exponer.

$project = Split-Path -Path $PSScriptRoot -Parent
Set-Location -Path $project

Write-Host "Iniciando server.js..."
Start-Process -FilePath node -ArgumentList 'server.js' -NoNewWindow
Start-Sleep -Seconds 1

# comprobar si ngrok está disponible
$ngrok = Get-Command ngrok -ErrorAction SilentlyContinue
if ($ngrok) {
  Write-Host "ngrok detectado. Iniciando túnel en 3000..."
  Start-Process -FilePath ngrok -ArgumentList 'http 3000'
} else {
  Write-Host "ngrok no encontrado en PATH. Instala ngrok o ejecuta 'ngrok http 3000' manualmente." -ForegroundColor Yellow
}

Write-Host "Listo. Abre http://localhost:3000 o la URL pública que ngrok imprima en su terminal."