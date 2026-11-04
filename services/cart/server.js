/**
 * Microservice: cart
 * -------------------
 * Minimales Gerüst. Fachlogik und Routen kommen hier rein.
 * Liefert ausschließlich JSON (keine Views!). Lauscht intern auf Port 3000
 * und wird nur über das API Gateway (/api/cart/...) angesprochen.
 */

const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SERVICE_NAME = "cart";

// Health-Check – vom Gateway / Compose nutzbar
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: SERVICE_NAME });
});

// TODO: Fachliche Routen des Service hier ergänzen

app.listen(PORT, () => {
  console.log(`[${SERVICE_NAME}] läuft auf Port ${PORT}`);
});
