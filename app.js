// =============================================================================
// Configuration
// =============================================================================
const CONFIG = {
  api: {
    geocoding: 'https://geocoding-api.open-meteo.com/v1/search',
    forecast: 'https://api.open-meteo.com/v1/forecast',
  },
  storage: {
    cities: 'weather-cities-v1',
    range: 'weather-forecast-range',
  },
  search: {
    debounceMs: 300,
    maxResults: 5,
  },
  toast: {
    durationMs: 4000,
  },
  chart: {
    colors: [
      '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
      '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
    ],
  },
};

// =============================================================================
// DOM Elements
// =============================================================================
const addCityForm = document.getElementById("addCityForm");
const cityInput = document.getElementById("cityInput");
const searchResults = document.getElementById("searchResults");
const refreshAllBtn = document.getElementById("refreshAll");
const clearAllBtn = document.getElementById("clearAll");
const rangeToggle = document.getElementById("rangeToggle");
const dailyHead = document.getElementById("dailyHead");
const dailyBody = document.getElementById("dailyBody");
const mobileCards = document.getElementById("mobileCards");
const detailedAnalytics = document.getElementById("detailedAnalytics");
const chartToggle = document.getElementById("chartToggle");

// =============================================================================
// Weather Code Mapping
// =============================================================================
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

// =============================================================================
// State
// =============================================================================
let cities = loadCities();
let selectedRange = loadRange();
let chartInstance = null;
let currentChartMode = 'max';
let searchDebounceTimer = null;

const CHART_COLORS = CONFIG.chart.colors;

// =============================================================================
// Toast Notifications
// =============================================================================
function showToast(message, type = 'error') {
  const existing = document.getElementById('toast-container');
  if (existing) existing.remove();

  const colors = {
    error: 'bg-red-500',
    success: 'bg-green-500',
    info: 'bg-blue-500',
  };

  const container = document.createElement('div');
  container.id = 'toast-container';
  container.className = `fixed bottom-4 right-4 z-50 ${colors[type] || colors.info} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-fade-in`;
  container.innerHTML = `
    <span class="material-symbols-outlined text-lg">${type === 'error' ? 'error' : type === 'success' ? 'check_circle' : 'info'}</span>
    <span class="text-sm font-medium">${message}</span>
  `;

  document.body.appendChild(container);

  setTimeout(() => {
    container.classList.add('opacity-0', 'transition-opacity', 'duration-300');
    setTimeout(() => container.remove(), 300);
  }, CONFIG.toast.durationMs);
}

// =============================================================================
// Storage Functions
// =============================================================================
function saveCities() {
  localStorage.setItem(CONFIG.storage.cities, JSON.stringify(cities));
}

