const COLOR = {
  park: getCssVar("--accent") || "#2a9d8f",
  parkMedium: "#43aa8b",
  parkSmall: "#90be6d",
  business: getCssVar("--warn") || "#f4a261",
  facility: "#577590",
  severe: getCssVar("--highlight") || "#e76f51",
  text: getCssVar("--text") || "#f8fafc",
};

const DATA_PATHS = {
  businessZip: "data/processed/business_by_zip.json",
  businessNeighborhoods: "data/processed/business_neighborhoods.json",
  neighborhoodCentroids: "data/processed/neighborhood_centroids.json",
  parks: "data/processed/parks.json",
  parkAcres: "data/processed/park_acres_by_district.json",
  facilities: "data/processed/facilities.json",
  facilityCounts: "data/processed/facility_counts_by_district.json",
  housing: "data/processed/housing_burden.json",
  rentTrend: "data/processed/rent_trend.json",
  addressPoints: "data/processed/address_points.json",
  schools: "data/processed/schools.json",
  schoolCounts: "data/processed/school_counts_by_zip.json",
};

const TOUR_STEPS = [
  {
    id: "business-core",
    neighborhoods: ["Financial District/South Beach", "Mission"],
    status: "Business density piles up along the eastern spine.",
    message: "Financial District/South Beach and Mission alone host over 65,000 listings—nearly a third of all records.",
    narration:
      "Scene 1: The tour opens downtown where Financial District/South Beach and Mission together hold nearly one-third of all listings.",
    scrollTo: "#insight-business",
    duration: 6500,
  },
  {
    id: "resource-gap",
    neighborhoods: ["South of Market", "Sunset/Parkside"],
    status: "Layered resources show downtown saturation versus Sunset scarcity.",
    message: "SOMA stacks jobs next to mini parks while Sunset/Parkside trades jobs for green space.",
    narration:
      "Scene 2: SOMA glows with jobs yet only mini parks, while Sunset/Parkside flips the script with acreage but fewer services.",
    scrollTo: "#insight-colocation",
    duration: 6500,
  },
  {
    id: "housing-pressure",
    neighborhoods: ["Tenderloin", "Bayview Hunters Point"],
    status: "Housing cost burdens mirror the resource deserts.",
    message: "Tenderloin and Bayview Hunters Point lead on severe renter burdens while civic facilities lag.",
    narration:
      "Scene 3: Housing charts reveal Tenderloin and Bayview Hunters Point bearing the heaviest renter burdens where services lag.",
    scrollTo: "#insight-housing",
    duration: 6500,
  },
  {
    id: "rent-trend",
    neighborhoods: ["Mission", "Outer Richmond"],
    status: "Rents rebound citywide after the 2020 dip.",
    message: "Mission and Outer Richmond both climb back toward pre-pandemic rents, keeping pressure high.",
    narration:
      "Scene 4: The rent timeline shows Mission and Outer Richmond both climbing back toward pre-pandemic peaks.",
    scrollTo: "#insight-rent",
    duration: 6500,
  },
  {
    id: "explore",
    neighborhoods: [],
    status: "Now try the Open Exploration tools with your ZIP or address.",
    message: "Ready to explore? Scroll to Open Exploration and plug in your own location.",
    narration:
      "Final scene: Take the controls—scroll to Open Exploration and plug in your ZIP or an address to keep investigating.",
    scrollTo: "#open-explore",
    duration: 6000,
  },
];

const TOUR_STATUS_DEFAULT = "Press play to watch each insight highlight automatically.";
const TOUR_NARRATION_DEFAULT = "This narration ticker summarizes each scene while the tour runs.";
const SPEECH_SUPPORTED = typeof window !== "undefined" && "speechSynthesis" in window;
const NARRATION_GAP_MS = 900;

const tooltipEl = document.getElementById("tooltip");
const highlightEl = document.getElementById("business-highlight");
const tourPlayBtn = document.getElementById("tour-play");
const tourPauseBtn = document.getElementById("tour-pause");
const tourStopBtn = document.getElementById("tour-stop");
const tourStatusEl = document.getElementById("tour-status");
const tourNarrationEl = document.getElementById("tour-script");
const tourAudioToggle = document.getElementById("tour-audio-toggle");
const tourAudioHint = document.getElementById("tour-audio-hint");
const tourVoiceSelect = document.getElementById("tour-voice");
const highlightDefaultMessage =
  (highlightEl && highlightEl.dataset && highlightEl.dataset.default) ||
  "Hover a ZIP bar or a business bubble to see which neighborhoods are linked.";
const sharedState = {
  businessMarkers: new Map(),
  resourceBusinessMarkers: new Map(),
  businessBarNodes: new Map(),
  businessZipLookup: new Map(),
  activeNeighborhoods: new Set(),
  highlightContext: null,
  rentEntries: [],
  rentControls: null,
  maps: {},
  activeZip: null,
  zipFocusMarkers: {},
  zipList: [],
  neighborhoodCentroids: new Map(),
  addressPoints: [],
  addressMarker: null,
  parks: [],
  facilities: [],
  schools: [],
  schoolCountsByZip: new Map(),
  citywideBusinessStats: null,
  shareRanking: [],
  tourTimeoutId: null,
  tourStepIndex: -1,
  tourActive: false,
  dataReady: false,
  tourPaused: false,
  tourPendingStepDuration: 0,
  tourRemainingDuration: 0,
  tourStepTimestamp: 0,
  narrationSupported: SPEECH_SUPPORTED,
  narrationAudioEnabled: false,
  currentTourNarration: "",
  awaitingNarrationEnd: false,
  availableVoices: [],
  selectedVoiceURI: null,
  pausedDuringNarration: false,
  currentUtterance: null,
};

init();

async function init() {
  attachNavListeners();
  initTourControls();

  try {
    const [
      businessZip,
      businessNeighborhoods,
      neighborhoodCentroids,
      parks,
      facilities,
      housing,
      rentTrend,
      addressPoints,
      schools,
      schoolCounts,
    ] = await Promise.all([
      fetchJSON(DATA_PATHS.businessZip),
      fetchJSON(DATA_PATHS.businessNeighborhoods),
      fetchJSON(DATA_PATHS.neighborhoodCentroids),
      fetchJSON(DATA_PATHS.parks),
      fetchJSON(DATA_PATHS.facilities),
      fetchJSON(DATA_PATHS.housing),
      fetchJSON(DATA_PATHS.rentTrend),
      fetchJSON(DATA_PATHS.addressPoints),
      fetchJSON(DATA_PATHS.schools),
      fetchJSON(DATA_PATHS.schoolCounts),
    ]);

    const centroidLookup = new Map(
      neighborhoodCentroids.entries.map((entry) => [entry.neighborhood, entry.centroid])
    );

    sharedState.businessZipLookup = new Map(businessZip.entries.map((entry) => [entry.zip, entry]));
    sharedState.neighborhoodCentroids = centroidLookup;
    sharedState.zipList = businessZip.entries.map((entry) => entry.zip).sort();
    sharedState.addressPoints = addressPoints.entries || [];
    sharedState.parks = parks.entries || [];
    sharedState.facilities = facilities.entries || [];
    sharedState.schools = schools.entries || [];
    sharedState.schoolCountsByZip = new Map((schoolCounts.entries || []).map((entry) => [entry.zip, entry]));
    sharedState.dataReady = true;

    createHookMaps(parks.entries, businessNeighborhoods.entries, centroidLookup, businessZip.total_businesses);
    createResourceMap(parks.entries, businessNeighborhoods.entries, centroidLookup, facilities.entries);
    renderBusinessZipChart(businessZip);
    renderHousingBurdenChart(housing);
    renderRentTrendChart(rentTrend.entries);
    initLayerToggles();
    initializeZipSearch();
    setTourButtonState(false);
    updateTourStatus(TOUR_STATUS_DEFAULT);
    updateTourNarration(TOUR_NARRATION_DEFAULT);
  } catch (error) {
    console.error(error);
    showTooltip(window.innerWidth / 2, window.innerHeight / 2, "Failed to load the data. Refresh to try again.");
    updateTourStatus("Guided tour unavailable until the data loads successfully.");
    updateTourNarration("Reload the page once data loads to enable the guided narration.");
  }
}

function attachNavListeners() {
  document.querySelectorAll(".story-nav button").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.querySelector(button.dataset.target);
      if (target) {
        target.scrollIntoView({ behavior: "smooth" });
      }
    });
  });
}

