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
    ],
  },
  {
    id: "finish", label: "Lackoberfläche", materialNames: ["car_paint_v3_03", "M_CarPaint"],
    choices: [
      { id: "original", label: "Original", values: {} },
      { id: "gloss", label: "Glänzend", values: { roughness: 0.18, metallic: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 } },
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

// All vehicles expose the same controls. The Urus GLB has separate materials
// for the rims, leather panels, headliner and belt webbing.
const urusMaterials = {
  paint: ["LLamborghini_UrusPHEVRewardRecycled_2024Paint_Material1"],
  finish: ["LLamborghini_UrusPHEVRewardRecycled_2024Paint_Material1"],
  wheels: ["Urus_WheelRim"],
  calipers: ["LLamborghini_UrusPHEVRewardRecycled_2024_CallipersCallip_0fc65a1"],
  "interior-leather": ["Urus_Leather"],
  "interior-alcantara": ["Urus_Alcantara"],
  "interior-belts": ["Urus_Seatbelt"],
};
const urus = lambo.map((group) => ({
  ...group,
  materialNames: urusMaterials[group.id],
  choices: group.choices.map((choice) => {
    if (group.id === "calipers" && choice.id === "original") {
      return { ...choice, label: "Original (Silber)", swatch: "#cccccc" };
    }
    // Dark atlas colours would otherwise multiply the selected colour.
    // Only the isolated configurable surface switches to its plain finish.
    if (choice.id !== "original" && ["wheels", "interior-alcantara", "interior-belts"].includes(group.id)) {
      return {
        ...choice,
        values: {
          ...choice.values, removeBaseColorTexture: true,
          ...(group.id === "interior-alcantara" ? { metallic: 0, roughness: 0.95 } : {}),
        },
      };
    }
    return choice;
  }),
}));

module.exports = { lambo, urus };
