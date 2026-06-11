# Merecunve — Instrucciones para ejecutar y compartir

Este repositorio contiene una pequeña app de pedidos (cliente estático en `public/`, API en `server.js`). Aquí tienes pasos rápidos para ejecutar localmente, exponer la app con ngrok y desplegarla en Railway/Render.

## Ejecutar localmente
1. Abrir PowerShell y situarse en la carpeta del proyecto:

```powershell
cd C:\Users\Leonel David\restaurante-app
```

2. Instalar dependencias (si no lo has hecho):

```powershell
npm install
```

3. Crear `.env` (ya existe ejemplo `.env.example`). Ejemplo:

```powershell
@"
STAFF_USER=admin
STAFF_PASS=merecunve123
JWT_SECRET=una_clave_segura_y_larga
PORT=3000
"@ | Out-File -Encoding utf8 .env
```

4. Arrancar el servidor:

```powershell
node server.js
```

5. Abrir la app en el navegador: `http://localhost:3000/` (o usa `index.html` raíz como lanzador).

---

## Exponer tu servidor con ngrok (rápido, para pruebas)
1. Instala ngrok desde https://ngrok.com y autentícalo con tu token (`ngrok authtoken <token>`).

2. Abrir una terminal y ejecutar (suponiendo servidor en puerto 3000):

```powershell
# iniciar servidor (en otra terminal)
node server.js

# en nueva terminal: exponer puerto 3000
ngrok http 3000
```

3. ngrok mostrará una URL pública `https://xxxxxx.ngrok.io`. Envía esa URL a clientes y ellos podrán interactuar con la app en tu máquina.

Notas de seguridad:
- ngrok expone tu servidor al mundo; ciérralo si dejas de usarlo.
- No uses `.env` con secretos en repositorios públicos.

---

## Script de ayuda (PowerShell)
Hay un script `scripts/start_ngrok.ps1` que intenta arrancar el servidor y ngrok (si está instalado). Ejecuta:

```powershell
./scripts/start_ngrok.ps1
```

---

## Desplegar en Railway o Render (opción recomendada para demos públicas)
Resumen rápido (Railway):
1. Crear cuenta en https://railway.app y conectar con tu repositorio de GitHub.
2. Agregar una nueva "Project" y elegir desplegar desde tu repo.
3. Configurar variables de entorno en Railway: `STAFF_USER`, `STAFF_PASS`, `JWT_SECRET`, `PORT`.
4. Establecer el comando de start: `node server.js`.
5. Railway hará build y te dará una URL pública.

Resumen rápido (Render):
1. Crear cuenta en https://render.com y seleccionar "New -> Web Service -> Connect repo".
2. Build command: `npm install` (si es necesario).
3. Start command: `node server.js`.
4. Añadir variables de entorno en Dashboard.

Si quieres, puedo generar un `Dockerfile` o `render.yaml` / `railway` template y ayudarte a conectar el repo.

---

## Solución de problemas comunes
- `Credenciales inválidas`: asegúrate de reiniciar el servidor luego de cambiar `.env`.
- En la vista previa del repositorio ves el `index.html` raíz: ahora es un lanzador que abre `http://localhost:3000/`.
- Políticas de PowerShell: usa `node server.js` o `powershell -ExecutionPolicy Bypass -Command "npm start"`.

---

Si quieres, puedo:
- Ejecutar los comandos para ti (no puedo exponer ngrok desde aquí, pero puedo crear scripts).
- Crear `render.yaml` o `Dockerfile` listo para deploy.
- Guiarte paso a paso para conectar GitHub a Railway/Render.

¿Qué prefieres que haga ahora?

## Publicar imagen a GitHub Container Registry (opcional)

Se incluye un workflow de GitHub Actions que construye y publica la imagen Docker en GHCR cuando haces push a la rama `main`:

- Archivo: `.github/workflows/publish-image.yml`
- Imagen resultante: `ghcr.io/<owner>/<repo>:latest` (el workflow usa `ghcr.io/${{ github.repository }}:latest`).

Pasos rápidos para usar la imagen en Render/Railway:

1. Haz push a `main` en tu repo de GitHub.
2. GitHub Actions construirá y publicará la imagen en GHCR.
3. En Render o Railway puedes desplegar usando la imagen `ghcr.io/<owner>/<repo>:latest` o configurar el servicio para construir desde el repo (Render detectará `render.yaml` y Dockerfile).

Si quieres, puedo automatizar el deploy a Render usando su API (requiere token) o guiarte para conectar Railway. Dime qué prefieres.