async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}`);
  return response.json();
}

function createLeafletMap(containerId, options = {}) {
  const defaultOptions = {
    center: [37.76, -122.44],
    zoom: 12,
    scrollWheelZoom: false,
    zoomControl: false,
  };
  const map = L.map(containerId, { ...defaultOptions, ...options });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);

  L.control
    .zoom({
      position: "topright",
    })
    .addTo(map);

  const container = document.getElementById(containerId);
  if (container) {
    container._leaflet_map = map;
  }

  return map;
}

function createHookMaps(parks, businessNeighborhoods, centroidLookup, totalBusinesses) {
  sharedState.businessMarkers.clear();
  const parksMap = createLeafletMap("parks-map", { zoom: 12 });
  const businessMap = createLeafletMap("business-map", { zoom: 12 });
  sharedState.maps.parks = parksMap;
  sharedState.maps.business = businessMap;

  const parkCategoryColor = (category) => {
    if (category === "Regional Park (100+ acres)") return COLOR.park;
    if (category === "Neighborhood Park (10-99 acres)") return COLOR.parkMedium;
    return COLOR.parkSmall;
  };

  const parkMarkers = [];
  parks
    .filter((park) => park.coordinates?.lat && park.coordinates?.lon)
    .forEach((park) => {
      const radius = Math.min(30, 6 + Math.sqrt(park.acres || 0) * 1.6);
      const marker = L.circleMarker([park.coordinates.lat, park.coordinates.lon], {
        radius: radius || 4,
        color: parkCategoryColor(park.category),
        fillColor: parkCategoryColor(park.category),
        fillOpacity: 0.7,
        weight: 1,
      });
      marker.bindTooltip(
        `<strong>${park.name}</strong><br>${park.category}<br>${park.acres.toLocaleString()} acres`,
        { direction: "top" }
      );
      marker.addTo(parksMap);
      parkMarkers.push(marker);
    });

  if (parkMarkers.length) {
    const group = L.featureGroup(parkMarkers);
    parksMap.fitBounds(group.getBounds().pad(0.15));
  }

  const businessEntries = businessNeighborhoods
    .map((entry) => {
      const centroid = centroidLookup.get(entry.neighborhood);
      return centroid
        ? {
            ...entry,
            centroid,
          }
        : null;
    })
    .filter(Boolean)
    .slice(0, 40); // focus on top neighborhoods

  const maxBusiness = d3.max(businessEntries, (d) => d.business_count) || 1;

  businessEntries.forEach((entry) => {
    const share = entry.business_count / totalBusinesses;
    const radius = Math.max(6, (entry.business_count / maxBusiness) * 28);
    const marker = L.circleMarker([entry.centroid.lat, entry.centroid.lon], {
      radius,
      color: COLOR.business,
      fillColor: COLOR.business,
      fillOpacity: 0.75,
      weight: 1,
    });
    marker._baseStyle = {
      radius: marker.options.radius,
      fillOpacity: marker.options.fillOpacity ?? 0.75,
      fillColor: marker.options.fillColor ?? COLOR.business,
      color: marker.options.color ?? COLOR.business,
      weight: marker.options.weight ?? 1,
    };
    marker
      .bindTooltip(
        `<strong>${entry.neighborhood}</strong><br>${entry.business_count.toLocaleString()} businesses<br>${(
          share * 100
        ).toFixed(1)}% of city total`,
        { direction: "top" }
      )
      .addTo(businessMap);

    marker.on("mouseover", () =>
      highlightNeighborhoods([entry.neighborhood], {
        type: "neighborhood",
        source: "open-explore",
        neighborhoods: [entry.neighborhood],
      })
    );
    marker.on("mouseout", clearNeighborhoodHighlight);
    addMarkerReference(sharedState.businessMarkers, entry.neighborhood, marker);
  });
}

function createResourceMap(parks, businessNeighborhoods, centroidLookup, facilities) {
  sharedState.resourceBusinessMarkers.clear();
  const map = createLeafletMap("resource-map", { zoom: 12 });
  sharedState.maps.resource = map;
  const layers = {
    parks: L.layerGroup(),
    businesses: L.layerGroup(),
    facilities: L.layerGroup(),
    schools: L.layerGroup(),
  };

  parks
    .filter((park) => park.coordinates?.lat && park.coordinates?.lon)
    .forEach((park) => {
      const radius = Math.min(24, 4 + Math.sqrt(park.acres || 0) * 1.2);
      L.circleMarker([park.coordinates.lat, park.coordinates.lon], {
        radius: radius || 3,
        color: COLOR.park,
        fillColor: COLOR.park,
        fillOpacity: 0.55,
        weight: 0.8,
      })
        .bindPopup(
          `<strong>${park.name}</strong><br>${park.category}<br>${park.acres.toLocaleString()} acres`,
          { maxWidth: 220 }
        )
        .addTo(layers.parks);
    });

  const businessEntries = businessNeighborhoods
    .map((entry) => {
      const centroid = centroidLookup.get(entry.neighborhood);
      return centroid
        ? {
            ...entry,
            centroid,
          }
        : null;
    })
    .filter(Boolean)
    .slice(0, 60);

  const maxBusiness = d3.max(businessEntries, (d) => d.business_count) || 1;

  businessEntries.forEach((entry) => {
    const radius = Math.max(6, (entry.business_count / maxBusiness) * 24);
    const marker = L.circleMarker([entry.centroid.lat, entry.centroid.lon], {
      radius,
      color: COLOR.business,
      fillColor: COLOR.business,
      fillOpacity: 0.5,
      weight: 1,
      dashArray: "2,4",
    })
      .bindPopup(
        `<strong>${entry.neighborhood}</strong><br>${entry.business_count.toLocaleString()} active businesses`,
        { maxWidth: 240 }
      )
      .addTo(layers.businesses);

    marker._baseStyle = {
      radius: marker.options.radius,
      fillOpacity: marker.options.fillOpacity ?? 0.5,
      fillColor: marker.options.fillColor ?? COLOR.business,
      color: marker.options.color ?? COLOR.business,
      weight: marker.options.weight ?? 1,
    };
    marker.on("mouseover", () =>
      highlightNeighborhoods([entry.neighborhood], {
        type: "neighborhood",
        source: "resource-map",
        neighborhoods: [entry.neighborhood],
      })
    );
    marker.on("mouseout", clearNeighborhoodHighlight);
    addMarkerReference(sharedState.resourceBusinessMarkers, entry.neighborhood, marker);
  });

  facilities
    .filter((facility) => facility.coordinates?.lat && facility.coordinates?.lon)
    .forEach((facility) => {
      L.circleMarker([facility.coordinates.lat, facility.coordinates.lon], {
        radius: 4,
        color: COLOR.facility,
        fillColor: COLOR.facility,
        fillOpacity: 0.75,
        weight: 0.5,
      })
        .bindPopup(
          `<strong>${facility.name}</strong><br>${facility.address || "Address not provided"}<br>District ${
            facility.district || "N/A"
          }`,
          { maxWidth: 260 }
        )
        .addTo(layers.facilities);
    });

  (sharedState.schools || [])
    .filter((school) => school.coordinates?.lat && school.coordinates?.lon)
    .forEach((school) => {
      L.circleMarker([school.coordinates.lat, school.coordinates.lon], {
        radius: 4,
        color: "#e9c46a",
        fillColor: "#e9c46a",
        fillOpacity: 0.8,
        weight: 0.6,
      })
        .bindPopup(
          `<strong>${school.name}</strong><br>${school.address || "Address not provided"}<br>${school.ownership || "School"}`,
          { maxWidth: 260 }
        )
        .addTo(layers.schools);
    });

  Object.values(layers).forEach((layer) => layer.addTo(map));

  const bounds = [];
  layers.parks.eachLayer((layer) => bounds.push(layer.getLatLng()));
  layers.businesses.eachLayer((layer) => bounds.push(layer.getLatLng()));
  layers.facilities.eachLayer((layer) => bounds.push(layer.getLatLng()));
  layers.schools.eachLayer((layer) => bounds.push(layer.getLatLng()));
  if (bounds.length) {
    map.fitBounds(L.latLngBounds(bounds), { padding: [36, 36] });
  }

  map._customLayers = layers;
}

function initLayerToggles() {
  const resourceMapContainer = document.getElementById("resource-map");
  document.querySelectorAll('.controls-row input[type="checkbox"]').forEach((input) => {
    input.addEventListener("change", () => {
      const map = resourceMapContainer?._leaflet_map;
      if (!map || !map._customLayers) return;
      const layer = map._customLayers[input.dataset.layer];
      if (!layer) return;
      if (input.checked) {
        layer.addTo(map);
      } else {
        map.removeLayer(layer);
      }
    });
  });
}

function renderBusinessZipChart(data) {
  const container = d3.select("#business-zip-chart");
  container.selectAll("*").remove();

  const entries = data.entries.slice(0, 18); // focus on biggest contrasts
  const width = container.node().getBoundingClientRect().width || 560;
  const height = 480;
  const margin = { top: 24, right: 24, bottom: 48, left: 120 };

  const svg = container.attr("width", width).attr("height", height);
  const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const xScale = d3.scaleLinear().range([0, chartWidth]);
  const yScale = d3.scaleBand().range([0, chartHeight]).padding(0.2);

  let currentSort = "share";
  const citywideShareAvg = d3.mean(data.entries, (d) => d.share_of_city) || 0;
  const citywideShareMedian = d3.median(data.entries, (d) => d.share_of_city) || 0;
  const citywideCountMedian = d3.median(data.entries, (d) => d.business_count) || 0;
  sharedState.citywideBusinessStats = {
    shareAvg: citywideShareAvg,
    shareMedian: citywideShareMedian,
    countMedian: citywideCountMedian,
    totalZips: data.entries.length,
  };
  sharedState.shareRanking = data.entries
    .slice()
    .sort((a, b) => d3.descending(a.share_of_city, b.share_of_city))
    .map((d) => d.zip);

  function update(sortKey = "share") {
    currentSort = sortKey;
    const sorted = [...entries].sort((a, b) =>
      sortKey === "share" ? d3.descending(a.share_of_city, b.share_of_city) : d3.descending(a.business_count, b.business_count)
    );

    yScale.domain(sorted.map((d) => d.zip));
    if (sortKey === "share") {
      const maxShare = d3.max(sorted, (d) => d.share_of_city) || 0.01;
      xScale.domain([0, maxShare * 1.1]);
    } else {
      const maxCount = d3.max(sorted, (d) => d.business_count) || 1;
      xScale.domain([0, maxCount * 1.1]);
    }

    chart.selectAll(".axis").remove();
    chart.selectAll(".reference-line").remove();
    chart.selectAll(".reference-label").remove();

    chart
      .append("g")
      .attr("class", "axis axis--y")
      .call(d3.axisLeft(yScale).tickSize(0))
      .selectAll("text")
      .attr("fill", COLOR.text)
      .style("font-size", "0.85rem");

    chart
      .append("g")
      .attr("class", "axis axis--x")
      .attr("transform", `translate(0,${chartHeight})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(6)
          .tickFormat((d) => (sortKey === "share" ? `${(d * 100).toFixed(0)}%` : d3.format(",")(Math.round(d))))
      )
      .selectAll("text")
      .attr("fill", COLOR.text)
      .style("font-size", "0.8rem");

    const stats = sharedState.citywideBusinessStats || {};
    if (sortKey === "share" && stats.shareAvg) {
      const x = xScale(stats.shareAvg);
      chart
        .append("line")
        .attr("class", "reference-line")
        .attr("x1", x)
        .attr("x2", x)
        .attr("y1", 0)
        .attr("y2", chartHeight)
        .attr("stroke", COLOR.text)
        .attr("stroke-opacity", 0.3)
        .attr("stroke-dasharray", "4,6");
      chart
        .append("text")
        .attr("class", "reference-label")
        .attr("x", x + 6)
        .attr("y", -8)
        .text(`City avg ${((stats.shareAvg || 0) * 100).toFixed(1)}%`)
        .attr("fill", COLOR.text)
        .style("font-size", "0.7rem");
    }
    if (sortKey === "count" && stats.countMedian) {
      const x = xScale(stats.countMedian);
      chart
        .append("line")
        .attr("class", "reference-line")
        .attr("x1", x)
        .attr("x2", x)
        .attr("y1", 0)
        .attr("y2", chartHeight)
        .attr("stroke", COLOR.text)
        .attr("stroke-opacity", 0.3)
        .attr("stroke-dasharray", "4,6");
      chart
        .append("text")
        .attr("class", "reference-label")
        .attr("x", x + 6)
        .attr("y", -8)
        .text(`Median ${d3.format(",")(Math.round(stats.countMedian))}`)
        .attr("fill", COLOR.text)
        .style("font-size", "0.7rem");
    }

    const bars = chart.selectAll(".bar").data(sorted, (d) => d.zip);

    const handleHover = (event, d) => {
      const neighborhoods = (d.top_neighborhoods || []).map((item) => item.neighborhood);
      const valueLine =
        currentSort === "share"
          ? `${(d.share_of_city * 100).toFixed(2)}% of city total`
          : `${d3.format(",")(d.business_count)} businesses`;
      const sectorLines =
        d.top_sectors && d.top_sectors.length
          ? d.top_sectors.map((sector) => `${sector.sector} (${sector.count.toLocaleString()})`).join("<br>")
          : "No sector detail available";
      const neighborhoodLines =
        d.top_neighborhoods && d.top_neighborhoods.length
          ? d.top_neighborhoods.map((item) => `${item.neighborhood} (${item.count.toLocaleString()})`).join("<br>")
          : "No neighborhood detail available";
      highlightNeighborhoods(neighborhoods, {
        type: "zip",
        source: "chart",
        zip: d.zip,
        neighborhoods,
      });
      showTooltip(
        event.pageX,
        event.pageY,
        `<strong>ZIP ${d.zip}</strong><br>${valueLine}<br><em>Top sectors</em><br>${sectorLines}<br><em>Prominent neighborhoods</em><br>${neighborhoodLines}`
      );
    };

    const handleLeave = () => {
      hideTooltip();
      clearNeighborhoodHighlight();
    };

    bars
      .join(
        (enter) => {
          const group = enter
            .append("g")
            .attr("class", "bar")
            .attr("data-zip", (d) => d.zip)
            .attr("transform", (d) => `translate(0,${yScale(d.zip)})`);

          group
            .append("rect")
            .attr("height", yScale.bandwidth())
            .attr("width", (d) => xScale(sortKey === "share" ? d.share_of_city : d.business_count))
            .attr("rx", 6)
            .attr("fill", COLOR.business)
            .on("mouseenter", handleHover)
            .on("mouseleave", handleLeave);

          group
            .append("text")
            .attr("class", "bar-value")
            .attr("x", (d) => xScale(sortKey === "share" ? d.share_of_city : d.business_count) + 8)
            .attr("y", yScale.bandwidth() / 2)
            .attr("alignment-baseline", "middle")
            .attr("fill", COLOR.text)
            .style("font-size", "0.75rem")
            .text((d) =>
              sortKey === "share" ? `${(d.share_of_city * 100).toFixed(1)}%` : d3.format(",")(d.business_count)
            );

          return group;
        },
        (update) => {
          update
            .attr("data-zip", (d) => d.zip)
            .transition()
            .duration(450)
            .attr("transform", (d) => `translate(0,${yScale(d.zip)})`)
            .select("rect")
            .attr("width", (d) => xScale(sortKey === "share" ? d.share_of_city : d.business_count))
            .on("mouseenter", handleHover)
            .on("mouseleave", handleLeave);

          update
            .select(".bar-value")
            .transition()
            .duration(450)
            .attr("x", (d) => xScale(sortKey === "share" ? d.share_of_city : d.business_count) + 8)
            .text((d) =>
              sortKey === "share" ? `${(d.share_of_city * 100).toFixed(1)}%` : d3.format(",")(d.business_count)
            );
        }
      );

    sharedState.businessBarNodes = new Map();
    chart.selectAll(".bar").each(function (d) {
      const rectNode = d3.select(this).select("rect").node();
      if (rectNode) {
        sharedState.businessBarNodes.set(d.zip, rectNode);
      }
    });
    updateBarStyles();
  }

  update("share");

  document.querySelectorAll('input[name="business-sort"]').forEach((input) => {
    input.addEventListener("change", () => update(input.value));
  });
}

