const addCityForm = document.getElementById("addCityForm");
const cityInput = document.getElementById("cityInput");
const searchResults = document.getElementById("searchResults");
const refreshAllBtn = document.getElementById("refreshAll");
const clearAllBtn = document.getElementById("clearAll");
const rangeToggle = document.getElementById("rangeToggle");
const dailyHead = document.getElementById("dailyHead");
const dailyBody = document.getElementById("dailyBody");
const detailedAnalytics = document.getElementById("detailedAnalytics");

const STORAGE_KEY = "weather-cities-v1";
const RANGE_KEY = "weather-forecast-range";

const weatherCodeMap = new Map([
  [0, { label: "Clear sky", icon: "clear_day" }],
  [1, { label: "Mainly clear", icon: "partly_cloudy_day" }],
  [2, { label: "Partly cloudy", icon: "partly_cloudy_day" }],
  [3, { label: "Overcast", icon: "cloud" }],
  [45, { label: "Fog", icon: "foggy" }],
  [48, { label: "Rime fog", icon: "foggy" }],
  [51, { label: "Light drizzle", icon: "rainy_light" }],
  [53, { label: "Drizzle", icon: "rainy_light" }],
  [55, { label: "Dense drizzle", icon: "rainy" }],
  [56, { label: "Freezing drizzle", icon: "weather_mix" }],
  [57, { label: "Dense freezing drizzle", icon: "weather_mix" }],
  [61, { label: "Light rain", icon: "rainy_light" }],
  [63, { label: "Rain", icon: "rainy" }],
  [65, { label: "Heavy rain", icon: "rainy_heavy" }],
  [66, { label: "Freezing rain", icon: "weather_mix" }],
  [67, { label: "Heavy freezing rain", icon: "weather_mix" }],
  [71, { label: "Light snow", icon: "weather_snowy" }],
  [73, { label: "Snow", icon: "weather_snowy" }],
  [75, { label: "Heavy snow", icon: "snowing_heavy" }],
  [77, { label: "Snow grains", icon: "grain" }],
  [80, { label: "Rain showers", icon: "rainy" }],
  [81, { label: "Heavy showers", icon: "rainy_heavy" }],
  [82, { label: "Violent showers", icon: "rainy_heavy" }],
  [85, { label: "Snow showers", icon: "weather_snowy" }],
  [86, { label: "Heavy snow showers", icon: "snowing_heavy" }],
  [95, { label: "Thunderstorm", icon: "thunderstorm" }],
  [96, { label: "Thunderstorm w/ hail", icon: "thunderstorm" }],
  [99, { label: "Severe thunderstorm", icon: "thunderstorm" }],
]);

let cities = loadCities();
let selectedRange = loadRange();

function saveCities() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cities));
}

function loadCities() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Validate data structure (migration for older localStorage payloads)
    return parsed
      .filter((city) => city && typeof city === "object")
      .map((city) => {
      const name = typeof city.name === "string" ? city.name : "Unknown";
      const latitude = Number(city.latitude);
      const longitude = Number(city.longitude);
      const fallbackId = `${name}-${latitude}-${longitude}`;

      const admin1 = typeof city.admin1 === "string" ? city.admin1 : "";
      const country = typeof city.country === "string" ? city.country : "";
      const migratedRegion = [admin1, country].filter(Boolean).join(", ");

      const normalized = {
        ...city,
        id: city.id || fallbackId,
        name,
        latitude: Number.isFinite(latitude) ? latitude : 0,
        longitude: Number.isFinite(longitude) ? longitude : 0,
        region: typeof city.region === "string" ? city.region : migratedRegion,
      };

      if (city.weather && city.weather.daily) {
        const d = city.weather.daily;
        if (!d.precipProb || !d.uv || !d.codes || !d.windMax) {
          // Stale data detected, force refresh
          normalized.weather = null;
        }
      }
      return normalized;
    });
  } catch (err) {
    return [];
  }
}

function saveRange() {
  localStorage.setItem(RANGE_KEY, String(selectedRange));
}

