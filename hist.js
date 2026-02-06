// =============================================================================
// Configuration
// =============================================================================
const CONFIG = {
  api: {
    geocoding: 'https://geocoding-api.open-meteo.com/v1/search',
    archive: 'https://archive-api.open-meteo.com/v1/archive',
  },
  storage: {
    cities: 'hist-cities-v1',
    dates: 'hist-dates-v1',
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
const startDateInput = document.getElementById("startDate");
const numDaysInput = document.getElementById("numDays");
const dateRangePreview = document.getElementById("dateRangePreview");
const fetchHistoricalBtn = document.getElementById("fetchHistorical");
const selectedCities = document.getElementById("selectedCities");
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
  [58, { label: "Light rain", icon: "rainy_light" }],
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
let dateRange = loadDateRange();
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

        return {
          ...city,
          id: city.id || fallbackId,
          name,
          latitude: Number.isFinite(latitude) ? latitude : 0,
          longitude: Number.isFinite(longitude) ? longitude : 0,
          region: typeof city.region === "string" ? city.region : migratedRegion,
        };
      });
  } catch (err) {
    return [];
  }
}

function saveDateRange() {
  localStorage.setItem(CONFIG.storage.dates, JSON.stringify(dateRange));
}

function loadDateRange() {
  const raw = localStorage.getItem(CONFIG.storage.dates);
  if (!raw) {
    // Default to 30 days back from today
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return {
      start: start.toISOString().split('T')[0],
      numDays: 30,
    };
  }
  try {
    const parsed = JSON.parse(raw);
    // Migrate old format (start + end) to new format (start + numDays)
    if (parsed.end) {
      const start = new Date(parsed.start);
      const end = new Date(parsed.end);
      const diffTime = Math.abs(end - start);
      const numDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return {
        start: parsed.start,
        numDays: numDays || 30,
      };
    }
    return parsed;
  } catch (err) {
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return {
      start: start.toISOString().split('T')[0],
      numDays: 30,
    };
  }
}

function calculateEndDate() {
  const start = new Date(dateRange.start);
  const end = new Date(start);
  end.setDate(end.getDate() + parseInt(dateRange.numDays) - 1);
  return end.toISOString().split('T')[0];
}