function renderHousingBurdenChart(data) {
  const container = d3.select("#housing-burden-chart");
  container.selectAll("*").remove();

  const width = container.node().getBoundingClientRect().width || 520;
  const height = 360;
  const margin = { top: 24, right: 48, bottom: 48, left: 80 };
  const svg = container.attr("width", width).attr("height", height);
  const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const groups = ["owner", "renter", "total"];
  const displayNames = {
    owner: "Owner",
    renter: "Renter",
    total: "All households",
  };

  const dataset = groups.map((group) => ({
    group,
    moderate: (data.moderate_burden_share?.[group] || 0) * 100,
    severe: (data.severe_burden_share?.[group] || 0) * 100,
  }));

  const stack = d3
    .stack()
    .keys(["moderate", "severe"])
    .value((d, key) => d[key]);

  const stackedData = stack(dataset);

  const xScale = d3.scaleBand().domain(groups).range([0, chartWidth]).padding(0.3);
  const yScale = d3
    .scaleLinear()
    .domain([0, d3.max(dataset, (d) => d.moderate + d.severe) * 1.1])
    .nice()
    .range([chartHeight, 0]);

  const colorScale = d3
    .scaleOrdinal()
    .domain(["moderate", "severe"])
    .range([COLOR.parkMedium, COLOR.severe]);

  chart
    .append("g")
    .attr("transform", `translate(0,${chartHeight})`)
    .call(d3.axisBottom(xScale).tickFormat((d) => displayNames[d]))
    .selectAll("text")
    .attr("fill", COLOR.text)
    .style("font-size", "0.85rem");

  chart
    .append("g")
    .call(d3.axisLeft(yScale).ticks(6).tickFormat((d) => `${d.toFixed(0)}%`))
    .selectAll("text")
    .attr("fill", COLOR.text)
    .style("font-size", "0.8rem");

  const groupsSelection = chart
    .selectAll(".stack-group")
    .data(stackedData)
    .join("g")
    .attr("fill", (d) => colorScale(d.key));

  groupsSelection
    .selectAll("rect")
    .data((d) => d)
    .join("rect")
    .attr("x", (d) => xScale(d.data.group))
    .attr("y", (d) => yScale(d[1]))
    .attr("height", (d) => yScale(d[0]) - yScale(d[1]))
    .attr("width", xScale.bandwidth())
    .attr("rx", 6)
    .on("mouseenter", (event, d) => {
      const category = event.currentTarget.parentNode.__data__.key;
      const percentage = (d.data[category]).toFixed(1);
      showTooltip(
        event.pageX,
        event.pageY,
        `<strong>${displayNames[d.data.group]}</strong><br>${category === "moderate" ? "Moderate burden" : "Severe burden"}<br>${percentage}% of households`
      );
    })
    .on("mouseleave", hideTooltip);

  chart
    .selectAll(".label")
    .data(dataset)
    .join("text")
    .attr("class", "label")
    .attr("x", (d) => xScale(d.group) + xScale.bandwidth() / 2)
    .attr("y", (d) => yScale(d.moderate + d.severe) - 8)
    .attr("text-anchor", "middle")
    .attr("fill", COLOR.text)
    .style("font-size", "0.75rem")
    .text((d) => `${(d.moderate + d.severe).toFixed(1)}% total burden`);

  // Legend
  const legend = chart.append("g").attr("transform", `translate(${chartWidth - 120}, ${12})`);
  ["Moderate burden (>30-<=50%)", "Severe burden (>50%)"].forEach((label, idx) => {
    const key = idx === 0 ? "moderate" : "severe";
    const row = legend.append("g").attr("transform", `translate(0, ${idx * 22})`);
    row
      .append("rect")
      .attr("width", 14)
      .attr("height", 14)
      .attr("rx", 4)
      .attr("fill", colorScale(key));
    row
      .append("text")
      .attr("x", 20)
      .attr("y", 11)
      .attr("fill", COLOR.text)
      .attr("font-size", "0.75rem")
      .text(label);
  });
}

