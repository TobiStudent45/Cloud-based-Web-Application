# Car Manufacturer – Cloud-native Web App

Microservice-Projekt (HHZ Reutlingen).

## Architektur

```
Browser → frontend (Port 80) → backend (API Gateway) → services/* → Datenhaltung
```

- **frontend** – Web-UI (EJS). Spricht nur mit dem Gateway, nie direkt mit einem Service.
- **backend** – API Gateway. Routet `/api/<service>/...` an den jeweiligen Service. Keine Fachlogik.
- **services/** – je ein Microservice (eigener Container). Liefern nur JSON, keine Views.
- **db/** – Startdaten (keine Services).

## Starten

```bash
cp .env.example .env    # GEMINI_API_KEY eintragen
docker compose up
```

| Dienst | URL |
|---|---|
| Web-App | http://localhost |
| phpMyAdmin | http://localhost:8081 |
| Redis Commander | http://localhost:8082 |
| MinIO Console | http://localhost:9001 (derzeit deaktiviert) |

Admin-Logins: `hhzadmin` / `hhzadmin` (MySQL-root-Passwort ebenfalls `hhzadmin`).

> **MinIO ist in `compose.yml` vorerst auskommentiert**, da der Image-Pull
> (`minio/minio`) in der aktuellen Netzwerkumgebung vom Proxy blockiert wird.
> Zum Reaktivieren den `minio`-Block + das `minio-data`-Volume einkommentieren.

## Frontend: eine Seite ändern/hinzufügen

Layout, Navigation und Styles liegen **zentral** – nicht pro Seite kopieren.

- **Navigation + Routen:** `frontend/config/pages.js` (einziger Ort). Neuer Tab = ein Eintrag.
- **Layout/Header:** `frontend/views/layouts/mainLayout.ejs`
- **Styles:** `frontend/public/css/theme.css` (gemeinsames Design-System)
- **Deine Seite:** `frontend/views/pages/<view>.ejs`

Ablauf für eine neue Seite:

1. Eintrag in `config/pages.js`:
   ```js
   { label: "Orders", path: "/orders", view: "orders", api: "/orders/list" }
   ```
2. `views/pages/orders.ejs` anlegen. In der View verfügbar:
   - `data` – JSON vom Gateway (falls `api` gesetzt)
   - `apiError` – Fehlertext, falls Service nicht erreichbar

Das `api`-Feld ist optional. Ohne es rendert die Seite nur statisches Markup.

## Service bauen

Jeder Ordner unter `services/` ist eigenständig: `Dockerfile`, `package.json`, `server.js`.
Das Gerüst liefert bereits `GET /health`. Fachliche Routen dort ergänzen.

- Intern lauscht jeder Service auf **Port 3000** (nicht nach außen veröffentlicht).
- Erreichbar nur über das Gateway: `/api/<service>/<pfad>` → `<service>:3000/<pfad>`.
- Beispiel: `GET /api/merchandise/products` → `merchandise:3000/products`.

Container sprechen sich über den Servicenamen an (`http://cart:3000`, `redis:6379`, `mysql:3306`), nie über `localhost`.

## Service-Übersicht

| Service | Nav-Tab | Datenhaltung |
|---|---|---|
| configurator | ✓ | MySQL, MinIO |
| merchandise | ✓ | MySQL, MinIO |
| impressions | ✓ | MinIO |
| road2supercar | ✓ | – / Karten-API |
| ai | ✓ | Google Gemini (extern) |
| product-info | – | MySQL, MinIO |
| cart | – | Redis |
| orders | – | MySQL |

Hintergrund-Services (ohne Nav-Tab) werden von anderen Seiten über das Gateway genutzt.
