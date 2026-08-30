(function () {
  "use strict";

  var CASA_BRISA = { latitude: 18.3185, longitude: -67.2455 };
  var FORECAST_URL = "https://api.open-meteo.com/v1/forecast?latitude=18.3185&longitude=-67.2455&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,relative_humidity_2m,uv_index,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,uv_index_max,precipitation_sum,rain_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FPuerto_Rico&forecast_days=8";
  var MARINE_URL = "https://marine-api.open-meteo.com/v1/marine?latitude=18.3185&longitude=-67.2455&current=wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature&hourly=wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature&daily=wave_height_max,wave_direction_dominant,wave_period_max,swell_wave_height_max,swell_wave_direction_dominant,swell_wave_period_max&length_unit=imperial&temperature_unit=fahrenheit&timezone=America%2FPuerto_Rico&forecast_days=8";
  var ALERTS_URL = "https://api.weather.gov/alerts/active?point=18.3185,-67.2455";
  var NOAA_RADAR_WMS = "https://opengeo.ncep.noaa.gov/geoserver/carib/carib_bref_qcd/ows?service=WMS&request=GetMap&version=1.1.1&layers=carib_bref_qcd&styles=radar_reflectivity&format=image/png&transparent=true&width=256&height=256&srs=EPSG:3857&bbox={bbox-epsg-3857}";
  var NOAA_SATELLITE_IR_WMS = "https://nowcoast.noaa.gov/geoserver/observations/satellite/ows?service=WMS&request=GetMap&version=1.1.1&layers=goes_longwave_imagery&styles=goes-lir&format=image/png&transparent=true&width=256&height=256&srs=EPSG:3857&bbox={bbox-epsg-3857}";
  var NOAA_SATELLITE_VISIBLE_WMS = "https://nowcoast.noaa.gov/geoserver/observations/satellite/ows?service=WMS&request=GetMap&version=1.1.1&layers=goes_visible_imagery&styles=goes-vis&format=image/png&transparent=true&width=256&height=256&srs=EPSG:3857&bbox={bbox-epsg-3857}";
  var NOAA_WARNINGS_WMS = "https://opengeo.ncep.noaa.gov/geoserver/wwa/warnings/ows?service=WMS&request=GetMap&version=1.1.1&layers=warnings&styles=wwa_warnings&format=image/png&transparent=true&width=256&height=256&srs=EPSG:3857&bbox={bbox-epsg-3857}";
  var WEATHER_GRID = (function () {
    var points = [];
    for (var latitude = 18.20; latitude <= 18.401; latitude += .04) {
      for (var longitude = -67.34; longitude <= -67.059; longitude += .04) {
        points.push([Number(longitude.toFixed(3)), Number(latitude.toFixed(3)), "Local forecast grid"]);
      }
    }
    return points;
  }());
  var MARINE_GRID = (function () {
    var points = [];
    for (var latitude = 18.22; latitude <= 18.401; latitude += .045) {
      points.push([-67.36, Number(latitude.toFixed(3)), "Rincón coastal waters"]);
      points.push([-67.32, Number(latitude.toFixed(3)), "Nearshore waters"]);
    }
    return points;
  }());
  var WEATHER_SURFACE_COORDINATES = [[-67.37, 18.43], [-67.02, 18.43], [-67.02, 18.17], [-67.37, 18.17]];
  var MARINE_SURFACE_COORDINATES = [[-67.43, 18.43], [-67.235, 18.43], [-67.235, 18.17], [-67.43, 18.17]];

  var state = {
    forecast: null,
    marine: null,
    alerts: [],
    alertsAvailable: false,
    weatherGrid: [],
    marineGrid: [],
    activeLayer: "satellite",
    surfaceImages: {},
    map: null,
    mapReady: false,
    loading: false
  };

  var elements = {};
  var weatherDescriptions = {
    0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Foggy", 48: "Rime fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Light showers",
    81: "Showers", 82: "Heavy showers", 85: "Snow showers", 86: "Snow showers", 95: "Thunderstorms",
    96: "Thunderstorms", 99: "Strong thunderstorms"
  };

  function byId(id) { return document.getElementById(id); }
  function round(value) { return value !== null && value !== "" && Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0; }
  function fixed(value, digits) { return value !== null && value !== "" && Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "--"; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }
  function description(code) { return weatherDescriptions[Number(code)] || "Mixed conditions"; }
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character];
    });
  }

  function weatherIcon(code, isDay) {
    code = Number(code);
    if (code === 0) return isDay === false ? "☾" : "☀";
    if (code <= 2) return isDay === false ? "◑" : "◒";
    if (code === 3) return "●";
    if (code === 45 || code === 48) return "≋";
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "☂";
    if (code >= 95) return "ϟ";
    return "◒";
  }

  function cardinal(degrees) {
    if (!Number.isFinite(Number(degrees))) return "--";
    return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(Number(degrees) / 45) % 8];
  }

  function parseLocalTime(value) {
    return new Date(String(value).length === 10 ? value + "T12:00:00-04:00" : value + "-04:00");
  }

  function formatHour(value) {
    return new Intl.DateTimeFormat("en-US", { timeZone: "America/Puerto_Rico", hour: "numeric" }).format(parseLocalTime(value));
  }

  function formatDay(value, longName) {
    return new Intl.DateTimeFormat("en-US", { timeZone: "America/Puerto_Rico", weekday: longName ? "long" : "short" }).format(parseLocalTime(value));
  }

  function formatClock(value) {
    return new Intl.DateTimeFormat("en-US", { timeZone: "America/Puerto_Rico", hour: "numeric", minute: "2-digit" }).format(parseLocalTime(value));
  }

  function localIso(date) {
    var parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Puerto_Rico", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23"
    }).formatToParts(date).reduce(function (result, part) { result[part.type] = part.value; return result; }, {});
    return parts.year + "-" + parts.month + "-" + parts.day + "T" + parts.hour + ":00";
  }

  function fallbackForecast() {
    var base = new Date();
    var hourly = { time: [], temperature_2m: [], apparent_temperature: [], precipitation_probability: [], weather_code: [], wind_speed_10m: [], wind_gusts_10m: [], relative_humidity_2m: [], uv_index: [], is_day: [] };
    for (var i = 0; i < 72; i += 1) {
      var hour = new Date(base.getTime() + i * 3600000);
      var daytime = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Puerto_Rico", hour: "numeric", hourCycle: "h23" }).format(hour));
      hourly.time.push(localIso(hour));
      hourly.temperature_2m.push(79 + Math.max(0, 6 - Math.abs(14 - daytime)));
      hourly.apparent_temperature.push(84);
      hourly.precipitation_probability.push(i % 9 === 0 ? 38 : 18);
      hourly.weather_code.push(i % 9 === 0 ? 80 : 2);
      hourly.wind_speed_10m.push(11);
      hourly.wind_gusts_10m.push(18);
      hourly.relative_humidity_2m.push(73);
      hourly.uv_index.push(daytime > 7 && daytime < 17 ? 7 : 0);
      hourly.is_day.push(daytime > 6 && daytime < 19 ? 1 : 0);
    }
    var daily = { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_probability_max: [], wind_speed_10m_max: [], wind_gusts_10m_max: [], uv_index_max: [], sunrise: [], sunset: [] };
    for (var d = 0; d < 8; d += 1) {
      var day = new Date(base.getTime() + d * 86400000);
      daily.time.push(localIso(day).slice(0, 10));
      daily.weather_code.push(d % 3 === 1 ? 80 : 2);
      daily.temperature_2m_max.push(85 - (d % 2));
      daily.temperature_2m_min.push(76);
      daily.precipitation_probability_max.push(d % 3 === 1 ? 48 : 24);
      daily.wind_speed_10m_max.push(15);
      daily.wind_gusts_10m_max.push(22);
      daily.uv_index_max.push(8);
      daily.sunrise.push(daily.time[d] + "T06:08");
      daily.sunset.push(daily.time[d] + "T18:48");
    }
    return { current: { time: hourly.time[0], temperature_2m: 83, apparent_temperature: 88, relative_humidity_2m: 73, precipitation: 0, rain: 0, weather_code: 2, cloud_cover: 47, wind_speed_10m: 11, wind_direction_10m: 70, wind_gusts_10m: 18, is_day: hourly.is_day[0] }, hourly: hourly, daily: daily };
  }

  function fallbackMarine() {
    return {
      current: { wave_height: 2.1, wave_direction: 55, wave_period: 6.2, swell_wave_height: 1.6, swell_wave_direction: 30, swell_wave_period: 5.4, sea_surface_temperature: 86 },
      daily: { time: state.forecast.daily.time.slice(0, 8), wave_height_max: [2.4, 2.6, 2.2, 2.1, 2.5, 2.8, 2.4, 2.2] }
    };
  }

  function fetchJson(url, options) {
    return fetch(url, options || {}).then(function (response) {
      if (!response.ok) throw new Error("Weather service returned " + response.status);
      return response.json();
    });
  }

  function buildGridUrl(points, marine) {
    var latitudes = points.map(function (point) { return point[1]; }).join(",");
    var longitudes = points.map(function (point) { return point[0]; }).join(",");
    if (marine) {
      return "https://marine-api.open-meteo.com/v1/marine?latitude=" + latitudes + "&longitude=" + longitudes + "&current=wave_height,wave_direction,wave_period,sea_surface_temperature&length_unit=imperial&temperature_unit=fahrenheit&timezone=America%2FPuerto_Rico";
    }
    return "https://api.open-meteo.com/v1/forecast?latitude=" + latitudes + "&longitude=" + longitudes + "&current=temperature_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m&hourly=precipitation_probability&forecast_hours=1&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FPuerto_Rico";
  }

  function currentHourlyIndex(forecast) {
    var currentTime = forecast.current && forecast.current.time;
    var index = forecast.hourly.time.findIndex(function (time) { return time >= currentTime; });
    return index < 0 ? 0 : index;
  }

  function renderCurrent() {
    var forecast = state.forecast;
    var current = forecast.current;
    var index = currentHourlyIndex(forecast);
    var rainChance = forecast.hourly.precipitation_probability[index];
    var uv = forecast.hourly.uv_index[index];
    var todayHigh = forecast.daily.temperature_2m_max[0];
    var todayLow = forecast.daily.temperature_2m_min[0];
    elements.currentTemp.textContent = round(current.temperature_2m) + "°";
    elements.currentCondition.textContent = description(current.weather_code);
    elements.currentFeels.textContent = "Feels like " + round(current.apparent_temperature) + "°";
    elements.currentIcon.textContent = weatherIcon(current.weather_code, Number(current.is_day) === 1);
    elements.currentTime.textContent = "Updated " + formatClock(current.time);
    elements.currentHumidity.textContent = round(current.relative_humidity_2m) + "%";
    elements.currentWind.textContent = cardinal(current.wind_direction_10m) + " " + round(current.wind_speed_10m) + " mph";
    elements.currentGusts.textContent = round(current.wind_gusts_10m) + " mph";
    elements.currentRain.textContent = round(rainChance) + "%";
    elements.currentUv.textContent = fixed(uv, 1);
    elements.currentRange.textContent = round(todayHigh) + "° / " + round(todayLow) + "°";
    elements.currentSummary.textContent = currentSummary(current, rainChance, uv);
  }

  function currentSummary(current, rainChance, uv) {
    if (Number(current.wind_gusts_10m) >= 28) return "Breezy conditions may affect umbrellas, loose outdoor items and guest arrivals.";
    if (Number(rainChance) >= 55) return "Showers are likely—keep the covered-arrival plan and indoor guest picks ready.";
    if (Number(uv) >= 8) return "Strong sun is the main concern; shade, water and sunscreen reminders will help.";
    return "Conditions look workable for arrivals, outdoor setup and most guest plans.";
  }

  function renderHourly() {
    var forecast = state.forecast;
    var start = currentHourlyIndex(forecast);
    var cards = [];
    for (var i = start; i < Math.min(start + 24, forecast.hourly.time.length); i += 1) {
      var isNow = i === start;
      cards.push('<article class="' + (isNow ? "is-now" : "") + '"><span>' + (isNow ? "Now" : formatHour(forecast.hourly.time[i])) + '</span><i aria-hidden="true">' + weatherIcon(forecast.hourly.weather_code[i], Number((forecast.hourly.is_day || [])[i]) === 1) + '</i><strong>' + round(forecast.hourly.temperature_2m[i]) + '°</strong><small>' + round(forecast.hourly.precipitation_probability[i]) + '% rain</small><em>' + round(forecast.hourly.wind_speed_10m[i]) + ' mph</em></article>');
    }
    elements.hourlyTrack.innerHTML = cards.join("");
  }

  function renderDaily() {
    var daily = state.forecast.daily;
    var cards = [];
    for (var i = 0; i < Math.min(7, daily.time.length); i += 1) {
      cards.push('<article><span>' + (i === 0 ? "Today" : formatDay(daily.time[i], true)) + '</span><i aria-hidden="true">' + weatherIcon(daily.weather_code[i], true) + '</i><p>' + description(daily.weather_code[i]) + '</p><small>' + round(daily.precipitation_probability_max[i]) + '% rain</small><strong>' + round(daily.temperature_2m_max[i]) + '° / ' + round(daily.temperature_2m_min[i]) + '°</strong></article>');
    }
    elements.dailyList.innerHTML = cards.join("");
  }

  function renderMarine() {
    var marine = state.marine;
    var current = marine.current || {};
    elements.waveHeight.textContent = fixed(current.wave_height, 1) + " ft";
    elements.waveDirection.textContent = cardinal(current.wave_direction) + " · " + round(current.wave_direction) + "°";
    elements.seaTemperature.textContent = round(current.sea_surface_temperature) + "°";
    elements.swellSummary.textContent = cardinal(current.swell_wave_direction) + " swell";
    elements.wavePeriod.textContent = fixed(current.wave_period, 1) + " sec";
    elements.swellHeight.textContent = fixed(current.swell_wave_height, 1) + " ft";
    elements.swellPeriod.textContent = fixed(current.swell_wave_period, 1) + " sec";
    var daily = marine.daily || {};
    var days = daily.time || [];
    elements.coastOutlook.innerHTML = days.slice(0, 7).map(function (day, index) {
      return '<span><small>' + (index === 0 ? "Today" : formatDay(day, false)) + '</small><strong>' + fixed((daily.wave_height_max || [])[index], 1) + ' ft</strong></span>';
    }).join("");
  }

  function maxSlice(values, start, length) {
    return Math.max.apply(null, values.slice(start, start + length).map(function (value) { return Number(value) || 0; }));
  }

  function clearestWindow(forecast, start) {
    var best = start;
    var bestScore = Infinity;
    for (var i = start; i < Math.min(start + 12, forecast.hourly.time.length); i += 1) {
      var score = Number(forecast.hourly.precipitation_probability[i] || 0) + Number(forecast.hourly.wind_gusts_10m[i] || 0);
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return formatHour(forecast.hourly.time[best]);
  }

  function renderHostImpact() {
    var forecast = state.forecast;
    var start = currentHourlyIndex(forecast);
    var rain = maxSlice(forecast.hourly.precipitation_probability, start, 12);
    var gust = maxSlice(forecast.hourly.wind_gusts_10m, start, 12);
    var uv = maxSlice(forecast.hourly.uv_index, start, 12);
    var windowTime = clearestWindow(forecast, start);
    var turnoverTitle = rain < 40 && gust < 25 ? "Good working window" : "Plan an indoor-first turn";
    var turnoverCopy = rain < 40 && gust < 25 ? "The clearest conditions begin around " + windowTime + "." : "Use the driest hour near " + windowTime + " for exterior work.";
    var outdoorTitle = uv >= 8 ? "High sun exposure" : (rain >= 55 ? "Keep a rain backup" : "Outdoor plans look viable");
    var outdoorCopy = uv >= 8 ? "Stage shade and add a sunscreen + hydration reminder." : (rain >= 55 ? "Pool and beach plans may need a flexible alternative." : "Patio, pool and beach plans have a workable window.");
    var arrivalTitle = rain >= 55 || gust >= 28 ? "Send an arrival heads-up" : "Arrival looks straightforward";
    var arrivalCopy = rain >= 55 ? "Share the covered entry and parking note before check-in." : (gust >= 28 ? "Mention wind and secure loose exterior items." : "No material weather friction is visible right now.");
    var alertTitle = state.alerts.length ? state.alerts[0].properties.event : (state.alertsAvailable ? "No official alerts" : "Official status unavailable");
    var alertCopy = state.alerts.length ? (state.alerts[0].properties.headline || "Review the active National Weather Service alert.") : (state.alertsAvailable ? "NWS shows no active alerts at Casa Brisa." : "Open the NWS link above for the latest official status.");
    elements.impactGrid.innerHTML =
      '<article><i class="impact-blue">01</i><span><small>Turnover window</small><strong>' + turnoverTitle + '</strong><p>' + turnoverCopy + '</p></span></article>' +
      '<article><i class="impact-yellow">02</i><span><small>Outdoor readiness</small><strong>' + outdoorTitle + '</strong><p>' + outdoorCopy + '</p></span></article>' +
      '<article><i class="impact-coral">03</i><span><small>Guest arrival</small><strong>' + arrivalTitle + '</strong><p>' + arrivalCopy + '</p></span></article>' +
      '<article><i class="impact-aqua">04</i><span><small>Storm watch</small><strong>' + escapeHtml(alertTitle) + '</strong><p>' + escapeHtml(alertCopy) + '</p></span></article>';
  }

  function renderAlerts() {
    var alerts = state.alerts;
    elements.alertStrip.classList.toggle("has-alert", alerts.length > 0);
    elements.alertStrip.classList.toggle("is-unavailable", !state.alertsAvailable);
    if (alerts.length) {
      var properties = alerts[0].properties;
      elements.alertIcon.textContent = "!";
      elements.alertLabel.textContent = alerts.length + (alerts.length === 1 ? " active official alert" : " active official alerts");
      elements.alertHeadline.textContent = properties.event || "Weather alert";
      elements.alertCopy.textContent = properties.headline || properties.description || "Review the National Weather Service alert for details.";
      elements.alertLink.href = properties.web || alerts[0].id || "https://www.weather.gov/sju/";
    } else if (state.alertsAvailable) {
      elements.alertIcon.textContent = "✓";
      elements.alertLabel.textContent = "Official weather alerts";
      elements.alertHeadline.textContent = "No active alerts for Casa Brisa";
      elements.alertCopy.textContent = "The National Weather Service is not showing an active alert at this location.";
      elements.alertLink.href = "https://www.weather.gov/sju/";
    } else {
      elements.alertIcon.textContent = "—";
      elements.alertLabel.textContent = "Official weather alerts";
      elements.alertHeadline.textContent = "Live alert status is temporarily unavailable";
      elements.alertCopy.textContent = "Use the National Weather Service link for the latest official Rincón alerts.";
      elements.alertLink.href = "https://www.weather.gov/sju/";
    }
  }

  function normalizeGridResponse(response, points) {
    var items = Array.isArray(response) ? response : [response];
    return items.map(function (item, index) {
      return { longitude: points[index][0], latitude: points[index][1], label: points[index][2], data: item };
    });
  }

  function colorFor(layer, value) {
    value = Number(value) || 0;
    if (layer === "wind") return value >= 28 ? "#ff625f" : value >= 18 ? "#ffbd35" : value >= 10 ? "#4f72ff" : "#39bed2";
    if (layer === "cloud") return value >= 80 ? "#627086" : value >= 50 ? "#8799b5" : value >= 25 ? "#7aa6df" : "#54c7d8";
    if (layer === "temperature") return value >= 88 ? "#ff625f" : value >= 82 ? "#ffbd35" : value >= 76 ? "#55c5d5" : "#4f72ff";
    if (layer === "marine") return value >= 6 ? "#ff625f" : value >= 4 ? "#765ad1" : value >= 2 ? "#3f6fff" : "#29bdd6";
    return "#ff625f";
  }

  function layerValue(record, layer) {
    var data = record.data || {};
    var current = data.current || {};
    if (layer === "wind") return current.wind_speed_10m;
    if (layer === "cloud") return current.cloud_cover;
    if (layer === "temperature") return current.temperature_2m;
    if (layer === "marine") return current.wave_height;
    return 0;
  }

  function layerValueLabel(layer, value) {
    if (layer === "cloud") return round(value) + "%";
    if (layer === "wind") return round(value) + " mph";
    if (layer === "temperature") return round(value) + "°F";
    if (layer === "marine") return fixed(value, 1) + " ft";
    return "Official alert";
  }

  function updateMapKey(layer) {
    var labels = {
      satellite: ["Colder cloud tops", "Warmer / clearer"], radar: ["No echo / light rain", "Heavier cells"], wind: ["Lighter wind", "Stronger wind"],
      cloud: ["Clearer", "Heavier cloud"], temperature: ["Cooler", "Warmer"], marine: ["Lower waves", "Higher waves"],
      alerts: ["Official alert area", "NWS alert"]
    }[layer];
    elements.mapKey.innerHTML = '<span><i></i>' + labels[0] + '</span><b></b><span>' + labels[1] + '</span>';
    elements.mapKey.dataset.layer = layer;
  }

  function mapFeaturesForLayer(layer) {
    if (layer === "satellite" || layer === "radar" || layer === "alerts") return [];
    var records = layer === "marine" ? state.marineGrid : state.weatherGrid;
    return records.map(function (record) {
      var value = layerValue(record, layer);
      var intensity = layer === "wind" ? clamp(value / 30, 0, 1) : layer === "cloud" ? clamp(value / 100, 0, 1) : layer === "temperature" ? clamp((value - 72) / 20, 0, 1) : clamp(value / 6, 0, 1);
      return { type: "Feature", geometry: { type: "Point", coordinates: [record.longitude, record.latitude] }, properties: { label: record.label, value: layerValueLabel(layer, value), color: colorFor(layer, value), intensity: intensity } };
    });
  }

  function surfaceSettings(layer) {
    return {
      wind: { min: 0, max: 30, colors: [[72, 195, 210], [71, 112, 238], [255, 189, 53], [255, 98, 95]], opacity: .34, coordinates: WEATHER_SURFACE_COORDINATES },
      cloud: { min: 0, max: 100, colors: [[170, 218, 225], [132, 174, 207], [103, 119, 147], [48, 62, 83]], opacity: .29, coordinates: WEATHER_SURFACE_COORDINATES },
      temperature: { min: 72, max: 94, colors: [[80, 119, 242], [81, 190, 205], [255, 195, 70], [245, 98, 91]], opacity: .34, coordinates: WEATHER_SURFACE_COORDINATES },
      marine: { min: 0, max: 7, colors: [[63, 192, 210], [63, 111, 255], [112, 89, 203], [246, 98, 95]], opacity: .32, coordinates: MARINE_SURFACE_COORDINATES }
    }[layer];
  }

  function colorFromRamp(colors, amount) {
    var position = clamp(amount, 0, 1) * (colors.length - 1);
    var start = Math.floor(position);
    var end = Math.min(colors.length - 1, start + 1);
    var mix = position - start;
    return colors[start].map(function (channel, index) { return Math.round(channel + (colors[end][index] - channel) * mix); });
  }

  function surfaceImageForLayer(layer) {
    if (state.surfaceImages[layer]) return state.surfaceImages[layer];
    var settings = surfaceSettings(layer);
    var records = (layer === "marine" ? state.marineGrid : state.weatherGrid).map(function (record) {
      return { longitude: record.longitude, latitude: record.latitude, value: Number(layerValue(record, layer)) };
    }).filter(function (record) { return Number.isFinite(record.value); });
    if (!settings || !records.length) return null;
    var canvas = document.createElement("canvas");
    canvas.width = 420;
    canvas.height = 312;
    var context = canvas.getContext("2d");
    var image = context.createImageData(canvas.width, canvas.height);
    var north = settings.coordinates[0][1];
    var south = settings.coordinates[2][1];
    var west = settings.coordinates[0][0];
    var east = settings.coordinates[1][0];
    var cosine = Math.cos(((north + south) / 2) * Math.PI / 180);
    for (var y = 0; y < canvas.height; y += 1) {
      var latitude = north - (north - south) * y / (canvas.height - 1);
      for (var x = 0; x < canvas.width; x += 1) {
        var longitude = west + (east - west) * x / (canvas.width - 1);
        var weightedValue = 0;
        var totalWeight = 0;
        for (var index = 0; index < records.length; index += 1) {
          var deltaX = (longitude - records[index].longitude) * cosine;
          var deltaY = latitude - records[index].latitude;
          var distanceSquared = deltaX * deltaX + deltaY * deltaY;
          var weight = 1 / Math.pow(distanceSquared + .000018, 1.2);
          weightedValue += records[index].value * weight;
          totalWeight += weight;
        }
        var value = weightedValue / totalWeight;
        var color = colorFromRamp(settings.colors, (value - settings.min) / (settings.max - settings.min));
        var horizontalFade = Math.min(1, x / 50, (canvas.width - 1 - x) / 50);
        var verticalFade = Math.min(1, y / 40, (canvas.height - 1 - y) / 40);
        var edgeFade = clamp(Math.min(horizontalFade, verticalFade), 0, 1);
        edgeFade = edgeFade * edgeFade * (3 - 2 * edgeFade);
        var offset = (y * canvas.width + x) * 4;
        image.data[offset] = color[0];
        image.data[offset + 1] = color[1];
        image.data[offset + 2] = color[2];
        image.data[offset + 3] = Math.round(255 * edgeFade);
      }
    }
    context.putImageData(image, 0, 0);
    state.surfaceImages[layer] = { url: canvas.toDataURL("image/png"), coordinates: settings.coordinates, opacity: settings.opacity };
    return state.surfaceImages[layer];
  }

  function alertGeoJson() {
    return { type: "FeatureCollection", features: state.alerts.filter(function (alert) { return alert.geometry; }).map(function (alert) { return { type: "Feature", geometry: alert.geometry, properties: { event: alert.properties.event || "Weather alert" } }; }) };
  }

  function renderMapLayer() {
    if (!state.mapReady || !state.map.getSource("weather-points")) return;
    var features = mapFeaturesForLayer(state.activeLayer);
    state.map.getSource("weather-points").setData({ type: "FeatureCollection", features: features });
    state.map.getSource("official-alert-areas").setData(alertGeoJson());
    var currentIsDay = state.forecast && state.forecast.current && Number(state.forecast.current.is_day) === 1;
    var isSatellite = state.activeLayer === "satellite";
    var isRadar = state.activeLayer === "radar";
    var alertVisibility = state.activeLayer === "alerts" ? "visible" : "none";
    var surfaceVisibility = ["wind", "cloud", "temperature", "marine"].indexOf(state.activeLayer) >= 0 ? "visible" : "none";
    state.map.setLayoutProperty("noaa-satellite-visible", "visibility", isSatellite && currentIsDay ? "visible" : "none");
    state.map.setLayoutProperty("noaa-satellite-ir", "visibility", isSatellite && !currentIsDay ? "visible" : "none");
    state.map.setLayoutProperty("noaa-radar", "visibility", isRadar ? "visible" : "none");
    state.map.setLayoutProperty("noaa-warning-raster", "visibility", alertVisibility);
    state.map.setLayoutProperty("official-alert-fill", "visibility", alertVisibility);
    state.map.setLayoutProperty("official-alert-line", "visibility", alertVisibility);
    state.map.setLayoutProperty("weather-surface-image", "visibility", surfaceVisibility);
    state.map.setLayoutProperty("weather-points", "visibility", surfaceVisibility);
    if (surfaceVisibility === "visible") {
      var surface = surfaceImageForLayer(state.activeLayer);
      if (surface) {
        state.map.getSource("weather-surface-image-source").updateImage({ url: surface.url, coordinates: surface.coordinates });
        state.map.setPaintProperty("weather-surface-image", "raster-opacity", surface.opacity);
      } else state.map.setLayoutProperty("weather-surface-image", "visibility", "none");
    }
    state.map.setPaintProperty("weather-base", "raster-opacity", isSatellite ? .72 : .84);
    updateMapKey(state.activeLayer);
    var sourceLabels = {
      satellite: "NOAA GOES · " + (currentIsDay ? "visible imagery" : "infrared imagery"),
      radar: "NOAA / NWS · live radar · clear areas appear empty",
      wind: "Open-Meteo · continuous wind surface",
      cloud: "Open-Meteo · continuous cloud surface",
      temperature: "Open-Meteo · continuous temperature surface",
      marine: "Open-Meteo · continuous wave surface",
      alerts: "National Weather Service · official alerts"
    };
    elements.mapSource.querySelector("span").textContent = sourceLabels[state.activeLayer];
    if (state.activeLayer === "marine") state.map.easeTo({ center: [-67.295, 18.305], zoom: 10.2, duration: 450 });
    else state.map.easeTo({ center: [CASA_BRISA.longitude, CASA_BRISA.latitude], zoom: 10.5, duration: 450 });
    if (features.length || isSatellite || isRadar || state.activeLayer === "alerts") {
      elements.mapLoading.classList.add("is-ready");
      elements.mapError.hidden = true;
    }
  }

  function initializeMap() {
    if (!window.maplibregl || typeof window.maplibregl.Map !== "function") {
      elements.mapLoading.hidden = true;
      elements.mapError.hidden = false;
      return;
    }
    state.map = new window.maplibregl.Map({
      container: "local-weather-map",
      style: {
        version: 8,
        sources: {
          base: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap contributors" },
          "noaa-radar-source": { type: "raster", tiles: [NOAA_RADAR_WMS], tileSize: 256, attribution: "NOAA/NWS MRMS" },
          "noaa-satellite-ir-source": { type: "raster", tiles: [NOAA_SATELLITE_IR_WMS], tileSize: 256, attribution: "NOAA nowCOAST/GOES" },
          "noaa-satellite-visible-source": { type: "raster", tiles: [NOAA_SATELLITE_VISIBLE_WMS], tileSize: 256, attribution: "NOAA nowCOAST/GOES" },
          "noaa-warning-source": { type: "raster", tiles: [NOAA_WARNINGS_WMS], tileSize: 256, attribution: "NOAA/NWS" }
        },
        layers: [
          { id: "weather-background", type: "background", paint: { "background-color": "#dce8eb" } },
          { id: "weather-base", type: "raster", source: "base", paint: { "raster-saturation": -.88, "raster-contrast": -.12, "raster-brightness-min": .28, "raster-brightness-max": .96, "raster-opacity": .54 } },
          { id: "noaa-satellite-visible", type: "raster", source: "noaa-satellite-visible-source", layout: { visibility: "none" }, paint: { "raster-opacity": .38, "raster-contrast": .03, "raster-brightness-min": .34, "raster-brightness-max": 1, "raster-fade-duration": 180 } },
          { id: "noaa-satellite-ir", type: "raster", source: "noaa-satellite-ir-source", layout: { visibility: "visible" }, paint: { "raster-opacity": .32, "raster-contrast": .06, "raster-brightness-min": .4, "raster-brightness-max": 1, "raster-fade-duration": 180 } },
          { id: "noaa-radar", type: "raster", source: "noaa-radar-source", layout: { visibility: "none" }, paint: { "raster-opacity": .88, "raster-fade-duration": 120 } },
          { id: "noaa-warning-raster", type: "raster", source: "noaa-warning-source", layout: { visibility: "none" }, paint: { "raster-opacity": .72, "raster-fade-duration": 120 } }
        ]
      },
      center: [CASA_BRISA.longitude, CASA_BRISA.latitude],
      zoom: 10.5,
      minZoom: 9.2,
      maxZoom: 16,
      maxBounds: [[-67.48, 18.08], [-66.98, 18.58]],
      dragRotate: false,
      touchPitch: false,
      attributionControl: false
    });
    state.map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), "top-right");
    state.map.addControl(new window.maplibregl.AttributionControl({ compact: true }), "bottom-right");
    state.map.on("load", function () {
      state.map.addSource("official-alert-areas", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      state.map.addLayer({ id: "official-alert-fill", type: "fill", source: "official-alert-areas", layout: { visibility: "none" }, paint: { "fill-color": "#ff625f", "fill-opacity": .22 } });
      state.map.addLayer({ id: "official-alert-line", type: "line", source: "official-alert-areas", layout: { visibility: "none" }, paint: { "line-color": "#d44240", "line-width": 2, "line-dasharray": [2, 1] } });
      state.map.addSource("weather-points", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      var emptySurface = document.createElement("canvas");
      emptySurface.width = 2;
      emptySurface.height = 2;
      state.map.addSource("weather-surface-image-source", { type: "image", url: emptySurface.toDataURL("image/png"), coordinates: WEATHER_SURFACE_COORDINATES });
      state.map.addLayer({ id: "weather-surface-image", type: "raster", source: "weather-surface-image-source", layout: { visibility: "none" }, paint: { "raster-opacity": .34, "raster-fade-duration": 0 } });
      state.map.addLayer({ id: "weather-points", type: "circle", source: "weather-points", layout: { visibility: "none" }, paint: { "circle-radius": 15, "circle-color": ["get", "color"], "circle-opacity": .01 } });
      var marker = document.createElement("div");
      marker.className = "weather-host-map-marker";
      marker.setAttribute("aria-label", "Casa Brisa");
      new window.maplibregl.Marker({ element: marker, anchor: "center" }).setLngLat([CASA_BRISA.longitude, CASA_BRISA.latitude]).addTo(state.map);
      state.mapReady = true;
      renderMapLayer();
    });
    state.map.on("click", "weather-points", function (event) {
      var feature = event.features && event.features[0];
      if (!feature) return;
      new window.maplibregl.Popup({ offset: 10 }).setLngLat(feature.geometry.coordinates).setHTML('<strong style="display:block;color:#061a36;font-size:11px">' + escapeHtml(feature.properties.label) + '</strong><span style="display:block;margin-top:4px;color:#6f7d90;font-size:9px">' + escapeHtml(feature.properties.value) + '</span>').addTo(state.map);
    });
    state.map.on("mouseenter", "weather-points", function () { state.map.getCanvas().style.cursor = "pointer"; });
    state.map.on("mouseleave", "weather-points", function () { state.map.getCanvas().style.cursor = ""; });
    state.map.on("error", function () { /* Individual tile errors should not hide the forecast. */ });
  }

  function setLayer(layer) {
    state.activeLayer = layer;
    elements.layerButtons.forEach(function (button) {
      var active = button.dataset.layer === layer;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    renderMapLayer();
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () { elements.toast.classList.remove("is-visible"); }, 2400);
  }

  function copyGuestUpdate() {
    var current = state.forecast.current;
    var start = currentHourlyIndex(state.forecast);
    var rain = maxSlice(state.forecast.hourly.precipitation_probability, start, 12);
    var note = "Casa Brisa weather update: " + description(current.weather_code).toLowerCase() + " and " + round(current.temperature_2m) + "°F in Rincón, with winds near " + round(current.wind_speed_10m) + " mph. Rain chance over the next 12 hours reaches " + round(rain) + "%. We’ll keep you posted if conditions change.";
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(note).then(function () { showToast("Guest weather update copied"); }, function () { showToast("Unable to copy automatically"); });
    } else showToast("Copy is not supported in this browser");
  }

  function updateLiveStatus(live) {
    elements.liveStatus.classList.toggle("is-live", live);
    elements.liveStatus.classList.toggle("is-fallback", !live);
    elements.liveStatus.querySelector("b").textContent = live ? "Live · Rincón" : "Showing last available view";
  }

  function renderAll() {
    renderCurrent();
    renderHourly();
    renderDaily();
    renderMarine();
    renderAlerts();
    renderHostImpact();
    renderMapLayer();
  }

  function loadWeather() {
    if (state.loading) return;
    state.loading = true;
    elements.refresh.classList.add("is-loading");
    elements.refresh.disabled = true;
    var requests = [
      fetchJson(FORECAST_URL),
      fetchJson(MARINE_URL),
      fetchJson(ALERTS_URL, { headers: { Accept: "application/geo+json" } }),
      fetchJson(buildGridUrl(WEATHER_GRID, false)),
      fetchJson(buildGridUrl(MARINE_GRID, true))
    ];
    Promise.allSettled(requests).then(function (results) {
      var forecastLive = results[0].status === "fulfilled";
      state.forecast = forecastLive ? results[0].value : (state.forecast || fallbackForecast());
      state.marine = results[1].status === "fulfilled" ? results[1].value : (state.marine || fallbackMarine());
      state.alertsAvailable = results[2].status === "fulfilled";
      state.alerts = state.alertsAvailable && Array.isArray(results[2].value.features) ? results[2].value.features : [];
      if (results[3].status === "fulfilled") state.weatherGrid = normalizeGridResponse(results[3].value, WEATHER_GRID);
      if (results[4].status === "fulfilled") state.marineGrid = normalizeGridResponse(results[4].value, MARINE_GRID);
      state.surfaceImages = {};
      renderAll();
      updateLiveStatus(forecastLive);
      var updated = new Intl.DateTimeFormat("en-US", { timeZone: "America/Puerto_Rico", hour: "numeric", minute: "2-digit", month: "short", day: "numeric" }).format(new Date());
      elements.updated.textContent = "Updated " + updated + " AST";
    }).finally(function () {
      state.loading = false;
      elements.refresh.classList.remove("is-loading");
      elements.refresh.disabled = false;
    });
  }

  function cacheElements() {
    elements.liveStatus = byId("weather-live-status");
    elements.refresh = byId("weather-refresh");
    elements.alertStrip = byId("weather-alert-strip");
    elements.alertIcon = elements.alertStrip.querySelector(".weather-alert-icon");
    elements.alertLabel = byId("weather-alert-label");
    elements.alertHeadline = byId("weather-alert-headline");
    elements.alertCopy = byId("weather-alert-copy");
    elements.alertLink = byId("weather-alert-link");
    elements.currentTime = byId("current-time");
    elements.currentIcon = byId("current-icon");
    elements.currentTemp = byId("current-temp");
    elements.currentCondition = byId("current-condition");
    elements.currentFeels = byId("current-feels");
    elements.currentHumidity = byId("current-humidity");
    elements.currentWind = byId("current-wind");
    elements.currentGusts = byId("current-gusts");
    elements.currentRain = byId("current-rain");
    elements.currentUv = byId("current-uv");
    elements.currentRange = byId("current-range");
    elements.currentSummary = byId("current-summary");
    elements.impactGrid = byId("weather-impact-grid");
    elements.hourlyTrack = byId("weather-hourly-track");
    elements.dailyList = byId("weather-daily-list");
    elements.waveHeight = byId("wave-height");
    elements.waveDirection = byId("wave-direction");
    elements.seaTemperature = byId("sea-temperature");
    elements.swellSummary = byId("swell-summary");
    elements.wavePeriod = byId("wave-period");
    elements.swellHeight = byId("swell-height");
    elements.swellPeriod = byId("swell-period");
    elements.coastOutlook = byId("coast-outlook");
    elements.mapKey = byId("weather-map-key");
    elements.mapSource = byId("weather-map-source");
    elements.mapLoading = byId("weather-map-loading");
    elements.mapError = byId("weather-map-error");
    elements.layerButtons = Array.prototype.slice.call(document.querySelectorAll("[data-layer]"));
    elements.updated = byId("weather-updated");
    elements.toast = byId("weather-toast");
  }

  function bindEvents() {
    elements.refresh.addEventListener("click", loadWeather);
    byId("copy-weather-note").addEventListener("click", copyGuestUpdate);
    elements.layerButtons.forEach(function (button) { button.addEventListener("click", function () { setLayer(button.dataset.layer); }); });
  }

  function initialize() {
    cacheElements();
    state.forecast = fallbackForecast();
    state.marine = fallbackMarine();
    renderAll();
    bindEvents();
    initializeMap();
    loadWeather();
    window.setInterval(loadWeather, 15 * 60 * 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
}());
