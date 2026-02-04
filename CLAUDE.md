# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SkyCast is a weather comparison web application that allows users to search for cities and compare weather forecasts. It's a client-side only application with no build process.

## Running the Application

Open `index.html` directly in a browser, or serve it with any static file server:
```bash
npx serve .
# or
python -m http.server
```

## Architecture

**Static frontend with no build step** - Three files only:
- `index.html` - Main entry point with Tailwind CSS (via CDN) and inline configuration
- `app.js` - All application logic (vanilla JavaScript)
- `style.css` - CSS custom properties and component styles (partially unused, Tailwind handles most styling)

**External APIs used:**
- Open-Meteo Geocoding API (`geocoding-api.open-meteo.com`) - City search
- Open-Meteo Forecast API (`api.open-meteo.com`) - Weather data (14-day forecasts)

**State management:**
- Cities and forecast range stored in `localStorage` (`weather-cities-v1`, `weather-forecast-range`)
- Weather data cached on city objects and persisted to localStorage

**Key data structures in app.js:**
- `cities` array - Each city has `id`, `name`, `region`, `latitude`, `longitude`, `weather`
- `weatherCodeMap` - Maps Open-Meteo weather codes to labels and Material Icons
- `extractDaily()` - Normalizes API response into `{time, max, min, precipProb, windMax, uv, codes}`

**Chart.js integration:**
- Single chart instance (`chartInstance`) with two modes: temperature or rain/wind
- `setChartMode()` toggles between display modes and re-renders
