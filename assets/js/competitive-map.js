(function () {
  "use strict";

  var DATA_URL = "/data/public/rincon-map-listings.json";
  var HOST_PROPERTY_ID = "1731305794703529900";
  var HOST_CENTER = [-67.2455, 18.3185];
  var DEFAULT_CENTER = [HOST_CENTER[0], HOST_CENTER[1]];
  var DEFAULT_ZOOM = 11.35;
  var LIST_LIMIT = 18;
  var money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });

  var records = [];
  var visibleRecords = [];
  var recordById = new Map();
  var comparisons = new Set();
  var selectedRecord = null;
  var map = null;
  var hostMarker = null;
  var hoverPopup = null;
  var toastTimer = null;
  var terrainEnabled = false;

  var elements = {
    loading: document.getElementById("map-loading"),
    error: document.getElementById("map-error"),
    search: document.getElementById("filter-search"),
    guests: document.getElementById("filter-guests"),
    bedrooms: document.getElementById("filter-bedrooms"),
    price: document.getElementById("filter-price"),
    rating: document.getElementById("filter-rating"),
    type: document.getElementById("filter-type"),
    feature: document.getElementById("filter-feature"),
    direct: document.getElementById("filter-direct"),
    reset: document.getElementById("reset-filters"),
    resultCount: document.getElementById("result-count"),
    railCount: document.getElementById("rail-result-count"),
    comparisonCount: document.getElementById("comparison-count"),
    list: document.getElementById("competitive-property-list"),
    selected: document.getElementById("selected-map-property"),
    save: document.getElementById("save-map-view"),
    terrain: document.getElementById("terrain-toggle"),
    resetView: document.getElementById("reset-map-view"),
    toast: document.getElementById("map-toast")
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatPrice(value) {
    return Number(value) > 0 ? money.format(Number(value)) : "Price unavailable";
  }

  function plural(value, word) {
    return value + " " + word + (Number(value) === 1 ? "" : "s");
  }

  function distanceMiles(record) {
    var earthRadiusMiles = 3958.8;
    var toRadians = Math.PI / 180;
    var lat1 = HOST_CENTER[1] * toRadians;
    var lat2 = Number(record.latitude) * toRadians;
    var deltaLat = (Number(record.latitude) - HOST_CENTER[1]) * toRadians;
    var deltaLng = (Number(record.longitude) - HOST_CENTER[0]) * toRadians;
    var a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function distanceLabel(record) {
    var distance = distanceMiles(record);
    if (distance < .1) return "Nearby";
    return distance.toFixed(distance < 1 ? 1 : 1) + " mi from Casa Brisa";
  }

  function propertyUrl(record) {
    return "/prototype/host/market/rincon/properties/" + encodeURIComponent(record.id) + "/";
  }

  function showToast(message) {
    if (!elements.toast) return;
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    toastTimer = window.setTimeout(function () {
      elements.toast.classList.remove("show");
    }, 2600);
  }

  function getState() {
    return {
      search: elements.search.value.trim().toLowerCase(),
      guests: Number(elements.guests.value || 0),
      bedrooms: Number(elements.bedrooms.value || 0),
      price: elements.price.value,
      rating: Number(elements.rating.value || 0),
      type: elements.type.value,
      feature: elements.feature.value,
      direct: elements.direct.getAttribute("aria-pressed") === "true"
    };
  }

  function priceMatches(price, range) {
    if (range === "all") return true;
    var parts = range.split("-").map(Number);
    var value = Number(price || 0);
    return value > 0 && value >= parts[0] && value < parts[1];
  }

  function filterRecords() {
    var state = getState();
    return records.filter(function (record) {
      if (state.search && record.title.toLowerCase().indexOf(state.search) === -1) return false;
      if (state.guests && Number(record.capacity || 0) < state.guests) return false;
      if (state.bedrooms && Number(record.bedrooms || 0) < state.bedrooms) return false;
      if (!priceMatches(record.nightlyPrice, state.price)) return false;
      if (state.rating && Number(record.rating || 0) < state.rating) return false;
      if (state.type !== "all" && record.propertyGroup !== state.type) return false;
      if (state.feature !== "all" && record.features.indexOf(state.feature) === -1) return false;
      if (state.direct && !record.hasDirectWebsite) return false;
      return true;
    });
  }

  function toFeature(record) {
    return {
      type: "Feature",
      id: record.id,
      geometry: {
        type: "Point",
        coordinates: [Number(record.longitude), Number(record.latitude)]
      },
      properties: {
        id: record.id,
        title: record.title,
        nightlyPrice: Number(record.nightlyPrice || 0),
        capacity: Number(record.capacity || 0),
        rating: Number(record.rating || 0),
        bedrooms: Number(record.bedrooms || 0),
        propertyType: record.propertyType,
        hasDirectWebsite: Boolean(record.hasDirectWebsite)
      }
    };
  }

  function featureCollection(items) {
    return {
      type: "FeatureCollection",
      features: items.map(toFeature)
    };
  }

  function writeFiltersToUrl() {
    var state = getState();
    var url = new URL(window.location.href);
    var pairs = {
      q: state.search,
      guests: state.guests || "",
      bedrooms: state.bedrooms || "",
      price: state.price === "all" ? "" : state.price,
      rating: state.rating || "",
      type: state.type === "all" ? "" : state.type,
      feature: state.feature === "all" ? "" : state.feature,
      direct: state.direct ? "1" : ""
    };
    Object.keys(pairs).forEach(function (key) {
      if (pairs[key] === "") url.searchParams.delete(key);
      else url.searchParams.set(key, String(pairs[key]));
    });
    if (!url.searchParams.has("property")) url.searchParams.set("property", "casa-brisa");
    window.history.replaceState({}, "", url);
  }

  function hydrateFiltersFromUrl() {
    var params = new URLSearchParams(window.location.search);
    elements.search.value = params.get("q") || "";
    setSelectIfValid(elements.guests, params.get("guests"));
    setSelectIfValid(elements.bedrooms, params.get("bedrooms"));
    setSelectIfValid(elements.price, params.get("price"));
    setSelectIfValid(elements.rating, params.get("rating"));
    setSelectIfValid(elements.type, params.get("type"));
    setSelectIfValid(elements.feature, params.get("feature"));
    elements.direct.setAttribute("aria-pressed", params.get("direct") === "1" ? "true" : "false");
  }

  function setSelectIfValid(select, value) {
    if (!value) return;
    var valid = Array.prototype.some.call(select.options, function (option) {
      return option.value === value;
    });
    if (valid) select.value = value;
  }

  function renderSelected(record) {
    if (!record || !elements.selected) return;
    var isCompared = comparisons.has(record.id);
    var bedroomLabel = record.bedrooms ? plural(record.bedrooms, "bedroom") : plural(record.capacity || 0, "guest");
    elements.selected.innerHTML =
      '<img src="' + escapeHtml(record.image) + '" alt="">' +
      '<div><p>' + (record.id === HOST_PROPERTY_ID ? "Your active property" : escapeHtml(distanceLabel(record))) + '</p>' +
      '<h4>' + escapeHtml(record.id === HOST_PROPERTY_ID ? "Casa Brisa" : record.title) + '</h4>' +
      '<dl><div><dt>Nightly</dt><dd>' + escapeHtml(formatPrice(record.nightlyPrice)) + '</dd></div>' +
      '<div><dt>Capacity</dt><dd>' + escapeHtml(plural(record.capacity || 0, "guest")) + '</dd></div>' +
      '<div><dt>Details</dt><dd>' + escapeHtml(bedroomLabel) + '</dd></div></dl>' +
      '<div class="selected-property-actions"><a href="' + propertyUrl(record) + '" target="_blank" rel="noopener">View property ↗</a>' +
      '<button type="button" data-compare-id="' + escapeHtml(record.id) + '" class="' + (isCompared ? "is-selected" : "") + '">' + (isCompared ? "Selected ✓" : "Compare +") + '</button></div></div>';
    elements.selected.hidden = false;
  }

  function renderList(items) {
    if (!elements.list) return;
    var closest = items
      .filter(function (record) { return record.id !== HOST_PROPERTY_ID; })
      .map(function (record) { return { record: record, distance: distanceMiles(record) }; })
      .sort(function (a, b) { return a.distance - b.distance; })
      .slice(0, LIST_LIMIT);

    if (!closest.length) {
      elements.list.innerHTML = '<div class="competitive-list-empty"><strong>No properties match.</strong><span>Try clearing one or more filters to widen the competitive set.</span></div>';
      return;
    }

    elements.list.innerHTML = closest.map(function (item) {
      var record = item.record;
      var isCompared = comparisons.has(record.id);
      var rating = record.rating ? "★ " + Number(record.rating).toFixed(2) : "Not rated";
      var direct = record.hasDirectWebsite ? " · Direct site" : "";
      return '<article class="competitive-property-row" data-property-id="' + escapeHtml(record.id) + '">' +
        '<button class="property-open" type="button" data-property-id="' + escapeHtml(record.id) + '" aria-label="Show ' + escapeHtml(record.title) + ' on map">' +
        '<img src="' + escapeHtml(record.image) + '" alt="" loading="lazy">' +
        '<span class="competitive-property-copy"><span>' + escapeHtml(item.distance.toFixed(1)) + ' mi away' + direct + '</span><strong>' + escapeHtml(record.title) + '</strong><small>' + escapeHtml(formatPrice(record.nightlyPrice)) + ' nightly · ' + escapeHtml(rating) + '</small></span></button>' +
        '<button class="compare-property ' + (isCompared ? "is-selected" : "") + '" type="button" data-compare-id="' + escapeHtml(record.id) + '" aria-label="' + (isCompared ? "Remove from" : "Add to") + ' comparison">' + (isCompared ? "✓" : "+") + '</button></article>';
    }).join("");
  }

  function updateComparisonCount() {
    elements.comparisonCount.textContent = comparisons.size + (comparisons.size === 1 ? " selected" : " selected");
  }

  function toggleComparison(id) {
    if (comparisons.has(id)) comparisons.delete(id);
    else comparisons.add(id);
    updateComparisonCount();
    renderList(visibleRecords);
    if (selectedRecord) renderSelected(selectedRecord);
  }

  function selectProperty(record, options) {
    if (!record) return;
    selectedRecord = record;
    renderSelected(record);
    updateSelectedSource(record);
    if (!options || options.move !== false) {
      map.easeTo({
        center: [Number(record.longitude), Number(record.latitude)],
        zoom: Math.max(map.getZoom(), 14.2),
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650,
        offset: [-100, 0]
      });
    }
  }

  function updateSelectedSource(record) {
    if (!map || !map.getSource("selected-property")) return;
    map.getSource("selected-property").setData(featureCollection(record ? [record] : []));
  }

  function applyFilters() {
    visibleRecords = filterRecords();
    var count = visibleRecords.length;
    elements.resultCount.textContent = count.toLocaleString("en-US");
    elements.railCount.textContent = count.toLocaleString("en-US") + (count === 1 ? " market record" : " market records");
    if (map && map.getSource("properties")) {
      map.getSource("properties").setData(featureCollection(visibleRecords));
    }
    renderList(visibleRecords);
    writeFiltersToUrl();
  }

  function resetFilters() {
    elements.search.value = "";
    elements.guests.value = "0";
    elements.bedrooms.value = "0";
    elements.price.value = "all";
    elements.rating.value = "0";
    elements.type.value = "all";
    elements.feature.value = "all";
    elements.direct.setAttribute("aria-pressed", "false");
    applyFilters();
    if (map) map.easeTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, duration: 500 });
  }

  function setTerrainMode(enabled, options) {
    if (!map || !map.getSource("terrain-source")) return;
    terrainEnabled = Boolean(enabled);
    map.setTerrain(terrainEnabled ? { source: "terrain-source", exaggeration: 1.16 } : null);
    elements.terrain.setAttribute("aria-pressed", terrainEnabled ? "true" : "false");
    elements.terrain.querySelector("b").textContent = terrainEnabled ? "2D topographic" : "3D terrain";
    if (!options || options.move !== false) {
      map.easeTo({
        pitch: terrainEnabled ? 55 : 0,
        bearing: terrainEnabled ? -18 : 0,
        zoom: terrainEnabled ? Math.max(map.getZoom(), 11.85) : map.getZoom(),
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700
      });
    } else {
      map.jumpTo({ pitch: terrainEnabled ? 55 : 0, bearing: terrainEnabled ? -18 : 0 });
    }
  }

  function resetMapView() {
    if (!map) return;
    setTerrainMode(false, { move: false });
    map.easeTo({
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: 0,
      bearing: 0,
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650
    });
    var url = new URL(window.location.href);
    ["lng", "lat", "z", "terrain"].forEach(function (key) { url.searchParams.delete(key); });
    window.history.replaceState({}, "", url);
    showToast("Map returned to the 2D topographic view.");
  }

  function createHostMarker(record) {
    if (!record || hostMarker) return;
    var markerElement = document.createElement("button");
    markerElement.type = "button";
    markerElement.className = "host-map-marker";
    markerElement.setAttribute("aria-label", "Show Casa Brisa");
    markerElement.innerHTML = "<i></i><span>Casa Brisa</span>";
    markerElement.addEventListener("click", function () {
      selectProperty(record);
    });
    hostMarker = new window.maplibregl.Marker({ element: markerElement, anchor: "bottom" })
      .setLngLat([Number(record.longitude), Number(record.latitude)])
      .addTo(map);
  }

  function addMapData() {
    map.addSource("properties", {
      type: "geojson",
      data: featureCollection(visibleRecords)
    });

    map.addLayer({
      id: "property-points",
      type: "circle",
      source: "properties",
      paint: {
        "circle-color": ["case", ["==", ["get", "hasDirectWebsite"], true], "#1ea672", "#3f6fff"],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 1.4, 11, 2, 13, 3.8, 16, 7],
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 9, .35, 12, .8, 16, 1.5],
        "circle-stroke-color": "#ffffff",
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 9, .62, 12, .78, 16, .94]
      }
    });

    map.addSource("selected-property", {
      type: "geojson",
      data: featureCollection([])
    });

    map.addLayer({
      id: "selected-property-ring",
      type: "circle",
      source: "selected-property",
      paint: {
        "circle-radius": 12,
        "circle-color": "rgba(255,189,53,.22)",
        "circle-stroke-width": 3,
        "circle-stroke-color": "#ffbd35"
      }
    });

    map.on("click", "property-points", function (event) {
      var feature = event.features && event.features[0];
      if (!feature) return;
      selectProperty(recordById.get(String(feature.properties.id)));
    });

    map.on("mouseenter", "property-points", function (event) {
      map.getCanvas().style.cursor = "pointer";
      var feature = event.features && event.features[0];
      var record = feature ? recordById.get(String(feature.properties.id)) : null;
      if (!record) return;
      if (hoverPopup) hoverPopup.remove();
      hoverPopup = new window.maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 9 })
        .setLngLat([Number(record.longitude), Number(record.latitude)])
        .setHTML('<strong style="font-size:11px;color:#071c38">' + escapeHtml(record.title) + '</strong><span style="display:block;margin-top:3px;color:#647187;font-size:9px">' + escapeHtml(formatPrice(record.nightlyPrice)) + ' nightly</span>')
        .addTo(map);
    });

    map.on("mouseleave", "property-points", function () {
      map.getCanvas().style.cursor = "";
      if (hoverPopup) hoverPopup.remove();
      hoverPopup = null;
    });

    var host = recordById.get(HOST_PROPERTY_ID);
    createHostMarker(host);
    if (host) selectProperty(host, { move: false });
    if (new URLSearchParams(window.location.search).get("terrain") === "1") {
      setTerrainMode(true, { move: false });
    }
    elements.loading.classList.add("is-ready");
  }

  function initializeMap() {
    if (!window.maplibregl || typeof window.maplibregl.Map !== "function") {
      throw new Error("Interactive maps are not supported in this browser.");
    }
    var params = new URLSearchParams(window.location.search);
    var savedLngValue = params.get("lng");
    var savedLatValue = params.get("lat");
    var savedLng = Number(savedLngValue);
    var savedLat = Number(savedLatValue);
    var savedZoom = Number(params.get("z"));
    var hasSavedCenter = savedLngValue !== null && savedLatValue !== null && Number.isFinite(savedLng) && Number.isFinite(savedLat);
    var initialCenter = hasSavedCenter ? [savedLng, savedLat] : DEFAULT_CENTER;
    var initialZoom = Number.isFinite(savedZoom) && savedZoom > 0 ? savedZoom : DEFAULT_ZOOM;

    map = new window.maplibregl.Map({
      container: "competitive-map",
      style: {
        version: 8,
        sources: {
          topography: {
            type: "raster",
            tiles: [
              "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
              "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
              "https://c.tile.opentopomap.org/{z}/{x}/{y}.png"
            ],
            tileSize: 256,
            maxzoom: 17,
            attribution: "Map data © <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap contributors</a>, SRTM | Map style © <a href='https://opentopomap.org'>OpenTopoMap</a> (CC-BY-SA)"
          },
          "terrain-source": {
            type: "raster-dem",
            url: "https://tiles.mapterhorn.com/tilejson.json"
          },
          "hillshade-source": {
            type: "raster-dem",
            url: "https://tiles.mapterhorn.com/tilejson.json"
          }
        },
        layers: [
          {
            id: "map-background",
            type: "background",
            paint: { "background-color": "#dce9e7" }
          },
          {
            id: "topographic-base",
            type: "raster",
            source: "topography",
            paint: {
              "raster-saturation": -.16,
              "raster-contrast": .06,
              "raster-brightness-min": .08,
              "raster-brightness-max": .98,
              "raster-opacity": .97
            }
          },
          {
            id: "terrain-hillshade",
            type: "hillshade",
            source: "hillshade-source",
            paint: {
              "hillshade-exaggeration": .34,
              "hillshade-shadow-color": "rgba(18,42,50,.48)",
              "hillshade-highlight-color": "rgba(255,250,229,.62)",
              "hillshade-accent-color": "rgba(74,104,79,.34)"
            }
          }
        ]
      },
      center: initialCenter,
      zoom: initialZoom,
      minZoom: 9.3,
      maxZoom: 18,
      maxPitch: 60,
      dragRotate: false,
      touchPitch: false,
      pitchWithRotate: false,
      maxBounds: [[-67.43, 18.12], [-67.02, 18.55]],
      attributionControl: false
    });
    if (map.touchZoomRotate && typeof map.touchZoomRotate.disableRotation === "function") {
      map.touchZoomRotate.disableRotation();
    }
    map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new window.maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.on("load", addMapData);
    map.on("error", function (event) {
      if (event && event.error) console.warn("Competitive map tile error", event.error.message);
    });
  }

  function bindControls() {
    [elements.guests, elements.bedrooms, elements.price, elements.rating, elements.type, elements.feature].forEach(function (control) {
      control.addEventListener("change", applyFilters);
    });
    var searchTimer = null;
    elements.search.addEventListener("input", function () {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(applyFilters, 120);
    });
    elements.direct.addEventListener("click", function () {
      elements.direct.setAttribute("aria-pressed", elements.direct.getAttribute("aria-pressed") === "true" ? "false" : "true");
      applyFilters();
    });
    elements.reset.addEventListener("click", resetFilters);
    elements.terrain.addEventListener("click", function () {
      setTerrainMode(!terrainEnabled);
    });
    elements.resetView.addEventListener("click", resetMapView);

    document.addEventListener("click", function (event) {
      var compareButton = event.target.closest("[data-compare-id]");
      if (compareButton) {
        toggleComparison(compareButton.getAttribute("data-compare-id"));
        return;
      }
      var propertyButton = event.target.closest("[data-property-id]");
      if (propertyButton) selectProperty(recordById.get(propertyButton.getAttribute("data-property-id")));
    });

    elements.save.addEventListener("click", function () {
      var url = new URL(window.location.href);
      if (map) {
        var center = map.getCenter();
        url.searchParams.set("lng", center.lng.toFixed(5));
        url.searchParams.set("lat", center.lat.toFixed(5));
        url.searchParams.set("z", map.getZoom().toFixed(2));
        if (terrainEnabled) url.searchParams.set("terrain", "1");
        else url.searchParams.delete("terrain");
        window.history.replaceState({}, "", url);
      }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url.toString()).then(function () {
          showToast("View saved — shareable link copied.");
        }, function () {
          showToast("View saved in this page link.");
        });
      } else {
        showToast("View saved in this page link.");
      }
    });
  }

  function fail(error) {
    console.error(error);
    elements.loading.classList.add("is-ready");
    elements.error.hidden = false;
  }

  hydrateFiltersFromUrl();
  bindControls();
  fetch(DATA_URL, { credentials: "same-origin" })
    .then(function (response) {
      if (!response.ok) throw new Error("Property data request failed with " + response.status);
      return response.json();
    })
    .then(function (data) {
      if (!Array.isArray(data) || !data.length) throw new Error("No competitive property records were found.");
      records = data.filter(function (record) {
        return Number.isFinite(Number(record.latitude)) && Number.isFinite(Number(record.longitude));
      });
      records.forEach(function (record) { recordById.set(String(record.id), record); });
      visibleRecords = filterRecords();
      applyFilters();
      initializeMap();
    })
    .catch(fail);
}());
