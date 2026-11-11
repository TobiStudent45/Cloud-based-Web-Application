import { createPricing, formatPrice } from "/js/configurator-pricing.js";

const root = document.querySelector("#car-configurator");

if (root) {
  const pricing = createPricing(root);
  const buttons = [...root.querySelectorAll("[data-car-id]")];
  const host = root.querySelector("#car-viewer-host");
  const stage = root.querySelector("#car-stage");
  const status = root.querySelector("#car-status");
  const statusText = root.querySelector("#car-status-text");
  const reset = root.querySelector("#reset-car-camera");
  const title = root.querySelector("#selected-car-name");
  const description = root.querySelector("#selected-car-description");
  const customizationStatus = root.querySelector("#customization-status");
  const optionsHost = root.querySelector("#customization-options");
  const resetConfiguration = root.querySelector("#reset-car-configuration");
  const summary = root.querySelector("#configuration-summary");
  const summaryItems = root.querySelector("#configuration-summary-items");
  const areas = root.querySelector("#customization-areas");
  const areaButtons = [...areas.querySelectorAll("[data-area]")];
  const interiorViews = root.querySelector("#interior-camera-views");
  const interiorViewButtons = [...interiorViews.querySelectorAll("[data-interior-view]")];
  const viewLabel = root.querySelector("#car-view-label");
  const interiorCameras = {
    lambo: {
      seats: { target: "0m 0.55m -0.15m", orbit: "-25deg 70deg 0.95m", fieldOfView: "85deg" },
      cockpit: { target: "0m 0.65m 0.8m", orbit: "180deg 75deg 1.1m", fieldOfView: "80deg" },
    },
    beetle: {
      seats: { target: "0.1m 0.9m -0.3m", orbit: "-20deg 70deg 0.95m", fieldOfView: "85deg" },
      cockpit: { target: "0.1m 1m 0.55m", orbit: "180deg 75deg 0.85m", fieldOfView: "80deg" },
    },
  };
  let activeCarId = null;
  let activeArea = "exterior";
  let activeInteriorView = "seats";
  const choicesByCar = new Map();
  const originalMaterials = new Map();
  let activeGroups = [];
  let activeChoices = null;
  let viewer = null;
  let selection = 0;
  let viewerLibrary = null;

  function resetCamera() {
    if (!viewer) return;
    const preset = activeArea === "interior" && interiorCameras[activeCarId]?.[activeInteriorView];
    viewer.minCameraOrbit = preset ? "auto auto 0.05m" : "auto auto auto";
    viewer.maxFieldOfView = preset ? "100deg" : "auto";
    viewer.cameraTarget = preset ? preset.target : "auto auto auto";
    viewer.cameraOrbit = preset ? preset.orbit : "35deg 75deg auto";
    viewer.fieldOfView = preset ? preset.fieldOfView : "auto";
    viewer.jumpCameraToGoal();
  }

  function showArea(area, moveCamera = true) {
    activeArea = area;
    for (const button of areaButtons) button.setAttribute("aria-pressed", String(button.dataset.area === area));
    for (const group of activeGroups) {
      group.fieldset.hidden = group.section !== area;
      group.summaryGroup.hidden = group.section !== area;
    }
    interiorViews.hidden = area !== "interior" || !interiorCameras[activeCarId];
    viewLabel.textContent = area === "interior" ? "3D / Innenraum" : "3D / Außenansicht";
    customizationStatus.textContent = area === "interior"
      ? "Gestalte die Farben von Sitzen und Innenverkleidung."
      : "Deine Auswahl erscheint direkt am Fahrzeug.";
    if (moveCamera) resetCamera();
  }

  for (const button of areaButtons) {
    button.addEventListener("click", () => showArea(button.dataset.area));
  }
  for (const button of interiorViewButtons) {
    button.addEventListener("click", () => {
      activeInteriorView = button.dataset.interiorView;
      for (const item of interiorViewButtons) item.setAttribute("aria-pressed", String(item === button));
      resetCamera();
    });
  }

  function restoreMaterials() {
    for (const [material, original] of originalMaterials) {
      const pbr = material.pbrMetallicRoughness;
      pbr.setBaseColorFactor(original.baseColor);
      pbr.setMetallicFactor(original.metallic);
      pbr.setRoughnessFactor(original.roughness);
      material.setClearcoatFactor(original.clearcoat);
      material.setClearcoatRoughnessFactor(original.clearcoatRoughness);
    }
  }

  function updateConfiguration() {
    restoreMaterials();
    for (const group of activeGroups) {
      const choice = group.choices.find((item) => item.id === activeChoices.get(group.id));
      group.output.textContent = choice.label + (choice.priceCents === null ? " · Preis fehlt" : choice.priceCents ? " · + " + formatPrice(choice.priceCents) : " · Serie");
      group.summaryValue.textContent = choice.label;
      for (const radio of group.radios) radio.checked = radio.value === choice.id;
      for (const material of group.materials) {
        const values = choice.values;
        const pbr = material.pbrMetallicRoughness;
        if (values.baseColor !== undefined) pbr.setBaseColorFactor(values.baseColor);
        if (values.metallic !== undefined) pbr.setMetallicFactor(values.metallic);
        if (values.roughness !== undefined) pbr.setRoughnessFactor(values.roughness);
        if (values.clearcoat !== undefined) material.setClearcoatFactor(values.clearcoat);
        if (values.clearcoatRoughness !== undefined) material.setClearcoatRoughnessFactor(values.clearcoatRoughness);
      }
    }
    resetConfiguration.disabled = activeGroups.every((group) => activeChoices.get(group.id) === "original");
    if (activeChoices) pricing.update(activeCarId, Object.fromEntries(activeGroups.map((group) => [group.id, activeChoices.get(group.id)])));
  }

  function initializeConfiguration(element, carId, options) {
    if (!options) {
      customizationStatus.textContent = "Die Anpassungen konnten nicht geladen werden. Bitte lade die Seite erneut.";
      pricing.reset("Anpassungen und Preise konnten nicht geladen werden.");
      return;
    }
    activeChoices = choicesByCar.get(carId) || new Map();
    choicesByCar.set(carId, activeChoices);
    const materials = element.model.materials;
    activeGroups = options.groups.flatMap((group) => {
      const targets = group.materialNames.map((name) => materials.find((material) => material.name === name));
      if (!targets.length || targets.some((material) => !material) || !group.choices.length) return [];
      for (const material of targets) {
        if (originalMaterials.has(material)) continue;
        const pbr = material.pbrMetallicRoughness;
        originalMaterials.set(material, {
          baseColor: [...pbr.baseColorFactor], metallic: pbr.metallicFactor,
          roughness: pbr.roughnessFactor, clearcoat: material.clearcoatFactor,
          clearcoatRoughness: material.clearcoatRoughnessFactor,
        });
      }
      if (!group.choices.some((choice) => choice.id === activeChoices.get(group.id))) {
        activeChoices.set(group.id, "original");
      }
      const fieldset = document.createElement("fieldset");
      fieldset.className = "configurator-option-group";
      fieldset.dataset.optionGroup = group.id;
      const legend = document.createElement("legend");
      legend.append(document.createTextNode(group.label));
      const output = document.createElement("output");
      legend.append(output);
      const list = document.createElement("div");
      list.className = "configurator-choices";
      const radios = group.choices.map((choice) => {
        const label = document.createElement("label");
        label.className = "configurator-choice";
        const priceLabel = choice.priceCents === null ? "Preis nicht verfügbar" : choice.priceCents ? "Aufpreis " + formatPrice(choice.priceCents) : "Serienausstattung";
        label.title = choice.label + " · " + priceLabel;
        const input = document.createElement("input");
        input.type = "radio";
        input.name = carId + "-" + group.id;
        input.value = choice.id;
        input.setAttribute("aria-label", choice.label + ", " + priceLabel);
        input.disabled = choice.priceCents === null;
        const appearance = document.createElement("span");
        if (choice.swatch) {
          appearance.className = "configurator-swatch";
          appearance.style.backgroundColor = choice.swatch;
        } else {
          appearance.className = "configurator-choice-text";
          appearance.textContent = choice.label;
        }
        label.append(input, appearance);
        list.append(label);
        return input;
      });
      fieldset.addEventListener("change", (event) => {
        if (!radios.includes(event.target)) return;
        activeChoices.set(group.id, event.target.value);
        updateConfiguration();
      });
      fieldset.append(legend, list);
      optionsHost.append(fieldset);
      const summaryGroup = document.createElement("div");
      const summaryLabel = document.createElement("dt");
      summaryLabel.textContent = group.label;
      const summaryValue = document.createElement("dd");
      summaryGroup.append(summaryLabel, summaryValue);
      summaryItems.append(summaryGroup);
      return [{ ...group, section: group.section || "exterior", materials: targets, output, radios, summaryValue, fieldset, summaryGroup }];
    });
    customizationStatus.textContent = activeGroups.length
      ? "Deine Auswahl erscheint direkt am Fahrzeug."
      : "Für dieses Modell stehen noch keine Anpassungen zur Verfügung.";
    summary.hidden = !activeGroups.length;
    resetConfiguration.hidden = !activeGroups.length;
    areas.hidden = !activeGroups.length;
    for (const button of areaButtons) {
      button.disabled = !activeGroups.some((group) => group.section === button.dataset.area);
    }
    updateConfiguration();
    if (activeGroups.length) showArea(activeGroups.some((group) => group.section === "exterior") ? "exterior" : "interior", false);
  }

  resetConfiguration.addEventListener("click", () => {
    for (const group of activeGroups) activeChoices.set(group.id, "original");
    updateConfiguration();
  });

  function showStatus(text, loading = false) {
    statusText.textContent = text;
    status.hidden = false;
    stage.setAttribute("aria-busy", String(loading));
    reset.disabled = true;
  }

  function loadViewerLibrary() {
    if (!viewerLibrary) {
      viewerLibrary = import("/vendor/model-viewer.min.js");
    }
    return viewerLibrary;
  }

  async function selectCar(button) {
    const current = ++selection;
    pricing.reset();
    activeCarId = button.dataset.carId;
    activeArea = "exterior";
    activeInteriorView = "seats";
    areas.hidden = true;
    interiorViews.hidden = true;
    viewLabel.textContent = "3D / Außenansicht";
    for (const item of interiorViewButtons) item.setAttribute("aria-pressed", String(item.dataset.interiorView === "seats"));
    buttons.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    title.textContent = button.dataset.carName;
    description.textContent = button.dataset.carDescription;
    restoreMaterials();
    originalMaterials.clear();
    activeGroups = [];
    activeChoices = null;
    optionsHost.replaceChildren();
    summaryItems.replaceChildren();
    summary.hidden = true;
    resetConfiguration.hidden = true;
    resetConfiguration.disabled = true;
    customizationStatus.textContent = "Anpassungen werden vorbereitet …";
    host.replaceChildren();
    viewer = null;

    if (button.dataset.available !== "true") {
      showStatus("Das 3D-Modell für " + button.dataset.carName + " ist noch nicht verfügbar.");
      customizationStatus.textContent = "Anpassungen sind verfügbar, sobald das 3D-Modell hinterlegt ist.";
      pricing.reset("Speichern ist möglich, sobald das 3D-Modell verfügbar ist.");
      return;
    }

    const options = fetch("/api/configurator/cars/" + encodeURIComponent(button.dataset.carId) + "/options", {
      signal: AbortSignal.timeout(10000),
    }).then((response) => {
      if (!response.ok) throw new Error("Options unavailable");
      return response.json();
    }).catch(() => null);

    showStatus("3D-Modell wird geladen …", true);
    try {
      await loadViewerLibrary();
      if (selection !== current) return;

      const element = document.createElement("model-viewer");
      viewer = element;
      element.setAttribute("alt", "Interaktives 3D-Modell: " + button.dataset.carName);
      element.setAttribute("camera-controls", "");
      element.setAttribute("touch-action", "pan-y");
      element.setAttribute("camera-orbit", "35deg 75deg auto");
      element.setAttribute("shadow-intensity", "1");
      element.setAttribute("exposure", "1");
      element.setAttribute("loading", "eager");
      element.setAttribute("interaction-prompt", "none");
      element.addEventListener("progress", (event) => {
        if (selection !== current || status.hidden) return;
        const progress = Math.round(event.detail.totalProgress * 100);
        statusText.textContent = "3D-Modell wird geladen … " + progress + " %";
      });
      element.addEventListener("load", async () => {
        if (selection !== current) return;
        status.hidden = true;
        stage.setAttribute("aria-busy", "false");
        reset.disabled = false;
        const availableOptions = await options;
        if (selection !== current) return;
        initializeConfiguration(element, button.dataset.carId, availableOptions);
      });
      element.addEventListener("error", () => {
        if (selection !== current) return;
        host.replaceChildren();
        viewer = null;
        showStatus("Das 3D-Modell konnte nicht geladen werden. Bitte lade die Seite erneut.");
        customizationStatus.textContent = "Anpassungen sind derzeit nicht verfügbar.";
        pricing.reset("Das Modell konnte nicht geladen werden.");
      });
      element.setAttribute("src", button.dataset.modelUrl);
      host.append(element);
    } catch (error) {
      if (selection !== current) return;
      viewerLibrary = null;
      showStatus("Die 3D-Ansicht konnte nicht gestartet werden. Bitte lade die Seite erneut.");
      customizationStatus.textContent = "Anpassungen sind derzeit nicht verfügbar.";
      pricing.reset("Die 3D-Ansicht konnte nicht gestartet werden.");
    }
  }

  buttons.forEach((button) => button.addEventListener("click", () => selectCar(button)));
  reset.addEventListener("click", resetCamera);
  const defaultButton = buttons.find((button) => button.dataset.available === "true") || buttons[0];
  const savedId = new URLSearchParams(location.search).get("configuration");
  async function initializePage() {
    if (!savedId) return selectCar(defaultButton);
    try {
      const response = await fetch("/api/configurator/configurations/" + encodeURIComponent(savedId), { signal: AbortSignal.timeout(10000) });
      const snapshot = await response.json();
      if (!response.ok) throw new Error(snapshot.error || "Konfiguration nicht gefunden.");
      if (selection) return;
      const button = buttons.find((item) => item.dataset.carId === snapshot.vehicle.id);
      if (!button) throw new Error("Das gespeicherte Fahrzeug ist nicht mehr verfügbar.");
      choicesByCar.set(snapshot.vehicle.id, new Map(snapshot.selections.map((item) => [item.groupId, item.choiceId])));
      pricing.remember(snapshot);
      await selectCar(button);
    } catch (error) {
      if (selection) return;
      await selectCar(defaultButton);
      pricing.message("Die gespeicherte Konfiguration konnte nicht geladen werden: " + error.message, true);
    }
  }
  initializePage();
}
