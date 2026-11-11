// ai microservice (stub): JSON only, internal port 3000, reached through the gateway at /api/ai.

const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SERVICE_NAME = "ai";

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: SERVICE_NAME });
});

app.listen(PORT, () => {
  console.log(`[${SERVICE_NAME}] läuft auf Port ${PORT}`);
});