function renderRentTrendChart(entries) {
  const parsed = (entries || [])
    .map((d) => ({
      date: new Date(d.date),
      value: d.zori,
    }))
    .filter((d) => !Number.isNaN(d.date.getTime()) && typeof d.value === "number")
    .sort((a, b) => a.date - b.date);

  if (!parsed.length) {
    sharedState.rentEntries = [];
    const container = d3.select("#rent-trend-chart");
    const fallbackWidth = container.node()?.getBoundingClientRect().width || 720;
    container.attr("width", fallbackWidth).attr("height", 160);
    container.selectAll("*").remove();
    container
      .append("text")
      .attr("x", 12)
      .attr("y", 24)
      .attr("fill", COLOR.text)
      .style("font-size", "0.85rem")
      .text("Rent trend data unavailable.");
    updateRentModeLabel();
    return;
  }

  parsed.forEach((point, index) => {
    if (index >= 12) {
      const prev = parsed[index - 12];
      const monthDiff = (point.date.getFullYear() - prev.date.getFullYear()) * 12 + (point.date.getMonth() - prev.date.getMonth());
      if (monthDiff === 12 && prev.value) {
        point.yoy = ((point.value - prev.value) / prev.value) * 100;
      } else {
        point.yoy = null;
      }
    } else {
      point.yoy = null;
    }
  });

  sharedState.rentEntries = parsed;

  const minYear = parsed[0]?.date.getFullYear() ?? new Date().getFullYear();
  const maxYear = parsed[parsed.length - 1]?.date.getFullYear() ?? minYear;

  if (!sharedState.rentControls) {
    sharedState.rentControls = {
      startYear: minYear,
      mode: "level",
      initialized: false,
      elements: {},
    };
  }

  const controls = sharedState.rentControls;
  controls.startYear = Math.max(minYear, Math.min(controls.startYear || minYear, maxYear));
  controls.mode = controls.mode || "level";
  controls.minYear = minYear;
  controls.maxYear = maxYear;

  const startInput = document.getElementById("rent-start");
  const startLabel = document.getElementById("rent-start-label");
  const modeToggle = document.getElementById("rent-yoy");
  const resetBtn = document.getElementById("rent-reset");
  const modeLabel = document.getElementById("rent-mode-label");

  controls.elements = { startInput, startLabel, modeToggle, resetBtn, modeLabel };

  if (startInput) {
    startInput.min = minYear;
    startInput.max = maxYear;
    startInput.value = controls.startYear;
  }
  if (startLabel) {
    startLabel.textContent = String(controls.startYear);
  }
  if (modeToggle) {
    modeToggle.checked = controls.mode === "change";
  }
  updateRentModeLabel();

  if (!controls.initialized) {
    const handleStartChange = () => {
      if (!startInput) return;
      controls.startYear = Math.max(minYear, Math.min(parseInt(startInput.value, 10) || minYear, maxYear));
      if (startLabel) {
        startLabel.textContent = String(controls.startYear);
      }
      updateRentTrendVisualization();
    };

    const handleModeChange = () => {
      controls.mode = modeToggle && modeToggle.checked ? "change" : "level";
      updateRentModeLabel();
      updateRentTrendVisualization();
    };

    if (startInput) {
      startInput.addEventListener("input", handleStartChange);
      startInput.addEventListener("change", handleStartChange);
    }
    if (modeToggle) {
      modeToggle.addEventListener("change", handleModeChange);
    }
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        controls.startYear = minYear;
        controls.mode = "level";
        if (startInput) startInput.value = String(minYear);
        if (startLabel) startLabel.textContent = String(minYear);
        if (modeToggle) modeToggle.checked = false;
        updateRentModeLabel();
        updateRentTrendVisualization();
      });
    }
    controls.initialized = true;
  }

  updateRentTrendVisualization();
}

function updateRentTrendVisualization() {
  const entries = sharedState.rentEntries;
  const controls = sharedState.rentControls;
  const containerNode = document.getElementById("rent-trend-chart");
  if (!entries?.length || !containerNode) {
    return;
  }

  const startYear = controls?.startYear ?? entries[0].date.getFullYear();
  const mode = controls?.mode ?? "level";
  updateRentModeLabel();
  const filtered = entries.filter((d) => d.date.getFullYear() >= startYear);

  const prepared = filtered
    .filter((d) => (mode === "change" ? typeof d.yoy === "number" && Number.isFinite(d.yoy) : true))
    .map((d) => ({
      date: d.date,
      value: mode === "change" ? d.yoy : d.value,
      original: d,
    }));

  const container = d3.select(containerNode);
  container.selectAll("*").remove();

  if (!prepared.length) {
    const fallbackWidth = containerNode.getBoundingClientRect().width || 720;
    container.attr("width", fallbackWidth).attr("height", 160);
    container
      .append("text")
      .attr("x", 12)
      .attr("y", 24)
      .attr("fill", COLOR.text)
      .style("font-size", "0.85rem")
      .text("Not enough data for this view. Try resetting the filters.");
    return;
  }

  const width = containerNode.getBoundingClientRect().width || 720;
  const height = 380;
  const margin = { top: 24, right: 24, bottom: 56, left: 64 };
  const svg = container.attr("width", width).attr("height", height);
  const chart = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const xScale = d3.scaleTime().domain(d3.extent(prepared, (d) => d.date)).range([0, chartWidth]);

  let yDomain;
  if (mode === "change") {
    const maxAbs = Math.max(d3.max(prepared, (d) => Math.abs(d.value)) || 0, 0.5);
    yDomain = [-maxAbs * 1.2, maxAbs * 1.2];
  } else {
    const minVal = d3.min(prepared, (d) => d.value) || 0;
    const maxVal = d3.max(prepared, (d) => d.value) || minVal;
    yDomain = [minVal * 0.95, maxVal * 1.05];
  }

  const yScale = d3.scaleLinear().domain(yDomain).nice().range([chartHeight, 0]);

  if (mode === "level") {
    chart
      .append("path")
      .datum(prepared)
      .attr("fill", "rgba(42, 157, 143, 0.12)")
      .attr("stroke", "none")
      .attr(
        "d",
        d3
          .area()
          .x((d) => xScale(d.date))
          .y0(chartHeight)
          .y1((d) => yScale(d.value))
          .curve(d3.curveMonotoneX)
      );
  } else {
    chart
      .append("line")
      .attr("x1", 0)
      .attr("x2", chartWidth)
      .attr("y1", yScale(0))
      .attr("y2", yScale(0))
      .attr("stroke", "rgba(148, 163, 184, 0.35)")
      .attr("stroke-dasharray", "4,4");
  }

  chart
    .append("path")
    .datum(prepared)
    .attr("fill", "none")
    .attr("stroke", mode === "change" ? COLOR.severe : COLOR.business)
    .attr("stroke-width", 2.5)
    .attr(
      "d",
      d3
        .line()
        .x((d) => xScale(d.date))
        .y((d) => yScale(d.value))
        .curve(d3.curveMonotoneX)
    );

  chart
    .append("g")
    .attr("transform", `translate(0, ${chartHeight})`)
    .call(d3.axisBottom(xScale).ticks(8))
    .selectAll("text")
    .attr("fill", COLOR.text)
    .style("font-size", "0.8rem");

  chart
    .append("g")
    .call(
      d3
        .axisLeft(yScale)
        .ticks(6)
        .tickFormat((d) =>
          mode === "change" ? `${d >= 0 ? "+" : ""}${d.toFixed(1)}%` : `$${d3.format(",.0f")(d)}`
        )
    )
    .selectAll("text")
    .attr("fill", COLOR.text)
    .style("font-size", "0.8rem");

  if (mode === "level") {
    const milestones = [
      { date: new Date("2018-06-30"), label: "Tech plateau", alignment: "top" },
      { date: new Date("2020-05-31"), label: "Pandemic dip", alignment: "bottom" },
      { date: new Date("2023-07-31"), label: "Service rebound", alignment: "top" },
    ];

    milestones.forEach((milestone) => {
      const point = prepared.find((d) => Math.abs(d.date - milestone.date) < 40 * 86400000);
      if (!point) return;

      chart
        .append("line")
        .attr("x1", xScale(point.date))
        .attr("x2", xScale(point.date))
        .attr("y1", yScale(point.value))
        .attr("y2", chartHeight)
        .attr("stroke", "rgba(231, 111, 81, 0.5)")
        .attr("stroke-dasharray", "4,5");

      chart
        .append("circle")
        .attr("cx", xScale(point.date))
        .attr("cy", yScale(point.value))
        .attr("r", 4)
        .attr("fill", COLOR.severe);

      chart
        .append("text")
        .attr("x", xScale(point.date) + 6)
        .attr("y", milestone.alignment === "top" ? yScale(point.value) - 12 : yScale(point.value) + 20)
        .attr("fill", COLOR.text)
        .attr("font-size", "0.75rem")
        .text(`${milestone.label} (${d3.timeFormat("%b %Y")(point.date)})`);
    });
  }

  const focusCircle = chart
    .append("circle")
    .attr("r", 4)
    .attr("fill", mode === "change" ? COLOR.severe : COLOR.business)
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 1.2)
    .style("opacity", 0);

  const bisect = d3.bisector((d) => d.date).center;

  const overlay = svg.append("rect").attr("fill", "transparent").attr("width", width).attr("height", height);
  overlay.on("mousemove", (event) => {
    const [pointerX] = d3.pointer(event);
    const date = xScale.invert(pointerX - margin.left);
    let idx = bisect(prepared, date);
    idx = Math.max(0, Math.min(prepared.length - 1, idx));
    const point = prepared[idx];
    focusCircle
      .attr("cx", xScale(point.date))
      .attr("cy", yScale(point.value))
      .style("opacity", 1);

    const valueLabel =
      mode === "change"
        ? `${point.value >= 0 ? "+" : ""}${point.value.toFixed(2)}% YoY`
        : `$${d3.format(",.0f")(point.value)}`;

    showTooltip(event.pageX, event.pageY, `${d3.timeFormat("%B %Y")(point.date)}<br><strong>${valueLabel}</strong>`);
  });
  overlay.on("mouseleave", () => {
    focusCircle.style("opacity", 0);
    hideTooltip();
  });
}