function loadCities() {
  const raw = localStorage.getItem(CONFIG.storage.cities);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((city) => city && typeof city === "object")
      .map((city) => {
        const name = typeof city.name === "string" ? city.name : "Unknown";
        const latitude = Number(city.latitude);
        const longitude = Number(city.longitude);
        const fallbackId = `${name.toLowerCase()}-${latitude}-${longitude}`;

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
  localStorage.setItem(CONFIG.storage.range, String(selectedRange));
}

function loadRange() {
  const raw = localStorage.getItem(CONFIG.storage.range);
  const parsed = Number(raw);
  if (parsed === 7 || parsed === 14) return parsed;
  return 7;
}

// =============================================================================
// Utility Functions
// =============================================================================
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function formatTempShort(value) {
  if (value === null || value === undefined) return "--";
  return `${Math.round(value)}°`;
}

function formatDateLabel(iso) {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

function formatPrecipProb(value) {
  if (value === null || value === undefined) return "0%";
  return `${value}% rain`;
}

function getRegionLabel(city) {
  if (!city || typeof city.region !== "string") return "";
  return city.region.split(",")[0].trim();
}

function getIconClass(code) {
  const info = weatherCodeMap.get(code);
  return info ? info.icon : "cloud";
}

function getColorClass(code) {
  if (code === 0 || code === 1) return "text-yellow-500";
  if (code >= 51 && code <= 67) return "text-blue-400";
  if (code >= 71) return "text-cyan-400";
  if (code >= 95) return "text-purple-500";
  return "text-[#617589]";
}

// =============================================================================
// API Functions
// =============================================================================
async function searchCity(query) {
  const url = `${CONFIG.api.geocoding}?name=${encodeURIComponent(query)}&count=${CONFIG.search.maxResults}&language=en&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("City search failed");
  const data = await response.json();
  return data.results || [];
}

function extractDaily(data) {
  if (!data || !data.daily || !data.daily.time) return null;
  return {
    time: data.daily.time,
    max: data.daily.temperature_2m_max || [],
    min: data.daily.temperature_2m_min || [],
    precipProb: data.daily.precipitation_probability_max || [],
    windMax: data.daily.wind_speed_10m_max || [],
    uv: data.daily.uv_index_max || [],
    codes: data.daily.weather_code || [],
  };
}

async function fetchWeather(city) {
  const url = `${CONFIG.api.forecast}?latitude=${city.latitude}&longitude=${city.longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,weather_code,wind_speed_10m_max&forecast_days=14&timezone=auto`;
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

// =============================================================================
// City Management
// =============================================================================
async function addCity(result) {
  // Case-insensitive duplicate check using lowercase name in ID
  const id = `${result.name.toLowerCase()}-${result.latitude}-${result.longitude}`;
  if (cities.some((city) => city.id === id)) {
    searchResults.innerHTML = "";
    searchResults.classList.add('hidden');
    cityInput.value = "";
    showToast(`${result.name} is already in your list`, 'info');
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

function removeCity(id) {
  const city = cities.find((c) => c.id === id);
  cities = cities.filter((c) => c.id !== id);
  saveCities();
  renderDailyTable();
  if (city) {
    showToast(`${city.name} removed`, 'success');
  }
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
    showToast(`Failed to load weather for ${city.name}`, 'error');
  }
}

async function refreshAll() {
  if (!cities.length) return;

  const icon = refreshAllBtn.querySelector('.material-symbols-outlined');
  icon.classList.add('animate-spin');

  const results = await Promise.allSettled(cities.map((city) => refreshCity(city.id)));
  const failures = results.filter((r) => r.status === 'rejected').length;

  icon.classList.remove('animate-spin');

  if (failures > 0) {
    showToast(`Failed to refresh ${failures} city(ies)`, 'error');
  }
}

// =============================================================================
// Search UI
// =============================================================================
function renderSearchResults(results) {
  searchResults.innerHTML = "";
  if (!results.length) {
    searchResults.innerHTML = '<div class="p-4 text-center text-[#617589] text-sm">No cities found</div>';
    searchResults.classList.remove('hidden');
    return;
  }
  searchResults.classList.remove('hidden');

  results.forEach((item) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex flex-col gap-1 border-b border-gray-100 dark:border-gray-700 last:border-0 transition-colors";
    card.dataset.action = "add-city";
    card.dataset.city = JSON.stringify(item);

    card.innerHTML = `
      <span class="text-sm font-medium text-[#111418] dark:text-white">${item.name}</span>
      <span class="text-xs text-[#617589] dark:text-gray-400">${item.country} · ${item.admin1 || ''}</span>
    `;

    searchResults.appendChild(card);
  });
}

async function performSearch(query) {
  if (!query) {
    searchResults.classList.add('hidden');
    return;
  }

  searchResults.innerHTML = '<div class="p-4 text-center"><div class="loader"></div></div>';
  searchResults.classList.remove('hidden');

  try {
    const results = await searchCity(query);
    renderSearchResults(results);
  } catch (err) {
    searchResults.innerHTML = '<div class="p-4 text-center text-red-500 text-sm">Search failed. Please try again.</div>';
    showToast('City search failed. Check your connection.', 'error');
  }
}

const debouncedSearch = debounce(performSearch, CONFIG.search.debounceMs);

// =============================================================================
// Chart
// =============================================================================
function setChartMode(mode) {
  currentChartMode = mode;

  // Update button states via event delegation target
  if (chartToggle) {
    chartToggle.querySelectorAll('button').forEach((btn) => {
      const isActive = btn.dataset.mode === mode;
      const activeClass = "bg-white dark:bg-gray-700 text-[#111418] dark:text-white shadow-sm";
      const inactiveClass = "text-[#617589] dark:text-gray-400 hover:text-[#111418] dark:hover:text-white";
      btn.className = `px-4 py-1.5 rounded-md text-sm font-bold transition-all ${isActive ? activeClass : inactiveClass}`;
    });
  }

  renderChart();
}

function renderChart() {
  const canvas = document.getElementById('weatherChart');
  if (!canvas) return;

  if (typeof Chart === 'undefined') {
    canvas.parentElement.innerHTML = `<p class="text-center text-red-500 py-10">Chart.js library not loaded. Check your connection.</p>`;
    return;
  }

  const ctx = canvas.getContext('2d');

  if (cities.length === 0) {
    if (chartInstance) chartInstance.destroy();
    chartInstance = null;
    return;
  }

  const reference = cities.find(c => c.weather?.daily?.time);
  if (!reference) return;

  const datasets = [];
  const modeConfig = {
    max: { key: "max", label: "Max Temp", yTitle: "Temperature (°C)" },
    min: { key: "min", label: "Min Temp", yTitle: "Temperature (°C)" },
    rain: { key: "precipProb", label: "Rain Probability", yTitle: "Rain Probability (%)" },
    wind: { key: "windMax", label: "Wind", yTitle: "Wind (km/h)" },
  };
  const config = modeConfig[currentChartMode] || modeConfig.max;

  const labels = reference.weather.daily.time.slice(0, selectedRange).map(formatDateLabel);

  cities.forEach((city, index) => {
    if (!city.weather || !city.weather.daily) return;

    const color = CONFIG.chart.colors[index % CONFIG.chart.colors.length];
    const values = city.weather.daily[config.key] || [];

    datasets.push({
      label: city.name,
      data: values.slice(0, selectedRange),
      borderColor: color,
      backgroundColor: color,
      borderWidth: 3,
      tension: 0.3,
      pointRadius: 2,
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
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { color: textColor } },
        tooltip: {
          backgroundColor: isDark ? '#1f2937' : '#ffffff',
          titleColor: isDark ? '#f3f4f6' : '#111827',
          bodyColor: isDark ? '#e5e7eb' : '#374151',
          borderColor: isDark ? '#374151' : '#e5e7eb',
          borderWidth: 1,
        },
      },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor } },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          grid: { color: gridColor },
          ticks: { color: textColor },
          title: { display: true, text: config.yTitle, color: textColor },
        },
      },
    },
  });
}

// =============================================================================
// Render Functions
// =============================================================================
function renderRangeToggle() {
  rangeToggle.querySelectorAll("input").forEach((input) => {
    input.checked = Number(input.dataset.range) === selectedRange;
  });
}

function renderDailyTable() {
  dailyHead.innerHTML = '<th class="px-6 py-4 text-[#111418] dark:text-white text-sm font-bold uppercase tracking-wider w-[200px] sticky left-0 z-10 bg-gray-50 dark:bg-gray-800">City</th><th class="px-6 py-4 text-[#111418] dark:text-white text-sm font-bold uppercase tracking-wider w-[120px]">Current</th>';
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
    renderDetailedAnalytics();
    return;
  }

  const reference = cities.find((city) => city.weather?.daily?.time?.length);
  const dates = reference?.weather?.daily?.time?.slice(0, selectedRange) || [];

  dates.forEach((date) => {
    const th = document.createElement("th");
    th.className = "px-4 py-4 text-[#111418] dark:text-white text-sm font-bold uppercase tracking-wider text-center";
    th.textContent = formatDateLabel(date);
    dailyHead.appendChild(th);
  });

  cities.forEach((city) => {
    const row = document.createElement("tr");
    row.className = "border-t border-[#dbe0e6] dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors group";

    const nameCell = document.createElement("td");
    nameCell.className = "px-6 py-5 sticky left-0 z-10 bg-white dark:bg-background-dark";
    nameCell.innerHTML = `
      <div class="flex flex-col">
        <span class="text-[#111418] dark:text-white font-bold text-lg flex items-center gap-2">
          ${city.name}
          <button class="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-500" data-action="remove-city" data-city-id="${city.id}">
            <span class="material-symbols-outlined text-lg">delete</span>
          </button>
        </span>
        <span class="text-[#617589] dark:text-gray-400 text-xs">${getRegionLabel(city)}</span>
      </div>
    `;
    row.appendChild(nameCell);

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

    const daily = city.weather?.daily;
    for (let i = 0; i < selectedRange; i++) {
      const cell = document.createElement("td");
      cell.className = "px-4 py-5";

      if (daily && daily.max && daily.max[i] !== undefined) {
        const max = Math.round(daily.max[i]);
        const min = Math.round(daily.min[i]);
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
  renderMobileCards();
  try {
    renderChart();
  } catch (e) {
    console.error("Chart render error:", e);
  }
}

function renderMobileCards() {
  mobileCards.innerHTML = "";

  if (!cities.length) {
    mobileCards.innerHTML = `
      <div class="p-8 text-center text-[#617589] dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border border-[#dbe0e6] dark:border-gray-700 shadow-sm">
        <div class="flex flex-col items-center gap-2">
          <span class="material-symbols-outlined text-4xl opacity-50">playlist_add</span>
          <p>Search and add cities to compare forecasts</p>
        </div>
      </div>
    `;
    return;
  }

  const reference = cities.find((city) => city.weather?.daily?.time?.length);
  const dates = reference?.weather?.daily?.time?.slice(0, selectedRange) || [];

  cities.forEach((city) => {
    const card = document.createElement("div");
    card.className = "bg-white dark:bg-gray-800 rounded-xl border border-[#dbe0e6] dark:border-gray-700 shadow-sm p-4 animate-fade-in";

    // Header
    const region = getRegionLabel(city);
    const currentInfo = weatherCodeMap.get(city.weather?.weatherCode) || { icon: "cloud" };
    const currentTemp = formatTempShort(city.weather?.temperature);
    const weatherColor = getColorClass(city.weather?.weatherCode);

    let dailyHtml = "";
    if (city.weather?.daily) {
      for (let i = 0; i < selectedRange; i++) {
        const date = dates[i];
        const max = Math.round(city.weather.daily.max[i]);
        const min = Math.round(city.weather.daily.min[i]);
        const prob = (city.weather.daily.precipProb && city.weather.daily.precipProb[i]) || 0;
        const code = (city.weather.daily.codes && city.weather.daily.codes[i]) || 0;
        const icon = getIconClass(code);
        const colorClass = getColorClass(code);
        const dayLabel = formatDateLabel(date); // e.g. "Mon"

        dailyHtml += `
          <div class="flex flex-col items-center gap-1 min-w-[60px] p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
            <span class="text-xs font-bold text-[#617589] dark:text-gray-400">${dayLabel}</span>
            <span class="material-symbols-outlined ${colorClass} text-xl">${icon}</span>
            <span class="text-xs font-bold text-[#111418] dark:text-white">${max}°</span>
            <span class="text-[10px] text-gray-500 dark:text-gray-400">${min}°</span>
            ${prob > 0 ? `<span class="text-[10px] text-blue-500 font-bold">${prob}%</span>` : ''}
          </div>
        `;
      }
    }

    card.innerHTML = `
      <div class="flex justify-between items-start mb-4">
        <div>
          <h3 class="text-lg font-bold text-[#111418] dark:text-white leading-tight">${city.name}</h3>
          <p class="text-xs text-[#617589] dark:text-gray-400">${region}</p>
        </div>
        <button class="text-red-400 hover:text-red-500 p-1" data-action="remove-city" data-city-id="${city.id}">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </div>

      <div class="flex items-center gap-3 mb-4">
        <span class="material-symbols-outlined text-4xl ${weatherColor}">${currentInfo.icon}</span>
        <div>
          <span class="text-3xl font-black text-[#111418] dark:text-white">${currentTemp}</span>
          <p class="text-sm text-[#617589] dark:text-gray-400 capitalize">${currentInfo.label}</p>
        </div>
      </div>

      <div class="flex overflow-x-auto gap-2 pb-2 -mx-4 px-4 scrollbar-hide">
        ${dailyHtml}
      </div>
    `;

    mobileCards.appendChild(card);
  });
}

function renderDetailedAnalytics() {
  detailedAnalytics.innerHTML = "";

  // Helper to calculate average of an array
  const calcAvg = (arr, range) => {
    if (!arr || arr.length === 0) return 0;
    const slice = arr.slice(0, range);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  };

  const selectedRange = document.querySelector('#rangeToggle input:checked')?.dataset.range || 7;

  // Helper to create a bar card
  const createBarCard = (title, icon, unit, getData, maxScale, colorClass = "bg-primary") => {
    const card = document.createElement("div");
    card.className = "flex flex-col gap-3 p-4 rounded-xl border border-[#dbe0e6] dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm";

    let content = "";
    if (cities.length > 0) {
      cities.forEach(city => {
        const value = getData(city);
        const pct = Math.min((Math.abs(value) / maxScale) * 100, 100);
        content += `
          <div class="space-y-2">
            <div class="flex justify-between text-xs font-bold uppercase tracking-wider text-[#617589]">
              <span>${city.name}</span>
              <span>${value}${unit}</span>
            </div>
            <div class="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div class="h-full ${colorClass}" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      });
    } else {
      content = `<p class="text-sm text-gray-400 text-center py-4">Add cities to see comparison</p>`;
    }

    card.innerHTML = `
      <div class="flex items-center justify-between">
        <p class="text-[#111418] dark:text-white font-bold">${title}</p>
        <span class="material-symbols-outlined text-primary">${icon}</span>
      </div>
      <div class="flex-1 flex flex-col justify-center gap-4 mt-2">${content}</div>
    `;
    return card;
  };

  // Max Temperature Card
  const maxTempCard = createBarCard(
    "Average Max Temperature",
    "thermostat",
    "°C",
    city => Math.round(calcAvg(city.weather?.daily?.max, selectedRange)),
    50,
    "bg-orange-500"
  );

  // Min Temperature Card
  const minTempCard = createBarCard(
    "Average Min Temperature",
    "ac_unit",
    "°C",
    city => Math.round(calcAvg(city.weather?.daily?.min, selectedRange)),
    40,
    "bg-blue-500"
  );

  // Rain Probability Card
  const rainCard = createBarCard(
    "Average Rain Probability",
    "water_drop",
    "%",
    city => Math.round(calcAvg(city.weather?.daily?.precipProb, selectedRange)),
    100,
    "bg-cyan-500"
  );

  // Wind Card
  const windCard = createBarCard(
    "Average Wind Speed",
    "air",
    " km/h",
    city => (city.weather && city.weather.windSpeed) || 0,
    50,
    "bg-primary"
  );

  // UV Card
  const uvCard = document.createElement("div");
  uvCard.className = "flex flex-col gap-3 p-4 rounded-xl border border-[#dbe0e6] dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm";

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

  const r = 56;
  const circumference = 2 * Math.PI * r;
  const uvMaxScale = 11;
  const uvPct = Math.min(maxUvVal / uvMaxScale, 1);
  const offset = circumference - (uvPct * circumference);

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

  detailedAnalytics.appendChild(maxTempCard);
  detailedAnalytics.appendChild(minTempCard);
  detailedAnalytics.appendChild(rainCard);
  detailedAnalytics.appendChild(windCard);
  detailedAnalytics.appendChild(uvCard);
}

// =============================================================================
// Event Listeners (Event Delegation)
// =============================================================================

// Search input with debounce
cityInput.addEventListener("input", (e) => {
  debouncedSearch(e.target.value.trim());
});

// Form submit (for Enter key)
addCityForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const query = cityInput.value.trim();
  if (query) performSearch(query);
});

