# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SkyCast is a weather comparison web application that allows users to search for cities and compare weather forecasts.

## Build Commands

```bash
npm install          # Install dependencies
npm run build        # Build minified CSS for production
npm run dev          # Watch mode for development
```

## Running Locally

After building, open `index.html` in a browser or serve with:
```bash
npx serve .
```

## Architecture

**Static frontend with Tailwind CSS build step:**
- `index.html` - Main entry point
- `app.js` - All application logic (vanilla JavaScript)
- `src/input.css` - Tailwind directives and custom CSS
- `dist/output.css` - Built CSS (generated, do not edit)
- `tailwind.config.js` - Tailwind theme configuration

**External APIs:**
- Open-Meteo Geocoding API (`geocoding-api.open-meteo.com`) - City search
- Open-Meteo Forecast API (`api.open-meteo.com`) - Weather data (14-day forecasts)

**Key patterns in app.js:**
- `CONFIG` object at top centralizes API URLs and settings
- `showToast()` for user feedback on errors/success
- Event delegation via `data-action` attributes (no global functions)
- Debounced live search (300ms)
- Cities stored in localStorage (`weather-cities-v1`)

**Deployment:**
- Hosted on Vercel with auto-deploy from GitHub
- Vercel runs `npm run build` automatically