function updateRentModeLabel() {
  const labelEl = sharedState.rentControls?.elements?.modeLabel;
  if (!labelEl) return;
  labelEl.textContent =
    sharedState.rentControls?.mode === "change"
      ? "Viewing year-over-year change (%)"
      : "Viewing rent level ($)";
}

function addMarkerReference(store, name, marker) {
  if (!store.has(name)) {
    store.set(name, []);
  }
  store.get(name).push(marker);
}

function updateMarkerStyles() {
  const active = sharedState.activeNeighborhoods;
  const hasActive = active && active.size > 0;
  const apply = (collection) => {
    collection.forEach((markers, name) => {
      markers.forEach((marker) => {
        if (!marker._baseStyle) {
          marker._baseStyle = {
            radius: marker.options.radius,
            fillOpacity: marker.options.fillOpacity ?? 0.7,
            fillColor: marker.options.fillColor ?? COLOR.business,
            color: marker.options.color ?? COLOR.business,
            weight: marker.options.weight ?? 1,
          };
        }
        if (!hasActive) {
          marker.setStyle({
            radius: marker._baseStyle.radius,
            fillOpacity: marker._baseStyle.fillOpacity,
            fillColor: marker._baseStyle.fillColor,
            color: marker._baseStyle.color,
            weight: marker._baseStyle.weight,
          });
        } else if (active.has(name)) {
          marker.setStyle({
            radius: marker._baseStyle.radius * 1.25,
            fillOpacity: Math.min(1, marker._baseStyle.fillOpacity + 0.25),
            fillColor: marker._baseStyle.fillColor,
            color: "#ffffff",
            weight: 2,
          });
        } else {
          marker.setStyle({
            radius: marker._baseStyle.radius * 0.85,
            fillOpacity: marker._baseStyle.fillOpacity * 0.2,
            fillColor: marker._baseStyle.fillColor,
            color: marker._baseStyle.color,
            weight: marker._baseStyle.weight,
          });
        }
      });
    });
  };

  apply(sharedState.businessMarkers);
  apply(sharedState.resourceBusinessMarkers);
}

function updateBarStyles() {
  const active = sharedState.activeNeighborhoods;
  const hasActive = active && active.size > 0;
  if (!hasActive) {
    sharedState.businessBarNodes.forEach((node) => {
      if (!node) return;
      const selection = d3.select(node);
      selection.classed("is-active", false).classed("is-dim", false);
    });
    return;
  }

  let matchedCount = 0;
  const results = new Map();
  sharedState.businessBarNodes.forEach((node, zip) => {
    const entry = sharedState.businessZipLookup.get(zip);
    if (!entry || !node) return;
    const neighborhoods = (entry.top_neighborhoods || []).map((item) => item.neighborhood);
    const matches = neighborhoods.some((name) => active.has(name));
    if (matches) matchedCount += 1;
    results.set(zip, { node, matches });
  });

  results.forEach(({ node, matches }) => {
    const selection = d3.select(node);
    if (matchedCount === 0) {
      selection.classed("is-active", false).classed("is-dim", false);
    } else {
      selection.classed("is-active", matches).classed("is-dim", !matches);
    }
  });
}

function initNarrationControl() {
  if (!tourAudioToggle || !tourAudioHint) {
    return;
  }
  if (!sharedState.narrationSupported) {
    tourAudioToggle.disabled = true;
    tourAudioToggle.setAttribute("aria-pressed", "false");
    tourAudioToggle.textContent = "Audio narration unavailable";
    tourAudioHint.textContent = "Your browser does not support speech synthesis.";
    return;
  }

  tourAudioToggle.addEventListener("click", () => {
    const nextState = !sharedState.narrationAudioEnabled;
    setNarrationAudioEnabled(nextState);
  });
  tourAudioToggle.disabled = false;
  tourAudioHint.textContent = "Headphones recommended; uses your device voice.";
  if (tourVoiceSelect) {
    tourVoiceSelect.disabled = true;
    tourVoiceSelect.innerHTML = `<option>Loading voices…</option>`;
  }
  loadVoiceOptions();
  if (tourVoiceSelect) {
    tourVoiceSelect.addEventListener("change", (event) => {
      sharedState.selectedVoiceURI = event.target.value;
      if (sharedState.narrationAudioEnabled && sharedState.currentTourNarration && sharedState.tourActive && !sharedState.tourPaused) {
        speakNarrationText(sharedState.currentTourNarration);
      }
    });
  }
}

function setNarrationAudioEnabled(enabled) {
  if (!sharedState.narrationSupported) {
    return;
  }
  sharedState.narrationAudioEnabled = enabled;
  if (tourAudioToggle) {
    tourAudioToggle.setAttribute("aria-pressed", enabled ? "true" : "false");
    tourAudioToggle.textContent = enabled ? "Disable narration audio" : "Enable narration audio";
  }
  if (tourAudioHint) {
    tourAudioHint.textContent = enabled
      ? "Narration audio on – start the tour to hear it."
      : "Narration audio muted.";
  }
  if (enabled) {
    if (sharedState.tourActive && !sharedState.tourPaused && sharedState.currentTourNarration) {
      speakNarrationText(sharedState.currentTourNarration);
    }
  } else {
    const wasAwaiting = sharedState.awaitingNarrationEnd;
    cancelNarrationSpeech();
    if (wasAwaiting && sharedState.tourActive && !sharedState.tourPaused) {
      sharedState.awaitingNarrationEnd = false;
      scheduleTourAdvance(sharedState.tourPendingStepDuration || NARRATION_GAP_MS);
    }
  }
}

function speakNarrationText(text) {
  if (!sharedState.narrationSupported || !sharedState.narrationAudioEnabled || !text) {
    return;
  }
  cancelNarrationSpeech();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.lang = "en-US";
  const voice = sharedState.availableVoices.find((item) => item.voiceURI === sharedState.selectedVoiceURI);
  if (voice) {
    utterance.voice = voice;
  }
  sharedState.awaitingNarrationEnd = true;
  utterance.onend = () => {
    if (sharedState.currentUtterance === utterance) {
      sharedState.currentUtterance = null;
      handleNarrationComplete();
    }
  };
  utterance.onerror = () => {
    if (sharedState.currentUtterance === utterance) {
      sharedState.currentUtterance = null;
      handleNarrationComplete();
    }
  };
  sharedState.currentUtterance = utterance;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function cancelNarrationSpeech() {
  if (!sharedState.narrationSupported) {
    return;
  }
  if (sharedState.currentUtterance) {
    window.speechSynthesis.cancel();
    sharedState.currentUtterance = null;
  }
  sharedState.awaitingNarrationEnd = false;
  window.speechSynthesis.cancel();
}

function handleNarrationComplete() {
  const wasAwaiting = sharedState.awaitingNarrationEnd;
  sharedState.awaitingNarrationEnd = false;
  if (wasAwaiting && sharedState.tourActive && !sharedState.tourPaused) {
    scheduleTourAdvance(sharedState.tourPendingStepDuration || NARRATION_GAP_MS);
  }
}

function loadVoiceOptions() {
  if (!sharedState.narrationSupported || !window.speechSynthesis) {
    return;
  }
  const assignVoices = () => {
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) {
      return;
    }
    sharedState.availableVoices = voices;
    sharedState.selectedVoiceURI =
      sharedState.selectedVoiceURI || (pickPreferredVoice(voices)?.voiceURI || voices[0].voiceURI);
    renderVoiceOptions();
  };

  const voices = window.speechSynthesis.getVoices();
  if (voices.length) {
    assignVoices();
  } else {
    if (typeof window.speechSynthesis.addEventListener === "function") {
      window.speechSynthesis.addEventListener("voiceschanged", assignVoices, { once: true });
    } else {
      window.speechSynthesis.onvoiceschanged = assignVoices;
    }
    window.speechSynthesis.getVoices();
  }
}

function pickPreferredVoice(voices) {
  const priority = ["Neural", "Natural", "Jenny", "Guy", "Emma", "Salli", "Aria", "Google", "Microsoft"];
  for (const keyword of priority) {
    const found = voices.find((voice) => voice.name.includes(keyword) || voice.voiceURI.includes(keyword));
    if (found) return found;
  }
  return voices[0];
}

function renderVoiceOptions() {
  if (!tourVoiceSelect) {
    return;
  }
  const voices = sharedState.availableVoices;
  if (!voices.length) {
    tourVoiceSelect.disabled = true;
    tourVoiceSelect.innerHTML = `<option>No voices available</option>`;
    return;
  }
  if (!voices.some((voice) => voice.voiceURI === sharedState.selectedVoiceURI)) {
    sharedState.selectedVoiceURI = voices[0].voiceURI;
  }
  tourVoiceSelect.innerHTML = voices
    .map((voice) => `<option value="${voice.voiceURI}">${voice.name}${voice.lang ? ` (${voice.lang})` : ""}</option>`)
    .join("");
  tourVoiceSelect.value = sharedState.selectedVoiceURI;
  tourVoiceSelect.disabled = false;
  if (sharedState.narrationAudioEnabled && sharedState.currentTourNarration && sharedState.tourActive && !sharedState.tourPaused) {
    speakNarrationText(sharedState.currentTourNarration);
  }
}

