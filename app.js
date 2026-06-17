"use strict";

// Metric descriptors. `stat` metrics carry {min, avg, max}; others are a bare number.
const METRICS = [
  { key: "temperature", label: "Temperature", unit: "°C", stat: true },
  { key: "humidity", label: "Humidity", unit: "%", stat: true },
  { key: "pressure", label: "Pressure", unit: "hPa", stat: true },
  { key: "battery", label: "Battery", unit: "%", stat: false },
];

// First day-of-year of each month (non-leap reference) for axis ticks.
const MONTH_STARTS = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const charts = {};
let dataset = null;

function dayOfYear(isoDate) {
  // isoDate = "yyyy-MM-dd"
  const [y, m, d] = isoDate.split("-").map(Number);
  const start = Date.UTC(y, 0, 1);
  const cur = Date.UTC(y, m - 1, d);
  return Math.floor((cur - start) / 86400000) + 1;
}

// Distinct, stable color per year.
function yearColor(year, index) {
  const hue = (index * 67) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

function valueFor(day, metric) {
  const v = day[metric.key];
  if (v == null) return null;
  return metric.stat ? v.avg : v;
}

function buildDatasets(room, metric) {
  const rows = dataset.days.filter((d) => d.room === room);

  // Group by calendar year -> each year becomes its own legend entry.
  const byYear = new Map();
  for (const day of rows) {
    const value = valueFor(day, metric);
    if (value == null) continue;
    const year = day.date.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push({ x: dayOfYear(day.date), y: value, raw: day });
  }

  const years = [...byYear.keys()].sort();
  return years.map((year, i) => {
    const points = byYear.get(year).sort((a, b) => a.x - b.x);
    const color = yearColor(year, i);
    return {
      label: year,
      data: points,
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      pointRadius: 1.5,
      pointHoverRadius: 4,
      tension: 0.25,
      spanGaps: true,
    };
  });
}

function makeChart(metric) {
  const ctx = document.getElementById(`chart-${metric.key}`);
  return new Chart(ctx, {
    type: "line",
    data: { datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        title: { display: true, text: `${metric.label} (${metric.unit})`, color: "#e6e8ee" },
        legend: { labels: { color: "#9aa0ad" } },
        tooltip: {
          callbacks: {
            title: (items) => {
              const raw = items[0]?.raw?.raw;
              return raw ? raw.date : "";
            },
            label: (item) => {
              const raw = item.raw.raw;
              const v = raw[metric.key];
              if (metric.stat && v) {
                return `${item.dataset.label}: avg ${v.avg}${metric.unit} (min ${v.min} / max ${v.max})`;
              }
              return `${item.dataset.label}: ${item.formattedValue}${metric.unit}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          min: 1,
          max: 366,
          ticks: {
            color: "#9aa0ad",
            autoSkip: false,
            callback: (value) => {
              const idx = MONTH_STARTS.indexOf(value);
              return idx >= 0 ? MONTH_LABELS[idx] : "";
            },
          },
          grid: { color: "#2a2e3a" },
        },
        y: {
          ticks: { color: "#9aa0ad" },
          grid: { color: "#2a2e3a" },
        },
      },
    },
  });
}

function render(room) {
  for (const metric of METRICS) {
    charts[metric.key].data.datasets = buildDatasets(room, metric);
    charts[metric.key].options.scales.x.ticks.maxTicksLimit = undefined;
    charts[metric.key].update();
  }
}

async function init() {
  const status = document.getElementById("status");
  try {
    const res = await fetch("summary.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    dataset = await res.json();
  } catch (err) {
    status.textContent = `Could not load summary.json: ${err.message}`;
    return;
  }

  if (!dataset.rooms || dataset.rooms.length === 0) {
    status.textContent = "No data available yet.";
    return;
  }

  const select = document.getElementById("roomSelect");
  for (const room of dataset.rooms) {
    const opt = document.createElement("option");
    opt.value = room;
    opt.textContent = room;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => render(select.value));

  if (dataset.generatedUtc) {
    document.getElementById("generated").textContent =
      `Updated ${new Date(dataset.generatedUtc).toLocaleString()}`;
  }

  for (const metric of METRICS) {
    charts[metric.key] = makeChart(metric);
  }

  render(select.value);
  status.textContent = `${dataset.days.length} daily records across ${dataset.rooms.length} rooms.`;
}

init();
