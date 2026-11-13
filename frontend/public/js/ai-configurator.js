// AI feature add-on for the configurator page (kept separate so configurator.js stays untouched).
// Logic of the button "Mich im Auto sehen · AI" (#ai-open in configurator.ejs). On click it photographs
// the configured car from a fixed driver-side view with a transparent background and hands it, together
// with the chosen options, to the AI page via sessionStorage. ai-portrait.js knows where the driver's
// window of each model is in exactly this view.

const root = document.querySelector("#car-configurator");
const button = root?.querySelector("#ai-open");

if (root && button) {
  const viewer = () => root.querySelector("#car-viewer-host model-viewer");
  const ready = () => Boolean(viewer()?.loaded) && root.querySelector("#car-status").hidden;

  let busy = false;
  // The configurator swaps the 3D viewer when another model is chosen, so the state is polled.
  setInterval(() => {
    if (!busy) button.disabled = !ready();
  }, 400);

  function selectedOptions() {
    return [...root.querySelectorAll("#configuration-summary-items > div")]
      .map((row) => `${row.querySelector("dt")?.textContent || ""}: ${row.querySelector("dd")?.textContent || ""}`)
      .filter((text) => text.length > 2);
  }

  button.addEventListener("click", async () => {
    const v = viewer();
    if (!v || !ready()) return;
    busy = true;
    button.disabled = true;
    try {
      // Fixed driver-side view. Set again if the configurator moved the camera in the meantime.
      for (let attempt = 0; attempt < 3; attempt++) {
        v.minCameraOrbit = "auto auto auto";
        v.maxFieldOfView = "auto";
        v.cameraTarget = "auto auto auto";
        v.fieldOfView = "auto";
        v.cameraOrbit = "270deg 85deg auto";
        v.jumpCameraToGoal();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await new Promise((resolve) => setTimeout(resolve, 150));
        const theta = (((v.getCameraOrbit().theta * 180) / Math.PI) % 360 + 360) % 360;
        if (Math.abs(theta - 270) < 2) break;
      }

      const blob = await v.toBlob({ mimeType: "image/png", idealAspect: false });
      const bitmap = await createImageBitmap(blob);
      const scale = Math.min(1, 1400 / bitmap.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      sessionStorage.setItem("aureo-ai-car", JSON.stringify({
        view: "side-v1",
        carId: root.querySelector('[data-car-id][aria-pressed="true"]')?.dataset.carId,
        carName: root.querySelector("#selected-car-name")?.textContent.trim(),
        configuration: selectedOptions(),
        image: canvas.toDataURL("image/png"),
      }));
      location.href = "/ai";
    } catch (error) {
      busy = false;
      button.textContent = "Bild fehlgeschlagen, nochmal versuchen";
    }
  });
}