function initTourControls() {
  if (!tourPlayBtn || !tourStopBtn || !tourPauseBtn) {
    return;
  }
  tourPlayBtn.addEventListener("click", startGuidedTour);
  tourPauseBtn.addEventListener("click", () => {
    if (!sharedState.tourActive) return;
    if (sharedState.tourPaused) {
      resumeGuidedTour();
    } else {
      pauseGuidedTour();
    }
  });
  tourStopBtn.addEventListener("click", () => stopGuidedTour());
  initNarrationControl();
  setTourButtonState(false);
  updateTourStatus(tourStatusEl?.textContent || TOUR_STATUS_DEFAULT);
  updateTourNarration(tourNarrationEl?.textContent || TOUR_NARRATION_DEFAULT);
}

function startGuidedTour() {
  if (!sharedState.dataReady || sharedState.tourActive || !TOUR_STEPS.length) {
    return;
  }
  stopGuidedTour({ silent: true, skipHighlightReset: true });
  sharedState.tourActive = true;
  sharedState.tourStepIndex = -1;
  sharedState.tourTimeoutId = null;
  sharedState.tourPaused = false;
  sharedState.tourPendingStepDuration = 0;
  sharedState.tourRemainingDuration = 0;
  sharedState.tourStepTimestamp = 0;
  sharedState.currentTourNarration = "";
  sharedState.pausedDuringNarration = false;
  cancelNarrationSpeech();
  setTourButtonState(true);
  updateTourStatus("Playing citywide highlights…");
  updateTourNarration("Scene 1 is loading…");
  runNextTourStep();
}

function runNextTourStep() {
  if (!sharedState.tourActive || sharedState.tourPaused) {
    return;
  }
  const nextIndex = sharedState.tourStepIndex + 1;
  if (nextIndex >= TOUR_STEPS.length) {
    finishGuidedTour();
    return;
  }

  sharedState.tourStepIndex = nextIndex;
  const step = TOUR_STEPS[nextIndex];
  if (step.scrollTo) {
    const target = document.querySelector(step.scrollTo);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const neighborhoods = Array.isArray(step.neighborhoods) ? step.neighborhoods : [];
  highlightNeighborhoods(neighborhoods, {
    type: "tour",
    message: step.message,
    source: "guided-tour",
    stepId: step.id,
  });

  const narrationText = step.narration || step.message || step.status;
  sharedState.currentTourNarration = narrationText;
  updateTourStatus(`Step ${nextIndex + 1}/${TOUR_STEPS.length}: ${step.status}`);
  updateTourNarration(narrationText);
  const audioActive = sharedState.narrationSupported && sharedState.narrationAudioEnabled;
  if (audioActive) {
    sharedState.tourPendingStepDuration = NARRATION_GAP_MS;
    sharedState.tourRemainingDuration = NARRATION_GAP_MS;
    sharedState.tourStepTimestamp = performance.now();
    speakNarrationText(narrationText);
  } else {
    const duration = Math.max(500, step.duration || 6000);
    sharedState.tourPendingStepDuration = duration;
    sharedState.tourRemainingDuration = duration;
    sharedState.tourStepTimestamp = performance.now();
    scheduleTourAdvance(duration);
  }
}

function scheduleTourAdvance(delay) {
  if (!sharedState.tourActive) {
    return;
  }
  const safeDelay = Math.max(500, delay || 0);
  if (sharedState.tourTimeoutId) {
    clearTimeout(sharedState.tourTimeoutId);
    sharedState.tourTimeoutId = null;
  }
  sharedState.tourTimeoutId = window.setTimeout(() => {
    sharedState.tourTimeoutId = null;
    if (!sharedState.tourPaused) {
      runNextTourStep();
    }
  }, safeDelay);
}

function finishGuidedTour() {
  if (sharedState.tourTimeoutId) {
    clearTimeout(sharedState.tourTimeoutId);
    sharedState.tourTimeoutId = null;
  }
  sharedState.tourActive = false;
  sharedState.tourStepIndex = -1;
  sharedState.tourPaused = false;
  sharedState.tourPendingStepDuration = 0;
  sharedState.tourRemainingDuration = 0;
  sharedState.tourStepTimestamp = 0;
  sharedState.awaitingNarrationEnd = false;
  sharedState.pausedDuringNarration = false;
  cancelNarrationSpeech();
  setTourButtonState(false);
  const completionText = "Tour complete. Try the Open Exploration controls to continue.";
  updateTourStatus("Tour complete. Scroll to Open Exploration to dig deeper.");
  sharedState.currentTourNarration = completionText;
  updateTourNarration(completionText);
}

function stopGuidedTour(options = {}) {
  const { silent = false, skipHighlightReset = false, reason } = options;
  if (sharedState.tourTimeoutId) {
    clearTimeout(sharedState.tourTimeoutId);
    sharedState.tourTimeoutId = null;
  }
  const wasActive = sharedState.tourActive;
  sharedState.tourActive = false;
  sharedState.tourStepIndex = -1;
  sharedState.tourPaused = false;
  sharedState.tourPendingStepDuration = 0;
  sharedState.tourRemainingDuration = 0;
  sharedState.tourStepTimestamp = 0;
  sharedState.awaitingNarrationEnd = false;
  sharedState.pausedDuringNarration = false;
  cancelNarrationSpeech();
  sharedState.currentTourNarration = "";
  setTourButtonState(false);
  if (wasActive && !skipHighlightReset) {
    clearNeighborhoodHighlight();
  }
  if (wasActive && !silent) {
    const statusMessage =
      reason === "interrupt"
        ? "Tour paused so you can explore manually."
        : "Tour stopped. Press play to watch again.";
    updateTourStatus(statusMessage);
    sharedState.currentTourNarration = "";
    updateTourNarration(TOUR_NARRATION_DEFAULT);
  } else if (!silent) {
    updateTourStatus(TOUR_STATUS_DEFAULT);
    sharedState.currentTourNarration = "";
    updateTourNarration(TOUR_NARRATION_DEFAULT);
  }
}

function pauseGuidedTour() {
  if (!sharedState.tourActive || sharedState.tourPaused) {
    return;
  }
  sharedState.pausedDuringNarration = sharedState.awaitingNarrationEnd || !!sharedState.currentUtterance;
  if (sharedState.tourTimeoutId) {
    clearTimeout(sharedState.tourTimeoutId);
    sharedState.tourTimeoutId = null;
  }
  const now = performance.now();
  const elapsed = Math.max(0, now - (sharedState.tourStepTimestamp || now));
  const duration = sharedState.tourPendingStepDuration || 0;
  const remaining = Math.max(500, duration - elapsed);
  sharedState.tourRemainingDuration = remaining;
  sharedState.tourPaused = true;
  cancelNarrationSpeech();
  setTourButtonState(true);
  const currentStep = TOUR_STEPS[sharedState.tourStepIndex];
  const pauseNarration =
    currentStep?.narration || currentStep?.message || "Paused—resume the tour when you're ready.";
  updateTourStatus("Tour paused. Press resume to keep watching.");
  updateTourNarration(pauseNarration);
}

function resumeGuidedTour() {
  if (!sharedState.tourActive || !sharedState.tourPaused) {
    return;
  }
  sharedState.tourPaused = false;
  setTourButtonState(true);
  updateTourStatus("Resuming tour…");
  if (sharedState.currentTourNarration) {
    updateTourNarration(sharedState.currentTourNarration);
  }
  const audioActive = sharedState.narrationSupported && sharedState.narrationAudioEnabled;
  if (sharedState.pausedDuringNarration && audioActive) {
    sharedState.pausedDuringNarration = false;
    sharedState.tourPendingStepDuration = NARRATION_GAP_MS;
    sharedState.tourRemainingDuration = NARRATION_GAP_MS;
    sharedState.tourStepTimestamp = performance.now();
    speakNarrationText(sharedState.currentTourNarration);
    return;
  }
  sharedState.pausedDuringNarration = false;
  const delay = Math.max(500, sharedState.tourRemainingDuration || sharedState.tourPendingStepDuration || 4000);
  sharedState.tourPendingStepDuration = delay;
  sharedState.tourRemainingDuration = delay;
  sharedState.tourStepTimestamp = performance.now();
  scheduleTourAdvance(delay);
  if (audioActive && sharedState.currentTourNarration && !sharedState.awaitingNarrationEnd) {
    speakNarrationText(sharedState.currentTourNarration);
  }
}

function setTourButtonState(isRunning) {
  if (tourPlayBtn) {
    tourPlayBtn.disabled = isRunning || !sharedState.dataReady;
  }
  if (tourPauseBtn) {
    tourPauseBtn.disabled = !isRunning;
    tourPauseBtn.textContent = sharedState.tourPaused ? "Resume" : "Pause";
  }
  if (tourStopBtn) {
    tourStopBtn.disabled = !isRunning;
  }
}

function updateTourStatus(message) {
  if (!tourStatusEl || !message) {
    return;
  }
  if (tourStatusEl.textContent !== message) {
    tourStatusEl.textContent = message;
  }
}

function updateTourNarration(message) {
  if (!tourNarrationEl || !message) {
    return;
  }
  if (tourNarrationEl.textContent !== message) {
    tourNarrationEl.textContent = message;
  }
}

function highlightNeighborhoods(neighborhoods, context = {}) {
  if (sharedState.tourActive && context.source !== "guided-tour") {
    stopGuidedTour({ reason: "interrupt", skipHighlightReset: true });
  }
  const names = Array.isArray(neighborhoods) ? neighborhoods.filter(Boolean) : [];
  sharedState.activeNeighborhoods = new Set(names);
  sharedState.highlightContext = { ...context, neighborhoods: names };
  updateMarkerStyles();
  updateBarStyles();
  updateHighlightMessage();
}

function clearNeighborhoodHighlight() {
  sharedState.activeNeighborhoods = new Set();
  sharedState.highlightContext = null;
  updateMarkerStyles();
  updateBarStyles();
  updateHighlightMessage();
}

function initializeZipSearch() {
  const form = document.getElementById("zip-search");
  const input = document.getElementById("zip-input");
  const resetBtn = document.getElementById("zip-reset");
  const datalist = document.getElementById("zip-options");

  if (!form || !input) {
    return;
  }

  if (datalist && !datalist.dataset.filled) {
    sharedState.zipList.forEach((zip) => {
      const option = document.createElement("option");
      option.value = zip;
      datalist.appendChild(option);
    });
    datalist.dataset.filled = "true";
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const normalizedZip = normalizeZipInput(input.value);
    if (!normalizedZip) {
      renderZipSummary(null, { error: "Please enter a five-digit San Francisco ZIP code." });
      return;
    }
    const entry = sharedState.businessZipLookup.get(normalizedZip);
    if (!entry) {
      renderZipSummary(null, {
        error: `ZIP ${normalizedZip} is not in the dataset. Try one of these: ${sharedState.zipList
          .slice(0, 5)
          .join(", ")}.`,
      });
      input.focus();
      return;
    }
    focusOnZip(entry);
  });

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      input.value = "";
      resetZipSelection();
      input.focus();
    });
  }

  const addressInput = document.getElementById("address-input");
  const addressButton = document.getElementById("address-search");
  const addressList = document.getElementById("address-options");

  if (addressInput && addressList && !addressList.dataset.filled) {
    sharedState.addressPoints.slice(0, 500).forEach((point) => {
      const option = document.createElement("option");
      option.value = point.address || point.label;
      option.label = point.label || point.address || "Address";
      addressList.appendChild(option);
    });
    addressList.dataset.filled = "true";
  }

  const handleAddressSearch = () => {
    if (!addressInput) return;
    const query = addressInput.value.trim();
    if (!query) {
      renderZipSummary(sharedState.activeZip ? sharedState.businessZipLookup.get(sharedState.activeZip) : null, {
        error: "Enter an address or landmark to locate.",
      });
      return;
    }

    const zipMatch = query.match(/\b\d{5}\b/);
    if (zipMatch && sharedState.businessZipLookup.has(zipMatch[0])) {
      focusOnZip(sharedState.businessZipLookup.get(zipMatch[0]));
      return;
    }

    const point = findAddressPoint(query);
    if (!point) {
      renderZipSummary(sharedState.activeZip ? sharedState.businessZipLookup.get(sharedState.activeZip) : null, {
        error: "Address not found in city datasets. Try including a street number or ZIP.",
      });
      return;
    }
    focusOnAddressPoint(point);
  };

  if (addressButton) {
    addressButton.addEventListener("click", (event) => {
      event.preventDefault();
      handleAddressSearch();
    });
  }

  if (addressInput) {
    addressInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleAddressSearch();
      }
    });
  }
}

