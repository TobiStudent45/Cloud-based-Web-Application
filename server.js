const express = require("express");
const app = express();
const layouts = require("express-ejs-layouts");

app.use(layouts);
app.set("layout","mainLayout.ejs");
var carsArray = [
  {
    id: "aetheria-apex",
    brand: "Aetheria Dynamics",
    model: "Apex One",
    bodyType: "Hypercar",
    basePrice: 2450000,
    engineOptions: [
      { name: "V12 Quad-Turbo Hybrid (1.200 PS)", price: 0 },
      { name: "V12 Bi-Turbo + Triple-Electric (1.600 PS)", price: 380000 },
      { name: "Apex Track-Spec Full Electric (1.920 PS / 2.000 Nm)", price: 620000 }
    ],
    colors: [
      { name: "Stardust Carbon Black (Sichtcarbon)", hex: "#0a0a0c", price: 0 },
      { name: "Liquid Platinum Pearl", hex: "#e2e8f0", price: 45000 },
      { name: "Nebula Crimson Metallic", hex: "#7d0a21", price: 58000 },
      { name: "Aether Emerald Satin", hex: "#0b3c2d", price: 62000 }
    ],
    wheels: [
      { name: "20/21 Zoll Schmiedefelgen mit Zentralverschluss", price: 0 },
      { name: "21/22 Zoll Aero-Magnesium Räder", price: 68000 },
      { name: "21/22 Zoll Voll-Carbon Turbofan Räder", price: 115000 }
    ],
    interiors: [
      { name: "Alcantara Carbon-Mono Titanium Schwarz", price: 0 },
      { name: "Anilinleder 'Vesper Red' mit Titan-Akzenten", price: 52000 },
      { name: "Bespoke Hermès-Leder nach Kundenwunsch", price: 135000 }
    ],
    packages: [
      { id: "p1", name: "Aerodynamik Track Paket (Aktiver Heckflügel, Ground-Effect-Diffusor)", price: 185000 },
      { id: "p2", name: "Carbon-Keramik Titan Bremsanlage", price: 74000 },
      { id: "p3", name: "Telemetrie- & Rennstrecken-Paket inkl. Boxenfunk", price: 32000 },
      { id: "p4", name: "24k Gold Hitzeschild im Motorraum (McLaren F1 Style)", price: 95000 }
    ],
    specs: {
      acceleration: "1.9s (0-100 km/h)",
      topSpeed: "412 km/h",
      range: "Hybrid / 450 km",
      driveTrain: "Allrad mit Torque Vectoring"
    }
  },
  {
    id: "aetheria-chronos",
    brand: "Aetheria Dynamics",
    model: "Chronos SUV",
    bodyType: "Ultra-Luxus Performance SUV",
    basePrice: 420000,
    engineOptions: [
      { name: "V8 Bi-Turbo Mild-Hybrid (680 PS)", price: 0 },
      { name: "V8 Plug-in Hybrid Performance (850 PS)", price: 75000 },
      { name: "V12 Bi-Turbo Sovereign Edition (920 PS)", price: 165000 }
    ],
    colors: [
      { name: "Midnight Obsidian Uni", hex: "#121316", price: 0 },
      { name: "Frozen Champagne Gold Matte", hex: "#a89878", price: 28000 },
      { name: "Royal Sapphire Metallic", hex: "#0d2b45", price: 22000 },
      { name: "Nardo Alpine Gray Satin", hex: "#5a626a", price: 24000 }
    ],
    wheels: [
      { name: "22 Zoll Forged Luxury-Discs", price: 0 },
      { name: "23 Zoll Diamond-Cut Multi-Spoke", price: 18500 },
      { name: "24 Zoll Custom Floating-Cap Carbon Felgen", price: 36000 }
    ],
    interiors: [
      { name: "Semi-Anilinleder Crema / Schwarz", price: 0 },
      { name: "Pied-de-Poule Stoff & Merino Vollleder", price: 24000 },
      { name: "Kashmir-Wolle & Echtholz-Flusslauf Dekor", price: 48000 }
    ],
    packages: [
      { id: "p1", name: "Sovereign First-Class Fond (Einzelsitze mit Massage & Champagner-Kühler)", price: 62000 },
      { id: "p2", name: "Acoustic Glass & 3D Bespoke Audio System (32 Lautsprecher)", price: 29000 },
      { id: "p3", name: "Panoramadach mit Dimmbarem Elektrochrom-Glas & Sternenhimmel", price: 38000 },
      { id: "p4", name: "Offroad & Terrain-Lift Adaptive Air Suspension", price: 19500 }
    ],
    specs: {
      acceleration: "3.1s (0-100 km/h)",
      topSpeed: "310 km/h",
      range: "12.8 l/100km",
      driveTrain: "Allrad (Intelligent AWD)"
    }
  },
  {
    id: "aetheria-celeste",
    brand: "Aetheria Dynamics",
    model: "Celeste GT",
    bodyType: "Grand Tourer Coupe",
    basePrice: 680000,
    engineOptions: [
      { name: "V12 Saugmotor (780 PS)", price: 0 },
      { name: "V12 Bi-Turbo Gran Turismo (900 PS)", price: 110000 }
    ],
    colors: [
      { name: "Verde Montecarlo Metallic", hex: "#004731", price: 0 },
      { name: "Aetheria Monaco Blue", hex: "#00204a", price: 26000 },
      { name: "Rosso Corsa Satin", hex: "#8b0000", price: 31000 },
      { name: "Titanium Silver Pearl", hex: "#8f999f", price: 21000 }
    ],
    wheels: [
      { name: "21 Zoll Classic Mesh-Design", price: 0 },
      { name: "21/22 Zoll Polierte Schmiederäder", price: 22500 },
      { name: "22 Zoll Leichtbau Carbon-Speichen", price: 42000 }
    ],
    interiors: [
      { name: "Leder Saddle Tan / Cognac", price: 0 },
      { name: "Leder Deep Navy Blue mit Kontrastnaht", price: 19000 },
      { name: "Nappa Leather 'Lusso White' & Gebürstetes Aluminium", price: 34000 }
    ],
    packages: [
      { id: "p1", name: "Bespoke Luggage Set (Passgenaues 5-teiliges Leder-Kofferset)", price: 28000 },
      { id: "p2", name: "Titan-Auspuffanlage mit variabler Klappensteuerung", price: 24500 },
      { id: "p3", name: "Carbon-Exterieurpaket (Frontsplitter, Seitenschweller, Heckdiffusor)", price: 42000 },
      { id: "p4", name: "Night Vision Assistent mit Fußgänger-Erkennung", price: 16000 }
    ],
    specs: {
      acceleration: "2.8s (0-100 km/h)",
      topSpeed: "345 km/h",
      range: "14.2 l/100km",
      driveTrain: "Heckantrieb mit e-LSD"
    }
  }
];
app.get("/configurator", function (req,res){
res.render("configurator.ejs",{
list : carsArray
});
});
app.get("/", function (req,res){
res.render("home.ejs",{
list : carsArray
});
});
app.get("/merchandise", function (req,res){
res.render("merchandise.ejs",{
list : carsArray
});
});
app.get("/impressions", function (req,res){
res.render("impressions.ejs",{
list : carsArray
});
});
app.get("/road2supercar", function (req,res){
res.render("road2supercar.ejs",{
list : carsArray
});
});
app.get("/you", function (req,res){
res.render("you.ejs",{
list : carsArray
});
});
app.listen(80);
console.log("App listening on port 80");