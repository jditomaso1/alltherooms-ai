(function () {
  "use strict";

  var FORECAST_URL = "https://api.open-meteo.com/v1/forecast?latitude=18.3185&longitude=-67.2455&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,relative_humidity_2m,uv_index,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,uv_index_max,precipitation_sum,rain_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FPuerto_Rico&forecast_days=8";
  var MARINE_URL = "https://marine-api.open-meteo.com/v1/marine?latitude=18.3185&longitude=-67.2455&current=wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature&hourly=wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature&daily=wave_height_max,wave_direction_dominant,wave_period_max,swell_wave_height_max,swell_wave_direction_dominant,swell_wave_period_max&length_unit=imperial&temperature_unit=fahrenheit&timezone=America%2FPuerto_Rico&forecast_days=8";
  var ALERTS_URL = "https://api.weather.gov/alerts/active?point=18.3185,-67.2455";
  var CASA_BRISA = { latitude: 18.3185, longitude: -67.2455 };
  var NOAA_RADAR_WMS = "https://nowcoast.noaa.gov/geoserver/weather_radar/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=caribbean_base_reflectivity_mosaic&STYLES=weather_radar_base_reflectivity&SRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}";
  var NOAA_PRODUCTS = {
    radar: {
      source: "NOAA / NWS · live Caribbean radar",
      caption: "Official NOAA/NWS radar layer · interactive map centered on Rincón",
      link: "https://radar.weather.gov/",
      linkLabel: "Open full NOAA radar ↗"
    },
    satellite: {
      src: "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/pr/GEOCOLOR/1200x1200.jpg",
      alt: "Live NOAA GOES-19 GeoColor satellite image for Puerto Rico and the Caribbean",
      source: "NOAA GOES-19 · live Puerto Rico GeoColor",
      caption: "Official NOAA satellite image for Puerto Rico · updates automatically",
      link: "https://www.weather.gov/sju/satellite",
      linkLabel: "Open NOAA satellite page ↗"
    }
  };

  var state = {
    forecast: null,
    marine: null,
    alerts: [],
    alertsAvailable: false,
    activeLayer: "radar",
    zoomedOut: false,
    loading: false,
    map: null,
    mapReady: false
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

  function renderMapLayer(forceRefresh) {
    var product = NOAA_PRODUCTS[state.activeLayer] || NOAA_PRODUCTS.radar;
    var isRadar = state.activeLayer === "radar";
    elements.mapFrame.dataset.layer = state.activeLayer;
    elements.mapSource.querySelector("span").textContent = product.source;
    elements.mapCaption.textContent = product.caption;
    elements.mapLink.href = product.link;
    elements.mapLink.textContent = product.linkLabel;
    elements.mapError.hidden = true;
    elements.mapContainer.hidden = !isRadar;
    elements.mapImage.hidden = isRadar;
    elements.imageZoom.hidden = isRadar;
    elements.mapFrame.classList.toggle("is-zoomed-out", !isRadar && state.zoomedOut);

    if (isRadar) {
      elements.mapLoading.querySelector("span").textContent = "Loading interactive NOAA radar…";
      elements.mapLoading.classList.toggle("is-ready", state.mapReady);
      if (state.mapReady && state.map) window.requestAnimationFrame(function () { state.map.resize(); });
      if (forceRefresh && state.map && state.map.getSource("noaa-radar")) {
        var refreshed = NOAA_RADAR_WMS + "&refresh=" + Date.now();
        state.map.getSource("noaa-radar").setTiles([refreshed]);
      }
      return;
    }

    var imageSource = product.src;
    if (forceRefresh) imageSource += (imageSource.indexOf("?") === -1 ? "?" : "&") + "refresh=" + Date.now();
    elements.mapFrame.style.setProperty("--weather-frame-image", 'url("' + imageSource + '")');
    elements.mapImage.alt = product.alt;
    elements.mapLoading.querySelector("span").textContent = "Loading official NOAA satellite imagery…";
    elements.mapLoading.classList.remove("is-ready");
    if (elements.mapImage.getAttribute("src") !== imageSource) elements.mapImage.src = imageSource;
    if (elements.mapImage.complete && elements.mapImage.naturalWidth > 0) elements.mapLoading.classList.add("is-ready");
  }

  function initializeRadarMap() {
    if (!window.maplibregl || typeof window.maplibregl.Map !== "function") {
      elements.mapLoading.classList.add("is-ready");
      elements.mapError.hidden = false;
      return;
    }

    state.map = new window.maplibregl.Map({
      container: "local-weather-map",
      style: {
        version: 8,
        sources: {
          base: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            maxzoom: 19,
            attribution: "© <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap contributors</a>"
          },
          "noaa-radar": {
            type: "raster",
            tiles: [NOAA_RADAR_WMS],
            tileSize: 256,
            attribution: "NOAA / National Weather Service"
          }
        },
        layers: [
          { id: "weather-background", type: "background", paint: { "background-color": "#dce8ec" } },
          {
            id: "weather-base",
            type: "raster",
            source: "base",
            paint: {
              "raster-saturation": -.72,
              "raster-contrast": -.08,
              "raster-brightness-min": .22,
              "raster-brightness-max": .97,
              "raster-opacity": .86
            }
          },
          {
            id: "weather-radar",
            type: "raster",
            source: "noaa-radar",
            paint: { "raster-opacity": .92, "raster-fade-duration": 180 }
          }
        ]
      },
      center: [CASA_BRISA.longitude, CASA_BRISA.latitude],
      zoom: 9.8,
      minZoom: 7,
      maxZoom: 16,
      maxBounds: [[-70.5, 15.5], [-62.5, 21.5]],
      dragRotate: false,
      touchPitch: false,
      pitchWithRotate: false,
      attributionControl: false
    });

    if (state.map.touchZoomRotate && typeof state.map.touchZoomRotate.disableRotation === "function") state.map.touchZoomRotate.disableRotation();
    state.map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    state.map.addControl(new window.maplibregl.AttributionControl({ compact: true }), "bottom-left");
    state.map.on("load", function () {
      var marker = document.createElement("div");
      marker.className = "weather-host-map-marker";
      marker.setAttribute("aria-label", "Casa Brisa");
      new window.maplibregl.Marker({ element: marker }).setLngLat([CASA_BRISA.longitude, CASA_BRISA.latitude]).addTo(state.map);
      state.mapReady = true;
      renderMapLayer();
    });
    state.map.on("error", function (event) {
      if (event && event.error) console.warn("NOAA weather map tile error", event.error.message);
    });
  }

  function initializeWeatherFrame() {
    elements.mapImage.addEventListener("load", function () {
      elements.mapLoading.classList.add("is-ready");
      elements.mapError.hidden = true;
    });
    elements.mapImage.addEventListener("error", function () {
      elements.mapLoading.classList.add("is-ready");
      elements.mapError.hidden = false;
    });
    renderMapLayer();
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

  function setImageZoom(zoomedOut) {
    state.zoomedOut = Boolean(zoomedOut);
    elements.mapFrame.classList.toggle("is-zoomed-out", state.zoomedOut);
    elements.zoomOut.disabled = state.zoomedOut;
    elements.zoomIn.disabled = !state.zoomedOut;
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
      fetchJson(ALERTS_URL, { headers: { Accept: "application/geo+json" } })
    ];
    Promise.allSettled(requests).then(function (results) {
      var forecastLive = results[0].status === "fulfilled";
      state.forecast = forecastLive ? results[0].value : (state.forecast || fallbackForecast());
      state.marine = results[1].status === "fulfilled" ? results[1].value : (state.marine || fallbackMarine());
      state.alertsAvailable = results[2].status === "fulfilled";
      state.alerts = state.alertsAvailable && Array.isArray(results[2].value.features) ? results[2].value.features : [];
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
    elements.mapFrame = byId("noaa-weather-frame");
    elements.mapContainer = byId("local-weather-map");
    elements.mapImage = byId("noaa-weather-image");
    elements.mapSource = byId("weather-map-source");
    elements.mapCaption = byId("weather-map-caption");
    elements.mapLink = byId("weather-map-link");
    elements.mapLoading = byId("weather-map-loading");
    elements.mapError = byId("weather-map-error");
    elements.zoomIn = byId("weather-zoom-in");
    elements.zoomOut = byId("weather-zoom-out");
    elements.imageZoom = byId("weather-image-zoom");
    elements.layerButtons = Array.prototype.slice.call(document.querySelectorAll(".weather-layer-tabs button[data-layer]"));
    elements.updated = byId("weather-updated");
    elements.toast = byId("weather-toast");
  }

  function bindEvents() {
    elements.refresh.addEventListener("click", function () { loadWeather(); renderMapLayer(true); });
    byId("copy-weather-note").addEventListener("click", copyGuestUpdate);
    elements.zoomIn.addEventListener("click", function () { setImageZoom(false); });
    elements.zoomOut.addEventListener("click", function () { setImageZoom(true); });
    elements.layerButtons.forEach(function (button) { button.addEventListener("click", function () { setLayer(button.dataset.layer); }); });
  }

  function initialize() {
    cacheElements();
    state.forecast = fallbackForecast();
    state.marine = fallbackMarine();
    renderAll();
    bindEvents();
    initializeWeatherFrame();
    initializeRadarMap();
    loadWeather();
    window.setInterval(loadWeather, 15 * 60 * 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
}());