function loadRange() {
  const raw = localStorage.getItem(RANGE_KEY);
  const parsed = Number(raw);
  if (parsed === 7 || parsed === 14) return parsed;
  return 7;
}

function formatTemp(value) {
  if (value === null || value === undefined) return "--";
  return Math.round(value);
}

function formatTempShort(value) {
  if (value === null || value === undefined) return "--";
  return `${Math.round(value)}°`;
}

function formatDateLabel(iso) {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    // day: "numeric", // Design shows just "Mon", "Tue" etc.
  });
}

function formatPrecip(value) {
  if (value === null || value === undefined || value === 0) return "0%";
  // Simple heuristic: if precip > 0.1mm, show % chance? 
  // API returns SUM in mm. Design shows "10% rain". 
  // OpenMeteo `precipitation_sum` is amount. `precipitation_probability_max` is percentage.
  // I should switch to probability or just show amount "5mm".
  // The design explicitly says "10% rain". I'll try to fetch probability instead of sum if I can, 
  // OR just render the sum as "X mm" for now to be accurate.
  // Let's use `precipitation_probability_max` for "Chance".
  return `${value.toFixed(1)}mm`;
}

function formatPrecipProb(value) {
  if (value === null || value === undefined) return "0%";
  return `${value}% rain`;
}

function getRegionLabel(city) {
  if (!city || typeof city.region !== "string") return "";
  return city.region.split(",")[0].trim();
}

function renderRangeToggle() {
  const inputs = rangeToggle.querySelectorAll("input");
  inputs.forEach((input) => {
    const range = Number(input.dataset.range);
    if (range === selectedRange) {
      input.checked = true;
    }
  });
}

function renderSearchResults(results) {
  searchResults.innerHTML = "";
  if (!results.length) {
    searchResults.classList.add('hidden');
    return;
  }
  searchResults.classList.remove('hidden');

  results.forEach((item) => {
    const card = document.createElement("button");
    card.type = "button"; // Prevent form submission
    card.className = "w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex flex-col gap-1 border-b border-gray-100 dark:border-gray-700 last:border-0 transition-colors";

    // Highlight matching part? simplified for now
    const name = `<span class="text-sm font-medium text-[#111418] dark:text-white">${item.name}</span>`;
    const meta = `<span class="text-xs text-[#617589] dark:text-gray-400">${item.country} · ${item.admin1 || ''}</span>`;

    card.innerHTML = name + meta;
    card.addEventListener("click", async () => {
      try {
        await addCity(item);
        searchResults.innerHTML = ""; // Clear on selection
        searchResults.classList.add('hidden');
      } catch (err) {
        console.error(err);
        searchResults.innerHTML = `<div class="p-4 text-center text-red-500 text-sm">Error adding city: ${err.message}</div>`;
      }
    });

    searchResults.appendChild(card);
  });
}

async function searchCity(query) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    query
  )}&count=5&language=en&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("City search failed");
  const data = await response.json();
  return data.results || [];
}

// Chart Global State
let chartInstance = null;
let currentChartMode = 'max'; // 'max' | 'min' | 'rain' | 'wind'

const CHART_COLORS = [
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
];

function extractDaily(data) {
  if (!data || !data.daily || !data.daily.time) return null;
  return {
    time: data.daily.time,
    max: data.daily.temperature_2m_max || [],
    min: data.daily.temperature_2m_min || [],
    precipProb: data.daily.precipitation_probability_max || [],
    windMax: data.daily.wind_speed_10m_max || [], // New field
    uv: data.daily.uv_index_max || [],
    codes: data.daily.weather_code || []
  };
}

