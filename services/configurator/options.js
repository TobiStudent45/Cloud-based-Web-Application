// Material names verified separately for each GLB.
const lambo = [
  {
    id: "paint", label: "Lackfarbe", materialNames: ["car_paint_v3_03", "M_CarPaint"],
    choices: [
      { id: "original", label: "Original (Orange)", swatch: "#ff5600", values: {} },
      { id: "red", label: "Rosso", swatch: "#c8202f", values: { baseColor: "#c8202f" } },
      { id: "yellow", label: "Giallo", swatch: "#f5c928", values: { baseColor: "#f5c928" } },
      { id: "green", label: "Verde", swatch: "#69bd35", values: { baseColor: "#69bd35" } },
      { id: "blue", label: "Blu", swatch: "#236bd1", values: { baseColor: "#236bd1" } },
      { id: "white", label: "Bianco", swatch: "#e7e9e6", values: { baseColor: "#e7e9e6" } },
      { id: "black", label: "Nero", swatch: "#24262b", values: { baseColor: "#24262b" } },
      { id: "grey", label: "Grigio", swatch: "#737b85", values: { baseColor: "#737b85" } },
    ],
  },
  {
    id: "finish", label: "Lackoberfläche", materialNames: ["car_paint_v3_03", "M_CarPaint"],
    choices: [
      { id: "original", label: "Original", values: {} },
      { id: "gloss", label: "Glänzend", values: { roughness: 0.18, metallic: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 } },
      { id: "satin", label: "Satiniert", values: { roughness: 0.5, metallic: 0.15, clearcoat: 0.2, clearcoatRoughness: 0.4 } },
      { id: "matte", label: "Matt", values: { roughness: 0.85, metallic: 0.05, clearcoat: 0, clearcoatRoughness: 0.8 } },
    ],
  },
  {
    id: "wheels", label: "Felgenfarbe", materialNames: ["M_WheelRim"],
    choices: [
      { id: "original", label: "Original (Anthrazit)", swatch: "#303239", values: {} },
      { id: "black", label: "Schwarz", swatch: "#14161a", values: { baseColor: "#14161a", metallic: 0.7, roughness: 0.3 } },
      { id: "silver", label: "Silber", swatch: "#bcc2c9", values: { baseColor: "#bcc2c9", metallic: 0.8, roughness: 0.25 } },
      { id: "bronze", label: "Bronze", swatch: "#ad8150", values: { baseColor: "#ad8150", metallic: 0.7, roughness: 0.3 } },
    ],
  },
  {
    id: "calipers", label: "Bremssättel", materialNames: ["M_Caliper"],
    choices: [
      { id: "original", label: "Original (Schwarz)", swatch: "#141414", values: {} },
      { id: "red", label: "Rot", swatch: "#d62430", values: { baseColor: "#d62430", metallic: 0.25, roughness: 0.35 } },
      { id: "yellow", label: "Gelb", swatch: "#f2cf21", values: { baseColor: "#f2cf21", metallic: 0.25, roughness: 0.35 } },
      { id: "blue", label: "Blau", swatch: "#2676db", values: { baseColor: "#2676db", metallic: 0.25, roughness: 0.35 } },
    ],
  },
  {
    id: "interior-leather", section: "interior", label: "Lederflächen", materialNames: ["M_Leather"],
    choices: [
      { id: "original", label: "Original (Schwarz)", swatch: "#101011", values: {} },
      { id: "cream", label: "Creme", swatch: "#dfcdb0", values: { baseColor: "#dfcdb0" } },
      { id: "cognac", label: "Cognac", swatch: "#9e5933", values: { baseColor: "#9e5933" } },
      { id: "red", label: "Bordeaux", swatch: "#861f32", values: { baseColor: "#861f32" } },
      { id: "grey", label: "Hellgrau", swatch: "#b6b7b5", values: { baseColor: "#b6b7b5" } },
    ],
  },
  {
    id: "interior-alcantara", section: "interior", label: "Alcantara", materialNames: ["M_Alcantara"],
    choices: [
      { id: "original", label: "Original (Anthrazit)", swatch: "#101012", values: {} },
      { id: "grey", label: "Steingrau", swatch: "#686c70", values: { baseColor: "#686c70" } },
      { id: "sand", label: "Sand", swatch: "#b5a38a", values: { baseColor: "#b5a38a" } },
      { id: "blue", label: "Nachtblau", swatch: "#263c65", values: { baseColor: "#263c65" } },
    ],
  },
  {
    id: "interior-belts", section: "interior", label: "Sicherheitsgurte", materialNames: ["M_Seatbelt"],
    choices: [
      { id: "original", label: "Original (Schwarz)", swatch: "#0a0a0a", values: {} },
      { id: "red", label: "Rot", swatch: "#ce2532", values: { baseColor: "#ce2532" } },
      { id: "yellow", label: "Gelb", swatch: "#edc62b", values: { baseColor: "#edc62b" } },
      { id: "orange", label: "Orange", swatch: "#e66d27", values: { baseColor: "#e66d27" } },
      { id: "blue", label: "Blau", swatch: "#2764bb", values: { baseColor: "#2764bb" } },
    ],
  },
];

const interiorColors = [
  { id: "cream", label: "Creme", swatch: "#dfcdb0", values: { baseColor: "#dfcdb0" } },
  { id: "cognac", label: "Cognac", swatch: "#9e5933", values: { baseColor: "#9e5933" } },
  { id: "red", label: "Bordeaux", swatch: "#861f32", values: { baseColor: "#861f32" } },
  { id: "grey", label: "Hellgrau", swatch: "#b6b7b5", values: { baseColor: "#b6b7b5" } },
];

const beetle = [
  {
    ...lambo.find((group) => group.id === "paint"), materialNames: ["B-paint1"],
    choices: [
      { id: "original", label: "Original (Weiß)", swatch: "#ffffff", values: {} },
      ...lambo.find((group) => group.id === "paint").choices.slice(1),
    ],
  },
  { ...lambo.find((group) => group.id === "finish"), materialNames: ["B-paint1"] },
  {
    id: "interior-seats", section: "interior", label: "Sitzpolster", materialNames: ["B-seat1"],
    choices: [{ id: "original", label: "Original (Anthrazit)", swatch: "#343434", values: {} }, ...interiorColors],
  },
  {
    id: "interior-seat-accents", section: "interior", label: "Sitzakzente", materialNames: ["B-seat2"],
    choices: [{ id: "original", label: "Original (Grau)", swatch: "#696969", values: {} }, ...interiorColors],
  },
  {
    id: "interior-trim", section: "interior", label: "Innenverkleidung", materialNames: ["B-interior1", "B-interior2", "B-door1"],
    choices: [{ id: "original", label: "Original", swatch: "#555555", values: {} }, ...interiorColors],
  },
  {
    id: "interior-dashboard", section: "interior", label: "Armaturenbrett", materialNames: ["B-dash1"],
    choices: [{ id: "original", label: "Original (Anthrazit)", swatch: "#303030", values: {} }, ...interiorColors],
  },
];

module.exports = { lambo, beetle };
