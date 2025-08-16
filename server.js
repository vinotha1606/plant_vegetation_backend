const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const ee = require('@google/earthengine');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Read service account from env (one-line JSON)
const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT);

// ✅ Authenticate and initialize Earth Engine with the env key
ee.data.authenticateViaPrivateKey(
  serviceAccount,
  () => {
    ee.initialize(null, null, () => {
      console.log('✅ Earth Engine initialized');
    }, (err) => {
      console.error('❌ Initialization error:', err);
    });
  },
  (err) => {
    console.error('❌ Authentication error:', err);
  }
);

app.post("/get-ndvi", async (req, res) => {
  const { lat, lon } = req.body;
  if (!lat || !lon) return res.status(400).json({ error: "lat and lon are required" });

  try {
    const point = ee.Geometry.Point([lon, lat]);

    const image = ee.ImageCollection('COPERNICUS/S2_HARMONIZED')
      .filterBounds(point)
      .filterDate('2024-01-01', '2024-12-31')
      .sort('CLOUDY_PIXEL_PERCENTAGE')
      .first();

    const ndvi = image.normalizedDifference(['B8', 'B4']); // band name will be 'nd'

    ndvi.reduceRegion({
      reducer: ee.Reducer.first(),
      geometry: point,
      scale: 10,
      maxPixels: 1e9
    }).getInfo((result, err) => {
      if (err) {
        console.error("❌ Earth Engine getInfo error:", err);
        return res.status(500).json({ error: "Failed to compute NDVI", details: err.message });
      }

      const ndviValue = result && result.nd;

      if (ndviValue === null || ndviValue === undefined) {
        return res.status(200).json({ lat, lon, message: "Band values not available (clouds/no image)" });
      }

      let vegetationStatus = "";
      if (ndviValue < 0.3) vegetationStatus = "Low vegetation";
      else if (ndviValue < 0.5) vegetationStatus = "Moderate vegetation";
      else vegetationStatus = "Healthy vegetation";

      const gmapsLink = `https://www.google.com/maps?q=${lat},${lon}`;

      res.json({
        lat,
        lon,
        NDVI: ndviValue.toFixed(3),
        VegetationStatus: vegetationStatus,
        GoogleMapsLink: gmapsLink
      });
    });

  } catch (error) {
    console.error("❌ SERVER ERROR:", error);
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

app.get('/', (req, res) => {
  res.send('Backend is running!');
});

// ✅ Use Railway's assigned port
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
app.listen(5000, () => console.log("Server running on http://localhost:5000"));