async function fetchWeather(city) {
  // Added wind_speed_10m_max (daily)
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,weather_code,wind_speed_10m_max&forecast_days=14&timezone=auto`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Weather fetch failed");
  const data = await response.json();
  const current = data.current || {};

  return {
    temperature: current.temperature_2m ?? null,
    weatherCode: current.weather_code ?? null,
    windSpeed: current.wind_speed_10m ?? null,
    updated: current.time || null,
    daily: extractDaily(data),
  };
}

// ... existing helpers ...

function setChartMode(mode) {
  currentChartMode = mode;

  // Update buttons
  const btnMax = document.getElementById('btn-chart-max');
  const btnMin = document.getElementById('btn-chart-min');
  const btnRain = document.getElementById('btn-chart-rain');
  const btnWind = document.getElementById('btn-chart-wind');

  const activeClass = "bg-white dark:bg-gray-700 text-[#111418] dark:text-white shadow-sm";
  const inactiveClass = "text-[#617589] dark:text-gray-400 hover:text-[#111418] dark:hover:text-white";

  btnMax.className = `px-4 py-1.5 rounded-md text-sm font-bold transition-all ${mode === 'max' ? activeClass : inactiveClass}`;
  btnMin.className = `px-4 py-1.5 rounded-md text-sm font-bold transition-all ${mode === 'min' ? activeClass : inactiveClass}`;
  btnRain.className = `px-4 py-1.5 rounded-md text-sm font-bold transition-all ${mode === 'rain' ? activeClass : inactiveClass}`;
  btnWind.className = `px-4 py-1.5 rounded-md text-sm font-bold transition-all ${mode === 'wind' ? activeClass : inactiveClass}`;

  renderChart();
}
// Make accessible globally
window.setChartMode = setChartMode;

function renderChart() {
  const canvas = document.getElementById('weatherChart');
  if (!canvas) return;

  // Check if Chart.js is loaded
  if (typeof Chart === 'undefined') {
    const container = canvas.parentElement;
    container.innerHTML = `<p class="text-center text-red-500 py-10">Error: Chart.js library not loaded.</br>Please check your internet connection.</p>`;
    return;
  }

  const ctx = canvas.getContext('2d');

  // Check for data
  if (cities.length === 0) {
    if (chartInstance) chartInstance.destroy();
    return; // Empty state handles itself (blank) or we could show "Add cities" msg
  }

  const reference = cities.find(c => c.weather?.daily?.time);
  if (!reference) {
    // Data is loading or stale
    // We can't render the chart yet, but we shouldn't leave it blank if possible.
    // Let's rely on the fact that refreshAll call will follow up.
    // But for now, let's just Log it or ensure we don't crash.
    return;
  }

  // Prepare datasets
  const datasets = [];
  const modeConfig = {
    max: { key: "max", label: "Max Temp", yTitle: "Temperature (C)" },
    min: { key: "min", label: "Min Temp", yTitle: "Temperature (C)" },
    rain: { key: "precipProb", label: "Rain Probability", yTitle: "Rain Probability (%)" },
    wind: { key: "windMax", label: "Wind", yTitle: "Wind (km/h)" }
  };
  const config = modeConfig[currentChartMode] || modeConfig.max;

  // Labels from reference city
  const labels = reference.weather.daily.time.slice(0, selectedRange).map(t => formatDateLabel(t));

  cities.forEach((city, index) => {
    if (!city.weather || !city.weather.daily) return;

    const color = CHART_COLORS[index % CHART_COLORS.length];
    const daily = city.weather.daily;
    const dataLength = selectedRange;

    const values = daily[config.key] || [];
    datasets.push({
      label: city.name,
      data: values.slice(0, dataLength),
      borderColor: color,
      backgroundColor: color,
      borderWidth: 3,
      tension: 0.3,
      pointRadius: 2
    });
  });

  if (chartInstance) {
    chartInstance.destroy();
  }

  const isDark = document.documentElement.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches;
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
  const textColor = isDark ? '#e5e7eb' : '#374151';

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: textColor }
        },
        tooltip: {
          backgroundColor: isDark ? '#1f2937' : '#ffffff',
          titleColor: isDark ? '#f3f4f6' : '#111827',
          bodyColor: isDark ? '#e5e7eb' : '#374151',
          borderColor: isDark ? '#374151' : '#e5e7eb',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          grid: { color: gridColor },
          ticks: { color: textColor },
          title: {
            display: true,
            text: config.yTitle,
            color: textColor
          }
        }
      }
    }
  });
}

function getIconClass(code) {
  const info = weatherCodeMap.get(code);
  return info ? info.icon : "cloud";
}

function getColorClass(code) {
  // Simple color mapping based on code groups
  if (code === 0 || code === 1) return "text-yellow-500"; // Sunny
  if (code >= 51 && code <= 67) return "text-blue-400"; // Rain
  if (code >= 71) return "text-cyan-400"; // Snow
  if (code >= 95) return "text-purple-500"; // Thunder
  return "text-[#617589]"; // Cloud/Fog
}

function renderDailyTable() {
  dailyHead.innerHTML = '<th class="px-6 py-4 text-[#111418] dark:text-white text-sm font-bold uppercase tracking-wider w-[200px]">City</th><th class="px-6 py-4 text-[#111418] dark:text-white text-sm font-bold uppercase tracking-wider w-[120px]">Current</th>';
  dailyBody.innerHTML = "";

  if (!cities.length) {
    dailyBody.innerHTML = `
        <tr class="border-t border-[#dbe0e6] dark:border-gray-700">
            <td colspan="${selectedRange + 2}" class="px-6 py-8 text-center text-[#617589] dark:text-gray-400">
                <div class="flex flex-col items-center gap-2">
                    <span class="material-symbols-outlined text-4xl opacity-50">playlist_add</span>
                    <p>Search and add cities to compare forecasts</p>
                </div>
            </td>
        </tr>
    `;
    renderDetailedAnalytics(); // Clear analytics
    return;
  }

  // Generate Date Headers
  const reference = cities.find((city) => city.weather?.daily?.time?.length);
  const dates = reference?.weather?.daily?.time?.slice(0, selectedRange) || [];

  dates.forEach((date) => {
    const th = document.createElement("th");
    th.className = "px-4 py-4 text-[#111418] dark:text-white text-sm font-bold uppercase tracking-wider text-center";
    th.textContent = formatDateLabel(date);
    dailyHead.appendChild(th);
  });

  // Generate Rows
  cities.forEach((city) => {
    const row = document.createElement("tr");
    row.className = "border-t border-[#dbe0e6] dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors group";

    // 1. City Column
    const nameCell = document.createElement("td");
    nameCell.className = "px-6 py-5";
    nameCell.innerHTML = `
      <div class="flex flex-col">
        <span class="text-[#111418] dark:text-white font-bold text-lg flex items-center gap-2">
            ${city.name}
             <button class="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-500" onclick="removeCity('${city.id}')">
                <span class="material-symbols-outlined text-lg">delete</span>
             </button>
        </span>
        <span class="text-[#617589] dark:text-gray-400 text-xs">${getRegionLabel(city)}</span>
      </div>
    `;
    row.appendChild(nameCell);

    // 2. Current Column
    const currentInfo = weatherCodeMap.get(city.weather?.weatherCode) || { icon: "cloud" };
    const currentTemp = formatTempShort(city.weather?.temperature);

    const currentCell = document.createElement("td");
    currentCell.className = "px-6 py-5";
    currentCell.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="text-primary text-2xl font-black">${currentTemp}</span>
        <span class="material-symbols-outlined ${getColorClass(city.weather?.weatherCode)}">${currentInfo.icon}</span>
      </div>
    `;
    row.appendChild(currentCell);

    // 3. Daily Forecast Columns
    const daily = city.weather?.daily;
    for (let i = 0; i < selectedRange; i += 1) {
      const cell = document.createElement("td");
      cell.className = "px-4 py-5"; // Add sticky logic if needed, but Tailwind handles overflow better usually

      if (daily && daily.max && daily.max[i] !== undefined) {
        const max = Math.round(daily.max[i]);
        const min = Math.round(daily.min[i]);
        // Defensive access for new properties
        const prob = (daily.precipProb && daily.precipProb[i]) || 0;
        const code = (daily.codes && daily.codes[i]) || 0;
        const icon = getIconClass(code);
        const colorClass = getColorClass(code);

        cell.innerHTML = `
          <div class="flex flex-col items-center gap-1">
            <span class="material-symbols-outlined ${colorClass}">${icon}</span>
            <span class="text-sm font-bold text-[#111418] dark:text-white">${max}° / ${min}°</span>
            <span class="text-[10px] text-primary font-medium">${formatPrecipProb(prob)}</span>
          </div>
        `;
      } else {
        cell.innerHTML = `<span class="text-gray-300">--</span>`;
      }
      row.appendChild(cell);
    }
    dailyBody.appendChild(row);
  });

  renderDetailedAnalytics();
  try {
    renderChart();
  } catch (e) {
    console.error("Chart render error:", e);
  }
}