function normalizeZipInput(value) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 5) return null;
  return digits;
}

function findAddressPoint(query) {
  if (!query) return null;
  const normalized = query.toLowerCase();
  const points = sharedState.addressPoints || [];
  if (!points.length) return null;

  let bestPoint = null;
  let bestScore = -Infinity;
  points.forEach((point) => {
    const label = (point.label || "").toLowerCase();
    const address = (point.address || "").toLowerCase();
    let score = 0;
    if (label === normalized || address === normalized) {
      score = 200;
    } else if (label.startsWith(normalized) || address.startsWith(normalized)) {
      score = 140;
    } else if (label.includes(normalized) || address.includes(normalized)) {
      score = 100;
    }
    if (point.zip && normalized.includes(point.zip)) {
      score += 25;
    }
    if (score > bestScore) {
      bestScore = score;
      bestPoint = point;
    }
  });

  return bestScore > 0 ? bestPoint : null;
}

function focusOnAddressPoint(point) {
  if (!point?.coordinates?.lat || !point?.coordinates?.lon) {
    renderZipSummary(null, { error: "Unable to locate that address." });
    return;
  }

  const coords = point.coordinates;
  const zipEntry = point.zip ? sharedState.businessZipLookup.get(point.zip) : null;
  const neighborhoods = zipEntry ? (zipEntry.top_neighborhoods || []).map((item) => item.neighborhood) : [];

  const nearestPark = findNearest(sharedState.parks, coords, 1)[0] || null;
  const nearestFacility = findNearest(sharedState.facilities, coords, 1)[0] || null;
  const nearestSchool = findNearest(sharedState.schools, coords, 1)[0] || null;
  const addressContext = {
    addressPoint: point,
    nearestPark,
    nearestFacility,
    nearestSchool,
  };

  if (zipEntry) {
    focusOnZip(zipEntry, {
      addressContext,
      suppressHighlight: true,
      skipMapPan: true,
      source: "address-search",
      clearAddressMarker: false,
    });
    highlightNeighborhoods(neighborhoods, {
      type: "address",
      source: "address-search",
      zip: zipEntry.zip,
      neighborhoods,
      addressLabel: point.label || point.address,
    });
  } else {
    clearAddressMarker();
    renderZipSummary(null, { addressContext });
    highlightNeighborhoods([], {
      type: "address",
      source: "address-search",
      neighborhoods: [],
      addressLabel: point.label || point.address,
    });
  }

  clearAddressMarker();
  updateAddressMarker(coords, point.label || point.address);

  const resourceMap = sharedState.maps.resource;
  if (resourceMap) {
    resourceMap.setView([coords.lat, coords.lon], 15, { animate: true, duration: 0.5 });
  }
  ["parks", "business"].forEach((mapKey) => {
    const map = sharedState.maps[mapKey];
    if (map) {
      map.setView([coords.lat, coords.lon], 14, { animate: true, duration: 0.5 });
    }
  });
}

function focusOnZip(entry, options = {}) {
  const { addressContext, suppressHighlight, skipMapPan, source = "zip-search", clearAddressMarker: shouldClearAddress = true } = options;
  if (shouldClearAddress) {
    clearAddressMarker();
  }
  sharedState.activeZip = entry.zip;
  const neighborhoods = (entry.top_neighborhoods || []).map((item) => item.neighborhood);
  const context = {
    type: "zip",
    source,
    zip: entry.zip,
    neighborhoods,
  };
  if (suppressHighlight) {
    sharedState.activeNeighborhoods = new Set(neighborhoods);
    sharedState.highlightContext = context;
    updateMarkerStyles();
    updateBarStyles();
    updateHighlightMessage();
  } else {
    highlightNeighborhoods(neighborhoods, context);
  }
  renderZipSummary(entry, { addressContext });

  const centroid = getZipCentroid(entry, neighborhoods);
  if (centroid) {
    ["parks", "business", "resource"].forEach((mapKey) => {
      const map = sharedState.maps[mapKey];
      if (map && !skipMapPan) {
        map.setView([centroid.lat, centroid.lon], 13, { animate: true, duration: 0.5 });
      }
      updateZipFocusMarker(mapKey, centroid);
    });
  }
}

function resetZipSelection() {
  sharedState.activeZip = null;
  clearNeighborhoodHighlight();
  clearZipFocusMarkers();
  clearAddressMarker();
  renderZipSummary(null);
  const defaultCenter = [37.76, -122.44];
  const defaultZoom = 12;
  Object.values(sharedState.maps).forEach((map) => {
    if (map) {
      map.setView(defaultCenter, defaultZoom, { animate: true, duration: 0.5 });
    }
  });
}

