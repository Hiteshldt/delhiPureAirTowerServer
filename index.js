require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());

// --- CONFIGURATION ---
const WAQI_TOKEN = process.env.WAQI_TOKEN; 

// ✅ FIX: Updated to 'A567673' to match your working URL
const STATION_ID = 'A567673'; 

// Coordinates for Delhi Airport (Used for Weather)
const LAT = '28.5627'; 
const LON = '77.1180';

// --- CACHE SETTINGS ---
// 15 Minutes for Pollution
const AQI_CACHE_DURATION = 15 * 60 * 1000; 
// 20 Seconds for Weather
const WEATHER_CACHE_DURATION = 20 * 1000;  

// --- MEMORY STORAGE ---
let aqiStorage = {
    value: null,
    pm25: null,
    pm10: null,
    co: null,
    no2: null,
    lastFetch: 0
};

let weatherStorage = {
    temp: null,
    humi: null,
    lastFetch: 0
};

// --- HELPER: Get IST Time ---
function getIST() {
    const now = new Date();
    const time = now.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true
    }).toUpperCase();
    
    const date = now.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric'
    });
    return { time, date };
}

app.get('/api/aqi', async (req, res) => {
    const now = Date.now();
    console.log(`\n[${new Date().toISOString()}] Incoming Request...`);

    try {
        // ===============================================
        // LOGIC 1: FETCH AQI (Only if 15 mins passed OR Data is missing)
        // ===============================================
        if (now - aqiStorage.lastFetch > AQI_CACHE_DURATION || !aqiStorage.value) {
            console.log("⚡ AQI Cache Expired (or empty). Fetching from WAQI...");
            try {
                // Using A567673 here
                const response = await axios.get(`https://api.waqi.info/feed/${STATION_ID}/?token=${WAQI_TOKEN}`, { timeout: 5000 });
                const data = response.data.data;
                
                if (response.data.status === 'ok') {
                    // Update Memory
                    aqiStorage.value = data.aqi;
                    // Safe check for pollutants
                    aqiStorage.pm25 = (data.iaqi && data.iaqi.pm25) ? data.iaqi.pm25.v : "N/A";
                    aqiStorage.pm10 = (data.iaqi && data.iaqi.pm10) ? data.iaqi.pm10.v : "N/A";
                    aqiStorage.co = (data.iaqi && data.iaqi.co) ? data.iaqi.co.v : "N/A";
                    aqiStorage.no2 = (data.iaqi && data.iaqi.no2) ? data.iaqi.no2.v : "N/A";
                    aqiStorage.lastFetch = now;
                    console.log(`✅ AQI Updated: ${aqiStorage.value}`);
                } else {
                    console.log("⚠️ API responded but status not ok:", response.data);
                }
            } catch (err) {
                console.error("⚠️ Failed to update AQI:", err.message);
            }
        } else {
            console.log("💾 Serving AQI from Cache");
        }

        // ===============================================
        // LOGIC 2: FETCH WEATHER (Only if 20 secs passed)
        // ===============================================
        if (now - weatherStorage.lastFetch > WEATHER_CACHE_DURATION || !weatherStorage.temp) {
            console.log("⚡ Weather Cache Expired. Fetching...");
            try {
                const response = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,relative_humidity_2m&timezone=Asia%2FKolkata`, { timeout: 3000 });
                const current = response.data.current;
                
                weatherStorage.temp = current.temperature_2m;
                weatherStorage.humi = current.relative_humidity_2m;
                weatherStorage.lastFetch = now;
                console.log(`✅ Weather Updated: ${weatherStorage.temp}°C`);
            } catch (err) {
                console.error("⚠️ Failed to update Weather:", err.message);
            }
        } else {
            console.log("💾 Serving Weather from Cache");
        }

        // ===============================================
        // LOGIC 3: ASSEMBLE & SEND
        // ===============================================
        const { time, date } = getIST();

        const aqi = aqiStorage.value ?? "N/A";
        const pm25 = aqiStorage.pm25 ?? "N/A";
        const pm10 = aqiStorage.pm10 ?? "N/A";
        const co = aqiStorage.co ?? "N/A";
        const no2 = aqiStorage.no2 ?? "N/A";
        const temp = weatherStorage.temp ?? "N/A";
        const humi = weatherStorage.humi ?? "N/A";

        res.json({
            aqi: aqi !== "N/A" ? `${aqi}` : "N/A",
            pm25: pm25 !== "N/A" ? `${pm25} µg/m³` : "N/A",
            pm10: pm10 !== "N/A" ? `${pm10} µg/m³` : "N/A",
            co: co !== "N/A" ? `${co} µg/m³` : "N/A",
            no2: no2 !== "N/A" ? `${no2} µg/m³` : "N/A",
            temp: temp !== "N/A" ? `${temp} °C` : "N/A",
            humi: humi !== "N/A" ? `${humi} %` : "N/A",
            time: time,
            date: date,
            message: "PureAir™ Cleans Air Equivalent to 25 Mature Trees - NHAI - CPA"
        });

    } catch (error) {
        console.error("🔥 Critical Error:", error.message);
        res.status(500).json({ error: "System Failure" });
    }
});

app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 SERVER STARTED on Port ${PORT}`);
    console.log(`📡 URL Config: .../feed/${STATION_ID}/...`);
    console.log(`=========================================`);
});