function formatDateDisplay(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function updateDateRangePreview() {
  const startDate = dateRange.start;
  const endDate = calculateEndDate();
  dateRangePreview.textContent = `${formatDateDisplay(startDate)} \u2013 ${formatDateDisplay(endDate)}`;
}

// Convert YYYY-MM-DD to DD/MM/YYYY for display
function isoToDisplay(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Parse DD/MM/YYYY to YYYY-MM-DD, returns null if invalid
function parseDisplayDate(text) {
  const match = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
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

function formatDateLabel(iso) {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getRegionLabel(city) {
  if (!city || typeof city.region !== "string") return "";
  return city.region.split(",")[0].trim();
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
    precipSum: data.daily.precipitation_sum || [],
    windMax: data.daily.wind_speed_10m_max || [],
    uv: data.daily.uv_index_max || [],
    codes: data.daily.weather_code || [],
  };
}

async function fetchHistoricalWeather(city, startDate, endDate) {
  const url = `${CONFIG.api.archive}?latitude=${city.latitude}&longitude=${city.longitude}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,uv_index_max,weather_code&timezone=auto`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Historical weather fetch failed");
  const data = await response.json();

  return {
    daily: extractDaily(data),
  };
}

// =============================================================================
// City Management
// =============================================================================
async function addCity(result) {
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
  renderSelectedCities();
}

function removeCity(id) {
  const city = cities.find((c) => c.id === id);
  cities = cities.filter((c) => c.id !== id);
  saveCities();
  renderSelectedCities();
  if (city) {
    showToast(`${city.name} removed`, 'success');
    renderChart();
    renderDetailedAnalytics();
  }
}

async function refreshAll() {
  if (!cities.length) return;
  if (!dateRange.start || !dateRange.numDays) {
    showToast('Please select a start date and number of days', 'error');
    return;
  }

  const icon = refreshAllBtn.querySelector('.material-symbols-outlined');
  icon.classList.add('animate-spin');

  const endDate = calculateEndDate();

  const results = await Promise.allSettled(
    cities.map((city) => fetchCityWeather(city, endDate))
  );
  const failures = results.filter((r) => r.status === 'rejected').length;

  icon.classList.remove('animate-spin');

  if (failures > 0) {
    showToast(`Failed to refresh ${failures} city(ies)`, 'error');
  } else {
    renderChart();
    renderDetailedAnalytics();
  }
}

async function fetchCityWeather(city, endDate) {
  try {
    city.weather = await fetchHistoricalWeather(city, dateRange.start, endDate);
    saveCities();
  } catch (err) {
    city.weather = null;
    throw err;
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

  searchResults.innerHTML = '<div class="p-4 text-center text-[#617589] text-sm">Searching...</div>';
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
// Render Functions
// =============================================================================
function renderSelectedCities() {
  selectedCities.innerHTML = "";

  if (!cities.length) {
    selectedCities.innerHTML = `
      <div class="w-full text-center text-[#617589] dark:text-gray-400 py-4">
        <p>Search and add cities to view historical data</p>
      </div>
    `;
    return;
  }

  cities.forEach((city) => {
    const tag = document.createElement("div");
    tag.className = "flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-[#dbe0e6] dark:border-gray-700 shadow-sm";
    tag.innerHTML = `
      <span class="text-[#111418] dark:text-white font-medium">${city.name}</span>
      <span class="text-xs text-[#617589] dark:text-gray-400">${getRegionLabel(city)}</span>
      <button class="text-red-400 hover:text-red-500 ml-1" data-action="remove-city" data-city-id="${city.id}">
        <span class="material-symbols-outlined text-lg">close</span>
      </button>
    `;
    selectedCities.appendChild(tag);
  });
}

// =============================================================================
// Chart
// =============================================================================
function setChartMode(mode) {
  currentChartMode = mode;

  if (chartToggle) {
    chartToggle.querySelectorAll('button').forEach((btn) => {
      const isActive = btn.dataset.mode === mode;
      const activeClass = "bg-white dark:bg-gray-700 text-[#111418] dark:text-white shadow-sm";
      const inactiveClass = "text-[#617589] dark:text-gray-400 hover:text-[#111418] dark:hover:text-white";
      btn.className = `px-2 md:px-4 py-1.5 rounded-md text-xs md:text-sm font-bold transition-all ${isActive ? activeClass : inactiveClass}`;
    });
  }

  renderChart();
}

function setChartPlaceholder(message) {
  const container = document.querySelector('#weatherChart')?.parentElement;
  if (!container) return;
  if (!document.getElementById('weatherChart')) {
    container.innerHTML = `<canvas id="weatherChart" class="w-full max-h-[400px]"></canvas>`;
  }
}

function renderChart() {
  const container = document.querySelector('.canvas-container') || document.getElementById('weatherChart')?.parentElement;
  if (!container) return;

  // Ensure canvas exists
  if (!document.getElementById('weatherChart')) {
    container.innerHTML = `<canvas id="weatherChart" class="w-full max-h-[400px]"></canvas>`;
  }

  const canvas = document.getElementById('weatherChart');
  if (!canvas) return;

  if (typeof Chart === 'undefined') {
    console.error('Chart.js not loaded');
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (cities.length === 0) {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    return;
  }

  const reference = cities.find(c => c.weather?.daily?.time);
  if (!reference) {
    return;
  }

  const datasets = [];
  const modeConfig = {
    max: { key: "max", label: "Max Temp", yTitle: "Temperature (°C)" },
    min: { key: "min", label: "Min Temp", yTitle: "Temperature (°C)" },
    rain: { key: "precipSum", label: "Precipitation", yTitle: "Precipitation (mm)" },
    wind: { key: "windMax", label: "Wind", yTitle: "Wind (km/h)" },
  };
  const config = modeConfig[currentChartMode] || modeConfig.max;

  const labels = reference.weather.daily.time.map(formatDateLabel);

  cities.forEach((city, index) => {
    if (!city.weather || !city.weather.daily) return;

    const color = CONFIG.chart.colors[index % CONFIG.chart.colors.length];
    const values = city.weather.daily[config.key] || [];

    datasets.push({
      label: city.name,
      data: values,
      borderColor: color,
      backgroundColor: color,
      borderWidth: 3,
      tension: 0.3,
      pointRadius: labels.length > 30 ? 0 : 2,
    });
  });

  if (chartInstance) {
    chartInstance.destroy();
  }

  const isDark = document.documentElement.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches;
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
  const textColor = isDark ? '#e5e7eb' : '#374151';

  try {
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
          x: { grid: { color: gridColor }, ticks: { color: textColor, maxTicksLimit: 20 } },
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
  } catch (err) {
    console.error('Chart creation error:', err);
  }
}

// =============================================================================
// Detailed Analytics
// =============================================================================
function renderDetailedAnalytics() {
  detailedAnalytics.innerHTML = "";

  const calcAvg = (arr) => {
    if (!arr || arr.length === 0) return null;
    const validValues = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
    if (validValues.length === 0) return null;
    return validValues.reduce((a, b) => a + b, 0) / validValues.length;
  };

  const createBarCard = (title, icon, unit, getData, maxScale, colorClass = "bg-primary") => {
    const card = document.createElement("div");
    card.className = "flex flex-col gap-3 p-4 rounded-xl border border-[#dbe0e6] dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm";

    let content = "";
    if (cities.length > 0) {
      cities.forEach(city => {
        const value = getData(city);
        if (value === null || value === undefined || isNaN(value)) {
          content += `
            <div class="space-y-2">
              <div class="flex justify-between text-xs font-bold uppercase tracking-wider text-[#617589]">
                <span>${city.name}</span>
                <span>--${unit}</span>
              </div>
              <div class="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div class="h-full text-[10px] text-gray-400 flex items-center justify-center">No data</div>
              </div>
            </div>
          `;
        } else {
          const pct = Math.max(Math.min((Math.abs(value) / maxScale) * 100, 100), 1); // Minimum 1% to show something
          content += `
            <div class="space-y-2">
              <div class="flex justify-between text-xs font-bold uppercase tracking-wider text-[#617589]">
                <span>${city.name}</span>
                <span>${Math.round(value * 10) / 10}${unit}</span>
              </div>
              <div class="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div class="h-full ${colorClass}" style="width: ${pct}%"></div>
              </div>
            </div>
          `;
        }
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

  const maxTempCard = createBarCard(
    "Average Max Temperature",
    "thermostat",
    "°C",
    city => calcAvg(city.weather?.daily?.max),
    50,
    "bg-orange-500"
  );

  const minTempCard = createBarCard(
    "Average Min Temperature",
    "ac_unit",
    "°C",
    city => calcAvg(city.weather?.daily?.min),
    40,
    "bg-blue-500"
  );

  const rainCard = createBarCard(
    "Total Precipitation",
    "water_drop",
    " mm",
    city => {
      const arr = city.weather?.daily?.precipSum;
      if (!arr || arr.length === 0) return null;
      const validValues = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
      if (validValues.length === 0) return null;
      return validValues.reduce((a, b) => a + b, 0);
    },
    500,
    "bg-cyan-500"
  );

  const windCard = createBarCard(
    "Average Wind Speed",
    "air",
    " km/h",
    city => calcAvg(city.weather?.daily?.windMax),
    50,
    "bg-primary"
  );

  const uvCard = createBarCard(
    "Average UV Index",
    "light_mode",
    "",
    city => calcAvg(city.weather?.daily?.uv),
    11,
    "bg-yellow-500"
  );

  detailedAnalytics.appendChild(maxTempCard);
  detailedAnalytics.appendChild(minTempCard);
  detailedAnalytics.appendChild(rainCard);
  detailedAnalytics.appendChild(windCard);
  detailedAnalytics.appendChild(uvCard);
}

// =============================================================================
// Event Listeners
// =============================================================================

// Search input with debounce
cityInput.addEventListener("input", (e) => {
  debouncedSearch(e.target.value.trim());
});

// Form submit
addCityForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const query = cityInput.value.trim();
  if (query) performSearch(query);
});

// Event delegation
document.addEventListener("click", async (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) {
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
});

// Chart toggle buttons
if (chartToggle) {
  chartToggle.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-mode]");
    if (btn) setChartMode(btn.dataset.mode);
  });
}

// Date input - parse DD/MM/YYYY free text
startDateInput.addEventListener("input", (e) => {
  const val = e.target.value.trim();
  const iso = parseDisplayDate(val);
  if (iso) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(iso) > today) {
      startDateInput.classList.add('border-red-500');
      startDateInput.classList.remove('border-[#dbe0e6]', 'dark:border-gray-700');
      dateRangePreview.textContent = 'Date cannot be in the future';
      return;
    }
    startDateInput.classList.remove('border-red-500');
    startDateInput.classList.add('border-[#dbe0e6]', 'dark:border-gray-700');
    dateRange.start = iso;
    saveDateRange();
    updateDateRangePreview();
  } else if (val.length >= 8) {
    startDateInput.classList.add('border-red-500');
    startDateInput.classList.remove('border-[#dbe0e6]', 'dark:border-gray-700');
  } else {
    startDateInput.classList.remove('border-red-500');
    startDateInput.classList.add('border-[#dbe0e6]', 'dark:border-gray-700');
  }
});

numDaysInput.addEventListener("change", (e) => {
  const days = parseInt(e.target.value);
  if (days < 1) {
    showToast('Number of days must be at least 1', 'error');
    e.target.value = 1;
    dateRange.numDays = 1;
  } else if (days > 365) {
    showToast('Maximum 365 days allowed', 'error');
    e.target.value = 365;
    dateRange.numDays = 365;
  } else {
    dateRange.numDays = days;
  }
  saveDateRange();
  updateDateRangePreview();
});

// Fetch historical data button
fetchHistoricalBtn.addEventListener("click", async () => {
  // Validate the current text in the input
  const iso = parseDisplayDate(startDateInput.value.trim());
  if (!iso) {
    showToast('Please enter a valid date (DD/MM/YYYY)', 'error');
    return;
  }
  dateRange.start = iso;
  saveDateRange();

  if (!dateRange.numDays || dateRange.numDays < 1) {
    showToast('Please enter number of days', 'error');
    return;
  }

  if (!cities.length) {
    showToast('Please add at least one city', 'error');
    return;
  }

  const start = new Date(dateRange.start);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start > today) {
    showToast('Start date cannot be in the future', 'error');
    return;
  }

  await refreshAll();
});

// Refresh button
refreshAllBtn.addEventListener("click", refreshAll);

// Clear button
clearAllBtn.addEventListener("click", () => {
  if (confirm("Remove all cities?")) {
    cities = [];
    saveCities();
    renderSelectedCities();
    renderChart();
    renderDetailedAnalytics();
    showToast("All cities cleared", "success");
  }
});

// =============================================================================
// Initialize
// =============================================================================
function init() {
  // Set date inputs - display in DD/MM/YYYY format
  startDateInput.value = isoToDisplay(dateRange.start);
  numDaysInput.value = dateRange.numDays || 30;

  // Update date range preview
  updateDateRangePreview();

  renderSelectedCities();
  renderDetailedAnalytics();

  // Wait for Chart.js to load, then show placeholder
  const checkChartJS = setInterval(() => {
    if (typeof Chart !== 'undefined') {
      clearInterval(checkChartJS);
      const canvas = document.getElementById('weatherChart');
      const container = canvas?.parentElement;
      if (container && !cities.find(c => c.weather?.daily)) {
        // Keep canvas but it will show empty state
        renderChart();
      }
    }
  }, 100);

  // Timeout after 5 seconds
  setTimeout(() => clearInterval(checkChartJS), 5000);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