function renderZipSummary(entry, options = {}) {
  const summaryEl = document.getElementById("zip-summary");
  if (!summaryEl) return;

  if (options.error) {
    summaryEl.innerHTML = `<h3>ZIP not found</h3><p>${options.error}</p>`;
    return;
  }

  if (!entry) {
    const addressCtx = options.addressContext;
    if (addressCtx?.addressPoint) {
      const point = addressCtx.addressPoint;
      const lines = [`<li><strong>Address:</strong> ${point.label || point.address || "Selected address"}</li>`];
      if (addressCtx.nearestPark?.item) {
        lines.push(
          `<li><strong>Nearest park:</strong> ${addressCtx.nearestPark.item.name || "Unnamed park"} (${formatDistance(
            addressCtx.nearestPark.distanceKm
          )})</li>`
        );
      }
      if (addressCtx.nearestFacility?.item) {
        lines.push(
          `<li><strong>Nearest facility:</strong> ${addressCtx.nearestFacility.item.name || "City facility"} (${formatDistance(
            addressCtx.nearestFacility.distanceKm
          )})</li>`
        );
      }
      summaryEl.innerHTML = `
        <h3>Address insight</h3>
        <p>This address is outside the business dataset's ZIP coverage but nearby resources are listed below.</p>
        <div class="address-insight">
          <ul>${lines.join("")}</ul>
        </div>
      `;
    } else {
      summaryEl.innerHTML = `
        <h3>ZIP-specific insight</h3>
        <p>Select a ZIP code above to see business density, dominant sectors, and nearby neighborhoods highlighted on the maps.</p>
      `;
    }
    return;
  }

  const sharePct = (entry.share_of_city * 100).toFixed(1);
  const sectorNames = (entry.top_sectors || []).map((item) => `${item.sector} (${item.count.toLocaleString()})`);
  const neighborhoodNames = (entry.top_neighborhoods || []).map((item) => `${item.neighborhood} (${item.count.toLocaleString()})`);
  const addressCtx = options.addressContext;
  const schoolStats = sharedState.schoolCountsByZip.get(entry.zip);
  const stats = sharedState.citywideBusinessStats || {};
  const shareDiff = stats.shareAvg ? entry.share_of_city - stats.shareAvg : null;
  const countDiff = stats.countMedian ? entry.business_count - stats.countMedian : null;
  const shareRank = sharedState.shareRanking ? sharedState.shareRanking.indexOf(entry.zip) + 1 : null;

  let schoolHtml = "";
  if (schoolStats) {
    const detailParts = [];
    if (schoolStats.public) detailParts.push(`${schoolStats.public} public`);
    if (schoolStats.private) detailParts.push(`${schoolStats.private} private`);
    const detailText = detailParts.length ? detailParts.join(", ") : "Breakdown not available";
    schoolHtml = `<li><strong>Schools in ZIP:</strong> ${schoolStats.total} (${detailText})</li>`;
  }

  let addressHtml = "";
  if (addressCtx?.addressPoint) {
    const point = addressCtx.addressPoint;
    const addressLabel = point.label || point.address || "Selected address";
    const lines = [
      `<li><strong>Address:</strong> ${addressLabel}${point.zip ? ` (${point.zip})` : ""}</li>`,
    ];
    if (addressCtx.nearestPark?.item) {
      lines.push(
        `<li><strong>Nearest park:</strong> ${addressCtx.nearestPark.item.name || "Unnamed park"} (${formatDistance(
          addressCtx.nearestPark.distanceKm
        )})</li>`
      );
    }
    if (addressCtx.nearestFacility?.item) {
      lines.push(
        `<li><strong>Nearest facility:</strong> ${addressCtx.nearestFacility.item.name || "City facility"} (${formatDistance(
          addressCtx.nearestFacility.distanceKm
        )})</li>`
      );
    }
    if (addressCtx.nearestSchool?.item) {
      lines.push(
        `<li><strong>Nearest school:</strong> ${addressCtx.nearestSchool.item.name || "School"} (${formatDistance(
          addressCtx.nearestSchool.distanceKm
        )})</li>`
      );
    }
    addressHtml = `
      <div class="address-insight">
        <h4>Address insight</h4>
        <ul>${lines.join("")}</ul>
      </div>
    `;
  }

  let compareHtml = "";
  if (stats.shareAvg) {
    const shareDeltaLabel = shareDiff !== null ? formatSignedPercent(shareDiff * 100) : "N/A";
    const countDeltaLabel = countDiff !== null ? formatSignedNumber(countDiff) : "N/A";
    const rankLabel = shareRank && shareRank > 0 ? `#${shareRank} of ${stats.totalZips}` : "N/A";
    const shareClass = shareDiff === null ? "neutral" : shareDiff >= 0 ? "positive" : "negative";
    const countClass = countDiff === null ? "neutral" : countDiff >= 0 ? "positive" : "negative";
    compareHtml = `
      <div class="zip-compare">
        <div>
          <p class="label">Share vs city avg (${(stats.shareAvg * 100).toFixed(1)}%)</p>
          <p class="delta ${shareClass}">${shareDeltaLabel}</p>
        </div>
        <div>
          <p class="label">Business count vs median (${d3.format(",")(Math.round(stats.countMedian || 0))})</p>
          <p class="delta ${countClass}">${countDeltaLabel}</p>
        </div>
        <div>
          <p class="label">Citywide ranking</p>
          <p class="delta neutral">${rankLabel}</p>
        </div>
      </div>
    `;
  }

  summaryEl.innerHTML = `
    <h3>ZIP ${entry.zip}</h3>
    <p><strong>${entry.business_count.toLocaleString()}</strong> active businesses — <strong>${sharePct}%</strong> of all San Francisco listings.</p>
    <ul>
      <li><strong>Top sectors:</strong> ${sectorNames.length ? formatList(sectorNames) : "Data not available"}</li>
      <li><strong>Dominant neighborhoods:</strong> ${neighborhoodNames.length ? formatList(neighborhoodNames) : "Data not available"}</li>
      ${schoolHtml}
    </ul>
    ${compareHtml}
    <p class="chart-reference">Maps and charts now spotlight ZIP ${entry.zip}. Hover elsewhere to compare.</p>
    ${addressHtml}
  `;
}

function getZipCentroid(entry, neighborhoods) {
  if (entry?.centroid?.lat && entry?.centroid?.lon) {
    return entry.centroid;
  }
  const lookup = sharedState.neighborhoodCentroids;
  if (!lookup) return null;
  const list = neighborhoods
    .map((name) => lookup.get(name))
    .filter(Boolean);
  if (!list.length) return null;
  const { latSum, lonSum } = list.reduce(
    (acc, coords) => {
      acc.latSum += coords.lat;
      acc.lonSum += coords.lon;
      return acc;
    },
    { latSum: 0, lonSum: 0 }
  );
  return {
    lat: latSum / list.length,
    lon: lonSum / list.length,
  };
}

function updateZipFocusMarker(mapKey, coords) {
  const map = sharedState.maps[mapKey];
  if (!map || !coords) return;
  sharedState.zipFocusMarkers[mapKey] = sharedState.zipFocusMarkers[mapKey] || null;
  const existing = sharedState.zipFocusMarkers[mapKey];
  if (existing) {
    existing.setLatLng([coords.lat, coords.lon]);
    existing.setStyle({ opacity: 0.9, fillOpacity: 0.15 });
    existing.bringToFront();
    return;
  }
  const marker = L.circleMarker([coords.lat, coords.lon], {
    radius: 16,
    color: "#ffffff",
    weight: 2,
    opacity: 0.85,
    fillColor: COLOR.business,
    fillOpacity: 0.12,
    dashArray: "4,6",
  }).addTo(map);
  sharedState.zipFocusMarkers[mapKey] = marker;
}

function clearZipFocusMarkers() {
  Object.entries(sharedState.zipFocusMarkers || {}).forEach(([mapKey, marker]) => {
    if (marker && marker.remove) {
      marker.remove();
    }
    sharedState.zipFocusMarkers[mapKey] = null;
  });
}

function updateAddressMarker(coords, label) {
  const map = sharedState.maps.resource;
  if (!map || !coords) return;
  if (!sharedState.addressMarker) {
    sharedState.addressMarker = L.circleMarker([coords.lat, coords.lon], {
      radius: 8,
      color: "#e9c46a",
      weight: 2,
      fillColor: "#e9c46a",
      fillOpacity: 0.9,
    }).addTo(map);
  } else {
    sharedState.addressMarker.setLatLng([coords.lat, coords.lon]);
  }
  if (label) {
    sharedState.addressMarker.bindPopup(`<strong>${label}</strong>`).openPopup();
  }
}

function clearAddressMarker() {
  if (sharedState.addressMarker && sharedState.addressMarker.remove) {
    sharedState.addressMarker.remove();
  }
  sharedState.addressMarker = null;
}

function findNearest(entries, coords, limit = 1) {
  if (!entries?.length || !coords) return [];
  const results = [];
  entries.forEach((entry) => {
    const point = entry.coordinates || entry;
    if (!point?.lat || !point?.lon) return;
    const distanceKm = haversineDistance(coords.lat, coords.lon, point.lat, point.lon);
    results.push({ item: entry, distanceKm });
  });
  results.sort((a, b) => a.distanceKm - b.distanceKm);
  return results.slice(0, limit);
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(km) {
  if (km === undefined || km === null || Number.isNaN(km)) return "N/A";
  const miles = km * 0.621371;
  if (miles < 0.1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${miles.toFixed(1)} mi`;
}

function formatSignedPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  const rounded = value.toFixed(1);
  return `${value >= 0 ? "+" : ""}${rounded}%`;
}

function formatSignedNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  const rounded = Math.round(value);
  return `${value >= 0 ? "+" : ""}${d3.format(",")(rounded)}`;
}

function updateHighlightMessage() {
  if (!highlightEl) return;
  const names = [...sharedState.activeNeighborhoods];
  const context = sharedState.highlightContext || {};
  if (!names.length) {
    if (context.type === "address" && context.addressLabel) {
      const addressMsg = context.zip
        ? `${context.addressLabel} highlighted within ZIP ${context.zip}.`
        : `${context.addressLabel} pinpointed on the map.`;
      if (highlightEl.textContent !== addressMsg) {
        highlightEl.textContent = addressMsg;
      }
    } else if (context.type === "tour" && context.message) {
      if (highlightEl.textContent !== context.message) {
        highlightEl.textContent = context.message;
      }
    } else if (highlightEl.textContent !== highlightDefaultMessage) {
      highlightEl.textContent = highlightDefaultMessage;
    }
    return;
  }

  let message;
  if (context.type === "tour" && context.message) {
    message = context.message;
  } else if (context.type === "zip" && context.zip) {
    message = `ZIP ${context.zip} lights up ${formatList(names)} on both maps.`;
  } else if (context.type === "neighborhood") {
    message = `${formatList(names)} highlighted on both maps.`;
  } else if (context.type === "address") {
    const label = context.addressLabel || "Selected address";
    if (context.zip) {
      message = `${label} highlights ${formatList(names) || `ZIP ${context.zip}`} in ZIP ${context.zip}.`;
    } else if (names.length) {
      message = `${label} highlights ${formatList(names)}.`;
    } else {
      message = `${label} pinpointed on the map.`;
    }
  } else {
    message = `${formatList(names)} highlighted across the maps.`;
  }
  if (highlightEl.textContent !== message) {
    highlightEl.textContent = message;
  }
}

function showTooltip(x, y, html) {
  tooltipEl.innerHTML = html;
  tooltipEl.style.left = `${x}px`;
  tooltipEl.style.top = `${y}px`;
  tooltipEl.classList.add("is-visible");
}

function hideTooltip() {
  tooltipEl.classList.remove("is-visible");
}

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name)?.trim();
}

function formatList(items) {
  if (!items || !items.length) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