// Event delegation for search results and table actions
document.addEventListener("click", async (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) {
    // Close search results when clicking outside
    if (!addCityForm.contains(e.target)) {
      searchResults.classList.add('hidden');
    }
    return;
  }

  const action = target.dataset.action;

  if (action === "add-city") {
    try {
      const cityData = JSON.parse(target.dataset.city);
      await addCity(cityData);
    } catch (err) {
      console.error(err);
      showToast("Failed to add city", "error");
    }
  }

  if (action === "remove-city") {
    const cityId = target.dataset.cityId;
    if (cityId) removeCity(cityId);
  }

  if (action === "chart-mode") {
    const mode = target.dataset.mode;
    if (mode) setChartMode(mode);
  }
});

// Chart toggle buttons
if (chartToggle) {
  chartToggle.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-mode]");
    if (btn) setChartMode(btn.dataset.mode);
  });
}

// Range toggle
rangeToggle.addEventListener("change", (e) => {
  if (e.target.name === "timeframe") {
    selectedRange = Number(e.target.dataset.range);
    saveRange();
    renderDailyTable();
  }
});

// Refresh button
refreshAllBtn.addEventListener("click", refreshAll);

// Clear button
clearAllBtn.addEventListener("click", () => {
  if (confirm("Remove all cities?")) {
    cities = [];
    saveCities();
    renderDailyTable();
    showToast("All cities cleared", "success");
  }
});

// =============================================================================
// Initialize
// =============================================================================
renderRangeToggle();
renderDailyTable();
if (cities.length) {
  refreshAll();
}
