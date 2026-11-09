// Fictional EUR demo prices in integer cents. Seed missing prices only.
module.exports = {
  lambo: {
    basePriceCents: 28500000,
    extras: {
      paint: { red: 150000, yellow: 180000, green: 220000, blue: 200000, white: 100000, black: 90000, grey: 140000 },
      finish: { gloss: 75000, satin: 175000, matte: 250000 },
      wheels: { black: 50000, silver: 75000, bronze: 120000 },
      calipers: { red: 35000, yellow: 35000, blue: 35000 },
      "interior-leather": { cream: 150000, cognac: 180000, red: 160000, grey: 120000 },
      "interior-alcantara": { grey: 90000, sand: 90000, blue: 90000 },
      "interior-belts": { red: 25000, yellow: 25000, orange: 25000, blue: 25000 },
    },
  },
  beetle: {
    basePriceCents: 3500000,
    extras: {
      paint: { red: 65000, yellow: 65000, green: 65000, blue: 65000, white: 65000, black: 65000, grey: 65000 },
      finish: { gloss: 25000, satin: 60000, matte: 85000 },
      "interior-seats": { cream: 90000, cognac: 90000, red: 90000, grey: 90000 },
      "interior-seat-accents": { cream: 25000, cognac: 25000, red: 25000, grey: 25000 },
      "interior-trim": { cream: 45000, cognac: 45000, red: 45000, grey: 45000 },
      "interior-dashboard": { cream: 35000, cognac: 35000, red: 35000, grey: 35000 },
    },
  },
};
