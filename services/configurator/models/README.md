# Fahrzeugmodelle

Lege die beiden selbst enthaltenen GLB-Dateien direkt in diesem Ordner ab:

- `Lambo.glb` → Lambo
- `Beetle-web.glb` → vorbereitete Web-Version für den Konfigurator

Groß-/Kleinschreibung beachten: Der Docker-Container verwendet Linux.
Es sind keine Beispielmodelle enthalten.

`Beetle-web.glb` ist das fertige Modell mit vollständiger Karosserie und
vollständigen Sitzen. Für den Betrieb ist keine weitere Aufbereitung nötig.

Docker Compose bindet diesen Ordner schreibgeschützt ein. Neue Dateien sind
dadurch ohne Image-Neubau verfügbar; lade danach die Konfigurator-Seite neu.

Die Modelldaten liegen in MySQL in `carmanufacturer.configurator_cars`.
Dort können Name, Beschreibung und Dateiname geändert werden. Bestehende
Einträge werden beim Start nicht überschrieben.

Die GLBs werden vom Konfigurator-Service ausgeliefert. Der Browser greift
ausschließlich über `/api/configurator/cars/:id/model` auf das API-Gateway zu.
Die Dateien müssen Geometrie und Texturen enthalten; externe Dateien werden
nicht automatisch mit ausgeliefert.