function renderDetailedAnalytics() {
  detailedAnalytics.innerHTML = "";

  // 1. Wind Card
  const windCard = document.createElement("div");
  windCard.className = "flex flex-col gap-3 p-4 rounded-xl border border-[#dbe0e6] dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm";

  let windContent = "";
  if (cities.length > 0) {
    cities.forEach(city => {
      const wind = (city.weather && city.weather.windSpeed) || 0;
      const pct = Math.min((wind / 50) * 100, 100);
      windContent += `
           <div class="space-y-2">
              <div class="flex justify-between text-xs font-bold uppercase tracking-wider text-[#617589]">
                  <span>${city.name}</span>
                  <span>${wind} km/h</span>
              </div>
              <div class="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div class="h-full bg-primary" style="width: ${pct}%"></div>
              </div>
            </div>
          `;
    });
  } else {
    windContent = `<p class="text-sm text-gray-400 text-center py-4">Add cities to see wind comparison</p>`;
  }

  windCard.innerHTML = `
     <div class="flex items-center justify-between">
       <p class="text-[#111418] dark:text-white font-bold">Average Wind Speeds</p>
       <span class="material-symbols-outlined text-primary">air</span>
     </div>
     <div class="flex-1 flex flex-col justify-center gap-4 mt-2">
       ${windContent}
     </div>
  `;

  // 2. UV Card (SVG Gauge)
  const uvCard = document.createElement("div");
  uvCard.className = "flex flex-col gap-3 p-4 rounded-xl border border-[#dbe0e6] dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm";

  // Find max UV city
  let maxUvCity = null;
  let maxUvVal = -1;

  if (cities.length > 0) {
    cities.forEach(city => {
      const dailyUV = city.weather?.daily?.uv || [];
      const uv = dailyUV.length > 0 ? dailyUV[0] : 0;
      if (uv > maxUvVal) {
        maxUvVal = uv;
        maxUvCity = city;
      }
    });
  }

  if (maxUvVal === -1) maxUvVal = 0;

  // Gauge Calculations
  const r = 56;
  const circumference = 2 * Math.PI * r; // ~351.85
  const uvMaxScale = 11; // UV index standard max
  const uvPct = Math.min(maxUvVal / uvMaxScale, 1);
  const offset = circumference - (uvPct * circumference);

  // Color logic
  let uvColor = "text-green-500";
  let riskLabel = "Low";

  if (maxUvVal > 2) { uvColor = "text-yellow-500"; riskLabel = "Moderate"; }
  if (maxUvVal > 5) { uvColor = "text-orange-500"; riskLabel = "High"; }
  if (maxUvVal > 7) { uvColor = "text-red-500"; riskLabel = "Very High"; }
  if (maxUvVal > 10) { uvColor = "text-purple-500"; riskLabel = "Extreme"; }

  const cityName = maxUvCity ? maxUvCity.name : "--";
  const desc = maxUvCity ? `Peak solar radiation in ${cityName} today.` : "Add cities to see UV exposure.";

  uvCard.innerHTML = `
      <div class="flex items-center justify-between">
          <p class="text-[#111418] dark:text-white font-bold">Max UV Exposure</p>
          <span class="material-symbols-outlined text-primary">light_mode</span>
      </div>
      <div class="flex-1 flex flex-col items-center justify-center">
          <div class="relative flex items-center justify-center">
              <svg class="w-32 h-32 transform -rotate-90">
                  <circle class="text-gray-100 dark:text-gray-700" cx="64" cy="64" fill="transparent" r="56" stroke="currentColor" stroke-width="8"></circle>
                  <circle class="${uvColor} transition-all duration-1000 ease-out" cx="64" cy="64" fill="transparent" r="56" stroke="currentColor" stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" stroke-width="8"></circle>
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center">
                  <span class="text-3xl font-black text-[#111418] dark:text-white">${maxUvVal}</span>
                  <span class="text-[10px] uppercase font-bold text-[#617589]">${riskLabel}</span>
              </div>
          </div>
          <p class="mt-4 text-center text-xs text-[#617589] dark:text-gray-400 px-4">${desc}</p>
      </div>
  `;

  detailedAnalytics.appendChild(windCard);
  detailedAnalytics.appendChild(uvCard);
}


