const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SERVICE_NAME = "productinfo";

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: SERVICE_NAME });
});

// TODO: Fachliche Routen des Service hier ergänzen

app.listen(PORT, () => {
  console.log(`[${SERVICE_NAME}] läuft auf Port ${PORT}`);
});