function removeCity(id) {
  cities = cities.filter((city) => city.id !== id);
  saveCities();
  renderDailyTable();
}

// Make removeCity global so onClick inline works
window.removeCity = removeCity;

async function addCity(result) {
  const id = `${result.name}-${result.latitude}-${result.longitude}`;
  if (cities.some((city) => city.id === id)) {
    searchResults.innerHTML = "";
    searchResults.classList.add('hidden');
    cityInput.value = "";
    return;
  }

  const city = {
    id,
    name: result.name,
    region: [result.admin1, result.country].filter(Boolean).join(", "),
    latitude: result.latitude,
    longitude: result.longitude,
    weather: null,
  };

  cities.unshift(city);
  saveCities();
  searchResults.innerHTML = "";
  searchResults.classList.add('hidden');
  cityInput.value = "";
  renderDailyTable();
  await refreshCity(city.id);
}

async function refreshCity(id) {
  const city = cities.find((item) => item.id === id);
  if (!city) return;
  try {
    city.weather = await fetchWeather(city);
    saveCities();
    renderDailyTable();
  } catch (err) {
    city.weather = null;
    renderDailyTable();
  }
}

async function refreshAll() {
  if (!cities.length) return;
  // Visual feedback on button?
  refreshAllBtn.querySelector('.material-symbols-outlined').classList.add('animate-spin');
  try {
    await Promise.all(cities.map((city) => refreshCity(city.id)));
  } finally {
    refreshAllBtn.querySelector('.material-symbols-outlined').classList.remove('animate-spin');
  }
}

addCityForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = cityInput.value.trim();
  if (!query) return;

  searchResults.innerHTML = '<div class="p-4 text-center"><div class="loader"></div></div>';
  searchResults.classList.remove('hidden');

  try {
    const results = await searchCity(query);
    renderSearchResults(results);
  } catch (err) {
    searchResults.innerHTML = '<div class="p-4 text-center text-red-500 text-sm">Search failed.</div>';
  }
});

// Input debounce for search (optional, better UX than submit only?) 
// Sticking to submit for now to match strict existing logic but the form UX expects it.

rangeToggle.addEventListener("change", (event) => {
  if (event.target.name === "timeframe") {
    selectedRange = Number(event.target.dataset.range);
    saveRange();
    // No need to re-render range toggle as input is already checked by user interaction
    renderDailyTable();
  }
});

refreshAllBtn.addEventListener("click", () => {
  refreshAll();
});

clearAllBtn.addEventListener("click", () => {
  if (confirm('Remove all cities?')) {
    cities = [];
    saveCities();
    renderDailyTable();
  }
});

// Click outside to close search results
document.addEventListener('click', (e) => {
  if (!addCityForm.contains(e.target)) {
    searchResults.classList.add('hidden');
  }
});

// Initial Render
renderRangeToggle();
renderDailyTable();
if (cities.length) {
  refreshAll();
}

