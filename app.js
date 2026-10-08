/**
 * Londres 2026 — Interactive Travel Web App & Audio Guide Player
 */

// Application State
const state = {
  itinerary: null,
  audioguides: [],
  currentTab: 'all',
  currentGuide: null,
  currentTrack: null,
  isPlaying: false,
  playbackSpeed: 1.0,
  map: null,
  markersLayer: null,
  routesLayer: null,
  markersMap: new Map(), // stopId -> Leaflet marker
  currentBounds: [],
  isMobileMapView: false,
};

const DAY_COLORS = {
  1: '#D84315', // Naranja La City & Torre
  2: '#1565C0', // Azul Westminster & West End
  3: '#2E7D32', // Verde Museos Mayores
  4: '#C2185B', // Magenta King's Cross & Camden
};

// DOM Elements
const elements = {
  contentContainer: document.getElementById('content-container'),
  navPills: document.querySelectorAll('.nav-pill'),
  mobileMapToggle: document.getElementById('mobile-map-toggle'),
  mobileMapToggleText: document.getElementById('mobile-map-toggle-text'),
  mobileMapCloseBtn: document.getElementById('mobile-map-close-btn'),
  mapWrapper: document.getElementById('map-container-wrapper'),
  mapStopsCounter: document.getElementById('map-stops-counter'),
  headerAudioguidesBtn: document.getElementById('header-audioguides-btn'),
  headerFoodBtn: document.getElementById('header-food-btn'),

  // Audio Player
  audioEl: document.getElementById('main-audio'),
  playerBar: document.getElementById('audio-player-bar'),
  playerPlayBtn: document.getElementById('btn-player-play'),
  playerRewindBtn: document.getElementById('btn-player-rewind'),
  playerForwardBtn: document.getElementById('btn-player-forward'),
  playerSpeedBtn: document.getElementById('btn-player-speed'),
  playerProgressContainer: document.getElementById('player-progress-container'),
  playerProgressFill: document.getElementById('player-progress-fill'),
  playerTimeCurrent: document.getElementById('player-time-current'),
  playerTimeTotal: document.getElementById('player-time-total'),
  playerTrackTitle: document.getElementById('player-track-title'),
  playerGuideTitle: document.getElementById('player-guide-title'),
  playerTranscriptBtn: document.getElementById('btn-player-transcript'),
  playerPlaylistBtn: document.getElementById('btn-player-playlist'),
  playerMinimizeBtn: document.getElementById('btn-player-minimize'),
  playerRestoreBtn: document.getElementById('btn-player-restore'),
  playerRestoreLabel: document.getElementById('player-restore-label'),

  // Modal
  modal: document.getElementById('transcript-modal'),
  modalBadge: document.getElementById('modal-track-badge'),
  modalTitle: document.getElementById('modal-track-title'),
  modalBody: document.getElementById('modal-track-body'),
  modalPlayBtn: document.getElementById('modal-play-track-btn'),
  modalCloseBtn: document.getElementById('btn-close-modal'),
  modalCloseFooterBtn: document.getElementById('btn-close-modal-footer'),
};

// Initialize Application
async function init() {
  try {
    // Load JSON datasets
    const [itineraryRes, audioguidesRes] = await Promise.all([
      fetch('data/itinerary.json'),
      fetch('data/audioguides.json'),
    ]);

    state.itinerary = await itineraryRes.json();
    state.audioguides = await audioguidesRes.json();

    // Init Map
    initMap();

    // Render Initial View (All Days)
    renderTabContent('all');

    // Setup Event Listeners
    setupEventListeners();

    // Lucide Icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
  } catch (err) {
    console.error('Error inicializando aplicación:', err);
    elements.contentContainer.innerHTML = `
      <div class="p-6 bg-red-900/30 border border-red-700/50 rounded-2xl text-center">
        <h3 class="text-base font-bold text-red-200">Error cargando datos del viaje</h3>
        <p class="text-sm text-red-300/80 mt-1">${err.message}</p>
      </div>
    `;
  }
}

// Leaflet Map Initialization
function initMap() {
  const mapCenter = [51.5120, -0.1100];
  state.map = L.map('map', {
    zoomControl: true,
    scrollWheelZoom: false,
  }).setView(mapCenter, 13);

  // Base layer 1: ESRI World Street Map (Limpio, nítido, sin marcas de agua ni API key)
  const esriStreets = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, USGS, NPS',
      maxZoom: 19,
    }
  );

  // Base layer 2: OSM Turismo y Peatonal (detalles de calles, metro y parques)
  const osmHot = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  });

  // Base layer 3: Vista Satélite de alta resolución
  const esriSatellite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Tiles &copy; Esri &mdash; Earthstar Geographics',
      maxZoom: 19,
    }
  );

  // Activar ESRI Streets por defecto
  esriStreets.addTo(state.map);

  // Selector de capas base
  const baseMaps = {
    '🗺️ Callejero': esriStreets,
    '🚶 Detallado': osmHot,
    '🛰️ Satélite': esriSatellite,
  };
  L.control.layers(baseMaps, null, { position: 'topright' }).addTo(state.map);

  state.markersLayer = L.layerGroup().addTo(state.map);
  state.routesLayer = L.layerGroup().addTo(state.map);

  updateMapMarkers('all');
}

// Update Map Markers & Polylines for Tab
function updateMapMarkers(tab) {
  if (!state.map || !state.itinerary) return;

  state.markersLayer.clearLayers();
  state.routesLayer.clearLayers();
  state.markersMap.clear();

  const allBounds = [];

  const daysToRender = tab === 'all'
    ? state.itinerary.days
    : state.itinerary.days.filter(d => d.day_number.toString() === tab);

  let totalMarkers = 0;

  daysToRender.forEach(day => {
    const dayColor = DAY_COLORS[day.day_number] || '#3B82F6';
    const dayCoords = [];

    day.stops.forEach(stop => {
      const [lat, lon] = stop.coords;
      dayCoords.push([lat, lon]);
      allBounds.push([lat, lon]);
      totalMarkers++;

      // Custom HTML Pin Marker
      const customIcon = L.divIcon({
        className: 'custom-pin-container',
        html: `<div class="custom-map-pin" style="background-color: ${dayColor};">${stop.stop_number}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -18],
      });

      const audioBtnHtml = stop.audioguide ? `
        <button onclick="playFromPopup('${stop.audioguide.guide_id}', ${stop.audioguide.track_number})" class="mt-2 w-full px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors">
          <span>🎧 Escuchar Audioguía</span>
        </button>
      ` : '';

      const popupContent = `
        <div class="text-left w-56 font-sans">
          <div class="w-full h-24 rounded-lg overflow-hidden mb-2 bg-slate-900 border border-slate-700/80">
            <img src="${stop.image}" alt="${stop.name}" class="w-full h-full object-cover" loading="lazy">
          </div>
          <div class="flex items-center justify-between text-[11px] text-slate-400 font-medium mb-1">
            <span style="color: ${dayColor}">Día ${day.day_number} · Parada #${stop.stop_number}</span>
            <span>${stop.time_window}</span>
          </div>
          <h4 class="font-bold text-white text-sm leading-snug mb-1">${stop.name}</h4>
          <span class="inline-block text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono mb-2">
            ${stop.category}
          </span>
          <div class="flex gap-1.5 mt-2">
            <a href="${stop.navigation.google_maps}" target="_blank" rel="noopener noreferrer" class="flex-1 text-center py-1 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium border border-slate-700">
              Google Maps
            </a>
            <a href="${stop.navigation.apple_maps}" target="_blank" rel="noopener noreferrer" class="flex-1 text-center py-1 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium border border-slate-700">
              Apple Maps
            </a>
          </div>
          ${audioBtnHtml}
        </div>
      `;

      const marker = L.marker([lat, lon], { icon: customIcon })
        .bindPopup(popupContent)
        .addTo(state.markersLayer);

      state.markersMap.set(stop.id, marker);
    });

    // Draw connecting line between stops of this day
    if (dayCoords.length > 1) {
      L.polyline(dayCoords, {
        color: dayColor,
        weight: 3.5,
        opacity: 0.75,
        dashArray: '6, 8',
      }).addTo(state.routesLayer);
    }
  });

  state.currentBounds = allBounds;
  if (allBounds.length > 0 && (!elements.mapWrapper.classList.contains('hidden') || window.innerWidth >= 1024)) {
    fitCurrentMapBounds();
  }

  if (elements.mapStopsCounter) {
    elements.mapStopsCounter.textContent = `${totalMarkers} lugares en mapa`;
  }
}

// Fit bounds helper
function fitCurrentMapBounds() {
  if (!state.map || !state.currentBounds || state.currentBounds.length === 0) return;
  state.map.fitBounds(state.currentBounds, { padding: [30, 30], maxZoom: 15 });
}

// Update Mobile Map Toggle Button UI (Icon, Text & State)
function setMobileMapToggleUI(showingMap) {
  if (!elements.mobileMapToggle) return;
  if (showingMap) {
    elements.mobileMapToggle.className = 'lg:hidden px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white border border-sky-400 text-xs font-semibold flex items-center gap-1.5 shadow-md transition-all active:scale-95';
    elements.mobileMapToggle.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
      <span>Ver Lista</span>
    `;
  } else {
    elements.mobileMapToggle.className = 'lg:hidden px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors';
    elements.mobileMapToggle.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="18"></line><line x1="15" y1="6" x2="15" y2="21"></line></svg>
      <span>Ver Mapa</span>
    `;
  }
}

// Show/Hide Mobile Map View
function showMobileMap(show) {
  state.isMobileMapView = show;
  setMobileMapToggleUI(show);

  if (window.innerWidth < 1024) {
    if (show) {
      elements.contentContainer.classList.add('hidden');
      elements.mapWrapper.classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'instant' });
      setTimeout(() => {
        if (state.map) {
          state.map.invalidateSize();
          fitCurrentMapBounds();
        }
      }, 150);
    } else {
      elements.contentContainer.classList.remove('hidden');
      elements.mapWrapper.classList.add('hidden');
    }
  } else {
    elements.contentContainer.classList.remove('hidden');
    elements.mapWrapper.classList.remove('hidden');
    setTimeout(() => {
      if (state.map) state.map.invalidateSize();
    }, 100);
  }
}

// Window function for popup audio play
window.playFromPopup = function(guideId, trackNum) {
  playTrack(guideId, trackNum);
};

// Render Main Tabs Content
function renderTabContent(tab) {
  state.currentTab = tab;

  // Update nav pills active class
  elements.navPills.forEach(pill => {
    if (pill.dataset.tab === tab) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });

  if (tab === 'audioguides') {
    showMobileMap(false);
    if (elements.mobileMapToggle) elements.mobileMapToggle.style.display = 'none';
    renderAudioguidesTab();
    return;
  }

  if (tab === 'food') {
    showMobileMap(false);
    if (elements.mobileMapToggle) elements.mobileMapToggle.style.display = 'none';
    renderFoodTab();
    return;
  }

  if (tab === 'tips') {
    showMobileMap(false);
    if (elements.mobileMapToggle) elements.mobileMapToggle.style.display = 'none';
    renderTipsTab();
    return;
  }

  // Restore mobile map button for itinerary days
  if (elements.mobileMapToggle) elements.mobileMapToggle.style.display = '';

  // Render Itinerary Days
  renderItineraryTab(tab);
  updateMapMarkers(tab);

  if (window.innerWidth < 1024) {
    if (state.isMobileMapView) {
      showMobileMap(true);
    } else {
      showMobileMap(false);
    }
  }
}

// Render Itinerary Timeline Cards
function renderItineraryTab(tab) {
  const daysToRender = tab === 'all'
    ? state.itinerary.days
    : state.itinerary.days.filter(d => d.day_number.toString() === tab);

  let html = '';

  // Quick Day Jump Bar when viewing all days
  if (tab === 'all') {
    html += `
      <div class="p-4 rounded-2xl bg-gradient-to-r from-slate-800/90 to-slate-850/90 border border-slate-700/80 shadow-lg mb-6 backdrop-blur-sm">
        <div class="flex items-center justify-between gap-2 mb-2.5">
          <span class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <i data-lucide="calendar" class="w-4 h-4 text-sky-400"></i>
            Días del Itinerario (Pulsa para ver solo ese día):
          </span>
          <span class="text-[11px] font-medium text-slate-400 hidden sm:inline">4 días · 38 paradas</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          ${state.itinerary.days.map(d => {
            const color = DAY_COLORS[d.day_number] || '#3B82F6';
            const dayNames = { 1: 'Sábado 10', 2: 'Domingo 11', 3: 'Lunes 12', 4: 'Martes 13' };
            return `
              <button onclick="renderTabContent('${d.day_number}'); window.scrollTo({top: 0, behavior: 'smooth'});" class="p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-700/80 border text-left transition-all group shadow-sm active:scale-95" style="border-color: ${color}55;">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-[10px] font-extrabold uppercase tracking-wider" style="color: ${color};">Día ${d.day_number}</span>
                  <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${color};"></span>
                </div>
                <p class="text-xs font-bold text-white group-hover:text-sky-300 truncate">${dayNames[d.day_number] || d.title}</p>
                <span class="text-[10px] text-slate-400 block truncate">${d.stops.length} paradas planificadas</span>
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  daysToRender.forEach(day => {
    const dayColor = DAY_COLORS[day.day_number] || '#3B82F6';

    const dayFilterBtn = tab === 'all'
      ? `<button onclick="renderTabContent('${day.day_number}'); window.scrollTo({top: 0, behavior: 'smooth'});" class="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-700 text-slate-200 border border-slate-700/80 flex items-center gap-1 transition-all shadow-sm">
           <span>Ver solo Día ${day.day_number}</span>
           <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
         </button>`
      : `<button onclick="renderTabContent('all'); window.scrollTo({top: 0, behavior: 'smooth'});" class="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-700 text-slate-300 border border-slate-700/80 flex items-center gap-1 transition-all shadow-sm">
           <i data-lucide="layers" class="w-3.5 h-3.5 text-sky-400"></i>
           <span>Ver los 4 días</span>
         </button>`;

    html += `
      <div class="space-y-4 mb-10">
        <!-- Day Header Card -->
        <div class="p-5 rounded-2xl bg-gradient-to-r from-slate-800/90 to-slate-850/90 border border-slate-700/80 shadow-lg backdrop-blur-sm">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div class="flex items-center gap-2">
              <span class="w-3.5 h-3.5 rounded-full" style="background-color: ${dayColor}"></span>
              <span class="text-xs font-bold uppercase tracking-wider text-slate-400">${day.date_label}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold px-2.5 py-1 rounded-full text-white" style="background-color: ${dayColor}33; border: 1px solid ${dayColor}66">
                ${day.stops.length} paradas planificadas
              </span>
              ${dayFilterBtn}
            </div>
          </div>
          <h2 class="text-lg sm:text-xl font-bold text-white mb-1.5">${day.title}</h2>
          <p class="text-xs sm:text-sm text-slate-300 leading-relaxed mb-3">${day.subtitle}</p>

          <!-- Day Highlights -->
          <div class="flex flex-wrap gap-1.5">
            ${day.highlights.map(h => `
              <span class="text-[11px] px-2 py-0.5 rounded-md bg-slate-900/80 border border-slate-700/60 text-slate-300 font-medium">
                ★ ${h}
              </span>
            `).join('')}
          </div>
        </div>

        <!-- Start Transit from Accommodation -->
        ${day.start_transit ? renderStartTransit(day.start_transit, dayColor) : ''}

        <!-- Stops Timeline with Transit Connectors -->
        <div class="space-y-4">
          ${day.stops.map(stop => `
            ${renderStopCard(stop, day.day_number, dayColor)}
            ${stop.transit_to_next ? renderTransitConnector(stop.transit_to_next, dayColor) : ''}
          `).join('')}
        </div>

        <!-- End Transit to Accommodation / Return -->
        ${day.end_transit ? renderEndTransit(day.end_transit, dayColor) : ''}

        <!-- Day Navigation Footer for Individual Days -->
        ${tab !== 'all' ? `
          <div class="pt-8 pb-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800/80 mt-8 mb-6">
            ${day.day_number > 1 ? `
              <button onclick="renderTabContent('${day.day_number - 1}'); window.scrollTo({top: 0, behavior: 'smooth'});" class="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 border border-slate-700 transition-all shadow-sm">
                <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i>
                <span>Anterior: Día ${day.day_number - 1}</span>
              </button>
            ` : `<div class="hidden sm:block"></div>`}

            <button onclick="renderTabContent('all'); window.scrollTo({top: 0, behavior: 'smooth'});" class="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-all border border-slate-800">
              <i data-lucide="compass" class="w-3.5 h-3.5 text-sky-400"></i>
              <span>Ver los 4 días completos</span>
            </button>

            ${day.day_number < 4 ? `
              <button onclick="renderTabContent('${day.day_number + 1}'); window.scrollTo({top: 0, behavior: 'smooth'});" class="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-md transition-all">
                <span>Siguiente: Día ${day.day_number + 1}</span>
                <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
              </button>
            ` : `<div class="hidden sm:block"></div>`}
          </div>
        ` : ''}
      </div>
    `;
  });

  // End Footer when viewing all days
  if (tab === 'all') {
    html += `
      <div class="pt-8 pb-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800/80 mt-8 mb-6">
        <button onclick="window.scrollTo({top: 0, behavior: 'smooth'});" class="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 border border-slate-700 transition-all shadow-sm">
          <i data-lucide="arrow-up" class="w-3.5 h-3.5 text-sky-400"></i>
          <span>Volver arriba</span>
        </button>
        <div class="flex items-center gap-2 w-full sm:w-auto">
          <button onclick="renderTabContent('audioguides'); window.scrollTo({top: 0, behavior: 'smooth'});" class="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-xs font-medium flex items-center justify-center gap-1.5 transition-all">
            <i data-lucide="headphones" class="w-3.5 h-3.5"></i>
            <span>Ver 55 Audioguías</span>
          </button>
          <button onclick="renderTabContent('food'); window.scrollTo({top: 0, behavior: 'smooth'});" class="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 text-xs font-medium flex items-center justify-center gap-1.5 transition-all">
            <i data-lucide="utensils" class="w-3.5 h-3.5"></i>
            <span>Dónde Comer</span>
          </button>
        </div>
      </div>
    `;
  }

  elements.contentContainer.innerHTML = html;

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Transit Helpers & Render Functions
function getTransitIcon(mode) {
  switch (mode) {
    case 'subway':
    case 'train':
      return 'train';
    case 'bus':
      return 'bus';
    case 'boat':
      return 'ship';
    case 'walk':
    default:
      return 'footprints';
  }
}

function renderStartTransit(transit, dayColor) {
  if (!transit) return '';
  const icon = getTransitIcon(transit.mode);
  return `
    <div class="mb-4 p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-850 to-slate-900 border border-emerald-500/30 shadow-md">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-start gap-3 min-w-0">
          <div class="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
            <i data-lucide="${icon}" class="w-4 h-4"></i>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              <span class="text-xs font-bold text-emerald-300 uppercase tracking-wide flex items-center gap-1">
                🚩 Salida de la jornada
              </span>
              <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-900/60 border border-emerald-700/50 text-emerald-200">
                ${transit.mode_label} · ${transit.duration} (${transit.distance})
              </span>
            </div>
            <h4 class="text-xs sm:text-sm font-semibold text-white mb-0.5">
              ${transit.from} ➔ ${transit.to}
            </h4>
            <p class="text-xs text-slate-300 leading-relaxed">${transit.instructions}</p>
          </div>
        </div>
        ${transit.maps_url ? `
          <a href="${transit.maps_url}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1.5 rounded-xl bg-emerald-900/50 hover:bg-emerald-800/70 text-emerald-200 border border-emerald-700/50 text-xs font-semibold flex items-center gap-1.5 flex-shrink-0 transition-all hover:scale-[1.02] active:scale-95 shadow-sm">
            <i data-lucide="navigation" class="w-3.5 h-3.5"></i>
            <span class="hidden sm:inline">Ruta de salida</span>
          </a>
        ` : ''}
      </div>
    </div>
  `;
}

function renderEndTransit(transit, dayColor) {
  if (!transit) return '';
  const icon = getTransitIcon(transit.mode);
  return `
    <div class="mt-5 p-4 rounded-2xl bg-gradient-to-r from-purple-950/40 via-slate-850 to-slate-900 border border-purple-500/30 shadow-md">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-start gap-3 min-w-0">
          <div class="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
            <i data-lucide="${icon}" class="w-4 h-4"></i>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              <span class="text-xs font-bold text-purple-300 uppercase tracking-wide flex items-center gap-1">
                🏁 Fin de jornada y regreso
              </span>
              <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-900/60 border border-purple-700/50 text-purple-200">
                ${transit.mode_label} · ${transit.duration} (${transit.distance})
              </span>
            </div>
            <h4 class="text-xs sm:text-sm font-semibold text-white mb-0.5">
              ${transit.from} ➔ ${transit.to}
            </h4>
            <p class="text-xs text-slate-300 leading-relaxed">${transit.instructions}</p>
          </div>
        </div>
        ${transit.maps_url ? `
          <a href="${transit.maps_url}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1.5 rounded-xl bg-purple-900/50 hover:bg-purple-800/70 text-purple-200 border border-purple-700/50 text-xs font-semibold flex items-center gap-1.5 flex-shrink-0 transition-all hover:scale-[1.02] active:scale-95 shadow-sm">
            <i data-lucide="navigation" class="w-3.5 h-3.5"></i>
            <span class="hidden sm:inline">Ruta de vuelta</span>
          </a>
        ` : ''}
      </div>
    </div>
  `;
}

function renderTransitConnector(transit, dayColor) {
  if (!transit) return '';
  const icon = getTransitIcon(transit.mode);
  return `
    <div class="transit-connector my-2 px-3.5 py-2.5 rounded-xl bg-slate-850/80 border border-slate-700/60 shadow-sm flex items-center justify-between gap-3 text-xs transition-colors hover:border-slate-600">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-7 h-7 rounded-lg bg-sky-500/15 text-sky-400 border border-sky-500/30 flex items-center justify-center flex-shrink-0">
          <i data-lucide="${icon}" class="w-3.5 h-3.5"></i>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-bold text-sky-200">${transit.mode_label}</span>
            <span class="text-slate-400 font-mono text-[11px]">${transit.duration} (${transit.distance})</span>
            <span class="text-slate-500 hidden sm:inline">·</span>
            <span class="text-slate-300 font-medium text-[11px] truncate">Hacia: ${transit.to_stop_name}</span>
          </div>
          <p class="text-slate-400 text-[11px] mt-0.5 leading-snug">${transit.instructions}</p>
        </div>
      </div>
      ${transit.maps_url ? `
        <a href="${transit.maps_url}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 text-[11px] font-semibold flex items-center gap-1.5 flex-shrink-0 transition-colors" title="Ver ruta en Google Maps">
          <i data-lucide="navigation" class="w-3 h-3 text-sky-400"></i>
          <span class="hidden sm:inline">Ruta</span>
        </a>
      ` : ''}
    </div>
  `;
}

// Render Stop Meal & Restaurant Recommendations
function renderStopMeal(meal) {
  if (!meal || !meal.options || meal.options.length === 0) return '';

  const optionsHtml = meal.options.map(opt => `
    <div class="p-3.5 sm:p-4 rounded-xl bg-slate-900/90 border border-slate-700/80 hover:border-amber-500/50 transition-colors shadow-sm flex flex-col justify-between">
      <div>
        <!-- Top row: Option letter, category, name & rating -->
        <div class="flex flex-wrap items-center justify-between gap-2 mb-1.5">
          <div class="flex items-center gap-2 flex-wrap min-w-0">
            <span class="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 uppercase tracking-wide">
              Opción ${opt.option_letter} · ${opt.category}
            </span>
            <h5 class="text-sm font-bold text-white">${opt.name}</h5>
          </div>
          <span class="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 border border-slate-700 flex items-center gap-1 flex-shrink-0">
            ★ ${opt.rating}
          </span>
        </div>

        <!-- Location -->
        <p class="text-xs text-slate-400 mb-2 flex items-center gap-1.5">
          <i data-lucide="map-pin" class="w-3.5 h-3.5 text-slate-500 flex-shrink-0"></i>
          <span class="font-medium">${opt.location}</span>
        </p>

        <!-- Highlight Dish -->
        <p class="text-xs text-slate-300 leading-relaxed mb-3">
          <strong class="text-amber-200/90 font-semibold">Plato estrella:</strong> ${opt.highlight_dish}
        </p>
      </div>

      <!-- Bottom Bar: Price on left, prominent button on right -->
      <div class="pt-2.5 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mt-auto">
        <div class="flex items-center gap-1.5 text-xs">
          <span class="text-slate-400">Presupuesto orientativo:</span>
          <span class="font-mono text-emerald-400 font-bold">${opt.price_range}</span>
        </div>
        <a href="${opt.maps_url}" target="_blank" rel="noopener noreferrer" class="self-start sm:self-auto px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-xs font-semibold flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-95 shadow-sm flex-shrink-0">
          <i data-lucide="navigation" class="w-3.5 h-3.5 text-amber-400"></i>
          <span>Cómo llegar (Google Maps)</span>
        </a>
      </div>
    </div>
  `).join('');

  return `
    <div class="mt-3 mb-3 p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-950/40 via-slate-850 to-slate-900 border border-amber-500/30 shadow-md">
      <div class="flex items-start justify-between gap-2 mb-2 flex-wrap">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center flex-shrink-0 shadow-sm">
            <i data-lucide="utensils" class="w-4 h-4"></i>
          </div>
          <div>
            <h4 class="text-xs sm:text-sm font-bold text-amber-200 flex items-center gap-2">
              <span>${meal.type_label}: ${meal.title}</span>
            </h4>
            <span class="text-[11px] text-slate-400 flex items-center gap-1">
              <i data-lucide="clock" class="w-3 h-3 text-slate-500"></i>
              <span>Horario recomendado: ${meal.time_window}</span>
            </span>
          </div>
        </div>
        <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-900/60 border border-amber-700/50 text-amber-200">
          ${meal.options.length} opciones recomendadas
        </span>
      </div>

      ${meal.notes ? `
        <p class="text-xs text-slate-300 bg-amber-950/30 border border-amber-500/20 rounded-xl px-3 py-2 mb-3 leading-relaxed flex items-start gap-2">
          <i data-lucide="info" class="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5"></i>
          <span>${meal.notes}</span>
        </p>
      ` : ''}

      <div class="flex flex-col gap-3">
        ${optionsHtml}
      </div>
    </div>
  `;
}

// Toggle Stop Full Details Accordion
window.toggleStopDetails = function(stopId) {
  const container = document.getElementById(`details-${stopId}`);
  const chevron = document.getElementById(`toggle-chevron-${stopId}`);
  const actionText = document.getElementById(`toggle-action-${stopId}`);
  if (!container) return;

  const isHidden = container.classList.contains('hidden');
  if (isHidden) {
    container.classList.remove('hidden');
    if (chevron) chevron.classList.add('rotate-180');
    if (actionText) actionText.textContent = 'Ocultar';
    if (window.lucide) window.lucide.createIcons();
  } else {
    container.classList.add('hidden');
    if (chevron) chevron.classList.remove('rotate-180');
    if (actionText) actionText.textContent = 'Ver detalles';
  }
};

// Render Individual Stop Card
function renderStopCard(stop, dayNumber, dayColor) {
  const hasAudio = !!stop.audioguide;
  const audioAction = hasAudio ? `
    <button onclick="playTrack('${stop.audioguide.guide_id}', ${stop.audioguide.track_number})" class="px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all hover:scale-[1.02] active:scale-95">
      <i data-lucide="headphones" class="w-3.5 h-3.5 text-indigo-400"></i>
      <span>Pista Audioguía</span>
    </button>
  ` : '';

  const details = stop.details;

  const detailsAccordion = details ? `
    <!-- Expandable Details Accordion Trigger -->
    <button type="button" onclick="toggleStopDetails('${stop.id}')" id="btn-toggle-${stop.id}" class="w-full mt-3 py-2 px-3 rounded-xl bg-slate-900/80 hover:bg-slate-750 border border-slate-700/80 text-xs font-semibold text-slate-200 flex items-center justify-between transition-all group select-none shadow-sm cursor-pointer active:scale-[0.99]" title="Pulsa para desplegar u ocultar información detallada">
      <span class="flex items-center gap-2 min-w-0">
        <span class="w-5 h-5 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center flex-shrink-0">
          <i data-lucide="info" class="w-3.5 h-3.5"></i>
        </span>
        <span id="toggle-label-${stop.id}" class="text-left font-medium text-slate-200 group-hover:text-white truncate">Información completa & enlaces oficiales</span>
      </span>
      <span class="flex items-center gap-1.5 text-slate-400 group-hover:text-sky-300 transition-colors text-[11px] font-semibold flex-shrink-0 ml-2">
        <span id="toggle-action-${stop.id}">Ver detalles</span>
        <i data-lucide="chevron-down" id="toggle-chevron-${stop.id}" class="w-4 h-4 transition-transform duration-200"></i>
      </span>
    </button>

    <!-- Expandable Details Panel Content -->
    <div id="details-${stop.id}" class="hidden mt-3 pt-3.5 border-t border-slate-700/60 space-y-3 transition-all">
      <!-- 1. Grid Logístico / Ficha Técnica -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div class="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-start gap-2 shadow-inner">
          <i data-lucide="clock" class="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5"></i>
          <div>
            <span class="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Horario de apertura</span>
            <span class="text-slate-200 font-medium">${details.opening_hours}</span>
          </div>
        </div>

        <div class="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-start gap-2 shadow-inner">
          <i data-lucide="ticket" class="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5"></i>
          <div>
            <span class="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Precio & Entrada</span>
            <span class="text-slate-200 font-medium">${details.admission}</span>
          </div>
        </div>

        <div class="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-start gap-2 shadow-inner">
          <i data-lucide="train" class="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5"></i>
          <div>
            <span class="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Metro más cercano</span>
            <span class="text-slate-200 font-medium">${details.metro_station}</span>
          </div>
        </div>

        <div class="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-start gap-2 shadow-inner">
          <i data-lucide="map-pin" class="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5"></i>
          <div>
            <span class="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Dirección exacta</span>
            <span class="text-slate-200 font-medium">${details.address}</span>
          </div>
        </div>
      </div>

      <!-- 2. Historia y Curiosidades ampliadas -->
      ${details.curiosities ? `
        <div class="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/20 text-xs">
          <div class="flex items-center gap-1.5 font-bold text-indigo-300 mb-1">
            <i data-lucide="sparkles" class="w-3.5 h-3.5 text-indigo-400"></i>
            <span>Historia & Curiosidades del lugar</span>
          </div>
          <p class="text-slate-300 leading-relaxed">${details.curiosities}</p>
        </div>
      ` : ''}

      <!-- 3. Claves de visita & Consejos -->
      ${details.practical_tips ? `
        <div class="p-3 rounded-xl bg-amber-950/20 border border-amber-500/20 text-xs">
          <div class="flex items-center gap-1.5 font-bold text-amber-300 mb-1">
            <i data-lucide="shield-check" class="w-3.5 h-3.5 text-amber-400"></i>
            <span>Consejos de visita & Acceso sin colas</span>
          </div>
          <p class="text-slate-300 leading-relaxed">${details.practical_tips}</p>
        </div>
      ` : ''}

      <!-- 4. Enlaces para Ampliar Información -->
      <div class="pt-2 border-t border-slate-800 flex flex-col gap-2">
        <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <i data-lucide="external-link" class="w-3 h-3 text-sky-400"></i>
          Enlaces directos para ampliar información:
        </span>
        <div class="flex flex-wrap gap-2">
          ${details.official_website ? `
            <a href="${details.official_website}" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 rounded-lg bg-sky-950/60 hover:bg-sky-900/80 border border-sky-500/40 text-sky-200 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm hover:scale-[1.02] active:scale-95">
              <i data-lucide="globe" class="w-3.5 h-3.5 text-sky-400"></i>
              <span>Sitio Web Oficial</span>
              <i data-lucide="arrow-up-right" class="w-3 h-3 text-sky-400/80"></i>
            </a>
          ` : ''}

          ${details.wikipedia_url ? `
            <a href="${details.wikipedia_url}" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-750 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm hover:scale-[1.02] active:scale-95">
              <i data-lucide="book-open" class="w-3.5 h-3.5 text-indigo-400"></i>
              <span>Wikipedia (Historia)</span>
              <i data-lucide="arrow-up-right" class="w-3 h-3 text-slate-400"></i>
            </a>
          ` : ''}

          <a href="${stop.navigation.google_maps}" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-750 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm hover:scale-[1.02] active:scale-95">
            <i data-lucide="map" class="w-3.5 h-3.5 text-emerald-400"></i>
            <span>Google Maps (Reseñas & Fotos)</span>
            <i data-lucide="arrow-up-right" class="w-3 h-3 text-slate-400"></i>
          </a>

          <a href="${stop.navigation.apple_maps}" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-750 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm hover:scale-[1.02] active:scale-95">
            <i data-lucide="navigation" class="w-3.5 h-3.5 text-sky-400"></i>
            <span>Apple Maps</span>
            <i data-lucide="arrow-up-right" class="w-3 h-3 text-slate-400"></i>
          </a>

          ${stop.audioguide ? `
            <button onclick="playTrack('${stop.audioguide.guide_id}', ${stop.audioguide.track_number})" class="px-3 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm hover:scale-[1.02] active:scale-95">
              <i data-lucide="headphones" class="w-3.5 h-3.5 text-indigo-400"></i>
              <span>Escuchar Audioguía #${stop.audioguide.track_number}</span>
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  ` : '';

  return `
    <div class="stop-card bg-slate-800/70 border border-slate-700/70 rounded-2xl p-4 sm:p-5 shadow-md backdrop-blur-sm transition-colors hover:border-slate-600/80" id="card-${stop.id}">
      <div class="flex flex-col sm:flex-row gap-4 items-start">

        <!-- Left Badge & Image (Clickable to expand) -->
        <div onclick="toggleStopDetails('${stop.id}')" class="w-full sm:w-36 h-28 sm:h-28 rounded-xl overflow-hidden relative flex-shrink-0 bg-slate-900 border border-slate-700/50 shadow-inner group cursor-pointer" title="Pulsa para ver detalles completos">
          <img src="${stop.image}" alt="${stop.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy">
          <div class="absolute top-2 left-2 w-7 h-7 rounded-full text-white font-extrabold text-xs flex items-center justify-center shadow-lg" style="background-color: ${dayColor}; border: 2px solid white;">
            ${stop.stop_number}
          </div>
          <div class="absolute bottom-2 right-2 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/75 text-white backdrop-blur-xs">
            ${stop.duration}
          </div>
        </div>

        <!-- Stop Body -->
        <div class="flex-1 min-w-0 w-full">
          <div class="flex flex-wrap items-center justify-between gap-1.5 mb-1">
            <span class="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-slate-300">
              ${stop.category}
            </span>
            <span class="text-xs font-mono font-medium text-slate-400 flex items-center gap-1">
              <i data-lucide="clock" class="w-3 h-3 text-slate-500"></i>
              ${stop.time_window}
            </span>
          </div>

          <h3 onclick="toggleStopDetails('${stop.id}')" class="text-base sm:text-lg font-bold text-white mb-2 leading-snug cursor-pointer hover:text-sky-300 transition-colors flex items-center justify-between gap-2" title="Pulsa para ver detalles completos">
            <span>${stop.name}</span>
            <i data-lucide="chevron-down" class="w-4 h-4 text-slate-400 flex-shrink-0 sm:hidden"></i>
          </h3>

          <p class="text-xs sm:text-sm text-slate-300 leading-relaxed mb-3">
            ${stop.description}
          </p>

          <!-- Hack / Pro Tip Callout -->
          <div class="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 leading-relaxed mb-3 flex items-start gap-2">
            <i data-lucide="zap" class="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5"></i>
            <div>
              <span class="font-bold text-amber-300">Clave viajera: </span>
              ${stop.hack}
            </div>
          </div>

          <!-- Gastronomía / Restaurantes Recomendados -->
          ${stop.meal ? renderStopMeal(stop.meal) : ''}

          <!-- Expandable Details Accordion -->
          ${detailsAccordion}

          <!-- Bottom Actions (GPS Navigation & Audio) -->
          <div class="flex flex-wrap items-center justify-between gap-2 pt-2 mt-3 border-t border-slate-700/50">
            <div class="flex items-center gap-2">
              <a href="${stop.navigation.google_maps}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors">
                <i data-lucide="navigation" class="w-3 h-3 text-emerald-400"></i>
                <span>Google Maps</span>
              </a>
              <a href="${stop.navigation.apple_maps}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors">
                <i data-lucide="map" class="w-3 h-3 text-sky-400"></i>
                <span>Apple Maps</span>
              </a>
            </div>

            <div class="flex items-center gap-2">
              <button onclick="focusOnMap('${stop.id}')" class="px-2.5 py-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs font-medium flex items-center gap-1 transition-colors">
                <i data-lucide="crosshair" class="w-3 h-3"></i>
                <span>Ver en mapa</span>
              </button>
              ${audioAction}
            </div>
          </div>

        </div>

      </div>
    </div>
  `;
}

// Render Audioguides Tab View (7 Guides, 52 Tracks)
function renderAudioguidesTab() {
  if (!state.audioguides || state.audioguides.length === 0) {
    elements.contentContainer.innerHTML = `
      <div class="p-8 text-center text-slate-400">Cargando biblioteca de audioguías...</div>
    `;
    return;
  }

  let html = `
    <div class="space-y-6">
      <div class="p-5 rounded-2xl bg-gradient-to-r from-indigo-950/80 via-slate-850 to-slate-900 border border-indigo-500/30 shadow-xl">
        <div class="flex items-center gap-3 mb-2">
          <div class="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-500/50 flex items-center justify-center text-xl">
            🎙️
          </div>
          <div>
            <h2 class="text-lg sm:text-xl font-bold text-white">Biblioteca Maestra de Audioguías Inmersivas</h2>
            <p class="text-xs text-indigo-300">55 pistas paso a paso en orden cronológico del viaje con voz neural ('es-ES-ElviraNeural', narración dinámica y cálida)</p>
          </div>
        </div>
        <p class="text-xs sm:text-sm text-slate-300 leading-relaxed">
          Diseñadas en formato de <em>Free Tour narrado</em> para escuchar mientras caminas o visitas cada sala: con indicaciones exactas de hacia dónde mirar, anécdotas históricas contrastadas y curiosidades divertidas.
        </p>
      </div>

      <div class="space-y-4">
        ${state.audioguides.map(guide => renderGuideAccordion(guide)).join('')}
      </div>
    </div>
  `;

  elements.contentContainer.innerHTML = html;

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Render Single Guide Card with its tracks
function renderGuideAccordion(guide) {
  const dayIcons = {
    '01_dia_sabado_city_tate_torre_londres': '🏛️',
    '02_dia_domingo_westminster_national_gallery_london_eye': '👑',
    '03_dia_lunes_british_museum_historia_natural': '🦕',
    '04_dia_martes_kings_cross_camden': '⚡',
  };
  const dayColors = {
    '01_dia_sabado_city_tate_torre_londres': 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    '02_dia_domingo_westminster_national_gallery_london_eye': 'border-blue-500/40 bg-blue-500/10 text-blue-300',
    '03_dia_lunes_british_museum_historia_natural': 'border-purple-500/40 bg-purple-500/10 text-purple-300',
    '04_dia_martes_kings_cross_camden': 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  };
  const icon = dayIcons[guide.guide_id] || '🎙️';
  const badgeStyle = dayColors[guide.guide_id] || 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300';

  return `
    <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl overflow-hidden shadow-lg backdrop-blur-sm">
      <div class="p-4 sm:p-5 flex items-center justify-between cursor-pointer hover:bg-slate-750 transition-colors" onclick="toggleGuideTracks('${guide.guide_id}')">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-lg flex-shrink-0">
            ${icon}
          </div>
          <div>
            <h3 class="text-base font-bold text-white">${guide.title}</h3>
            <p class="text-xs text-slate-400 line-clamp-1">${guide.subtitle}</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs font-semibold px-2.5 py-1 rounded-full border ${badgeStyle}">
            ${guide.tracks.length} pistas
          </span>
          <i data-lucide="chevron-down" id="chevron-${guide.guide_id}" class="w-5 h-5 text-slate-400 transition-transform duration-200"></i>
        </div>
      </div>

      <!-- Tracks List -->
      <div id="tracks-${guide.guide_id}" class="divide-y divide-slate-700/60 bg-slate-850/60 border-t border-slate-700/60">
        ${guide.tracks.map(track => `
          <div class="p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-slate-800/80 transition-colors">
            <div class="flex items-center gap-3 min-w-0">
              <button onclick="playTrack('${guide.guide_id}', ${track.track_number})" class="w-9 h-9 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center flex-shrink-0 shadow transition-all hover:scale-105 active:scale-95" title="Reproducir">
                <i data-lucide="play" class="w-4 h-4 ml-0.5"></i>
              </button>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-bold text-indigo-400">Pista ${track.track_number}</span>
                  <span class="text-[10px] text-slate-400 font-mono">(${track.duration_est})</span>
                </div>
                <h4 class="text-xs sm:text-sm font-semibold text-slate-100 truncate">${track.title}</h4>
              </div>
            </div>

            <button onclick="openTranscriptModal('${guide.guide_id}', ${track.track_number})" class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 flex-shrink-0 transition-colors">
              <i data-lucide="file-text" class="w-3.5 h-3.5 text-emerald-400"></i>
              <span>Guion</span>
            </button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Window function for Accordion Toggle
window.toggleGuideTracks = function(guideId) {
  const container = document.getElementById(`tracks-${guideId}`);
  const chevron = document.getElementById(`chevron-${guideId}`);
  if (container) {
    container.classList.toggle('hidden');
    if (chevron) {
      chevron.classList.toggle('rotate-180');
    }
  }
};

// Render Practical Tips Tab View
function renderTipsTab() {
  if (!state.itinerary || !state.itinerary.practical_tips) return;

  const html = `
    <div class="space-y-6">
      <div class="p-5 rounded-2xl bg-gradient-to-r from-amber-950/80 via-slate-850 to-slate-900 border border-amber-500/30 shadow-xl">
        <div class="flex items-center gap-3 mb-2">
          <div class="w-10 h-10 rounded-xl bg-amber-600/30 border border-amber-500/50 flex items-center justify-center text-xl">
            💡
          </div>
          <div>
            <h2 class="text-lg sm:text-xl font-bold text-white">Consejos Prácticos & Logística en Londres</h2>
            <p class="text-xs text-amber-300">Normas de transporte, pagos, enchufes y teléfonos de emergencia</p>
          </div>
        </div>
        <p class="text-xs sm:text-sm text-slate-300 leading-relaxed">
          Todo lo necesario para moverte con fluidez, ahorrar dinero y no tener dudas durante las 4 jornadas en la capital británica.
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${state.itinerary.practical_tips.map(tip => `
          <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 shadow-lg">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-xs font-bold uppercase tracking-wider text-amber-400">${tip.category}</span>
            </div>
            <h3 class="text-base font-bold text-white mb-2">${tip.title}</h3>
            <p class="text-xs sm:text-sm text-slate-300 leading-relaxed">${tip.description}</p>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  elements.contentContainer.innerHTML = html;

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Render Food & Gastronomy Tab View
function renderFoodTab() {
  if (!state.itinerary) return;

  const gastronomy = state.itinerary.gastronomy_guide || {};
  const gems = gastronomy.multicultural_gems || [];
  const diningTips = gastronomy.dining_tips || [];

  // Collect all meals across all days
  const dailyMeals = [];
  state.itinerary.days.forEach(day => {
    const mealsInDay = [];
    day.stops.forEach(stop => {
      if (stop.meal) {
        mealsInDay.push({
          stopName: stop.name,
          stopNumber: stop.stop_number,
          meal: stop.meal,
        });
      }
    });
    if (mealsInDay.length > 0) {
      dailyMeals.push({
        dayNumber: day.day_number,
        dateLabel: day.date_label,
        color: DAY_COLORS[day.day_number] || '#3B82F6',
        meals: mealsInDay,
      });
    }
  });

  const tipsHtml = diningTips.map(tip => `
    <div class="p-4 rounded-xl bg-slate-800/80 border border-slate-700/80 shadow-sm flex items-start gap-3">
      <div class="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
        <i data-lucide="${tip.icon || 'info'}" class="w-4 h-4"></i>
      </div>
      <div>
        <h4 class="text-xs sm:text-sm font-bold text-white mb-1">${tip.title}</h4>
        <p class="text-xs text-slate-300 leading-relaxed">${tip.description}</p>
      </div>
    </div>
  `).join('');

  const dailyMealsHtml = dailyMeals.map(d => `
    <div class="space-y-4 mb-8">
      <div class="flex items-center gap-2 pb-2 border-b border-slate-800">
        <span class="w-3.5 h-3.5 rounded-full" style="background-color: ${d.color}"></span>
        <h3 class="text-base font-bold text-white">Día ${d.dayNumber} · ${d.dateLabel}</h3>
      </div>
      <div class="space-y-4">
        ${d.meals.map(m => `
          <div class="space-y-2">
            <div class="flex items-center gap-2 text-xs text-slate-400">
              <span class="font-semibold text-slate-300">En parada #${m.stopNumber} (${m.stopName})</span>
            </div>
            ${renderStopMeal(m.meal)}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  const gemsHtml = gems.map(gem => `
    <div class="p-4 sm:p-5 rounded-2xl bg-slate-800/90 border border-slate-700/80 shadow-md flex flex-col justify-between hover:border-amber-500/50 transition-colors">
      <div>
        <div class="flex items-start justify-between gap-2 mb-2 flex-wrap">
          <div class="flex items-center gap-2">
            <span class="w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center justify-center">
              ${gem.rank}
            </span>
            <span class="text-xs font-bold text-amber-400 uppercase tracking-wide">
              ${gem.tag}
            </span>
          </div>
          <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-amber-300">
            ${gem.rating}
          </span>
        </div>

        <h4 class="text-base font-bold text-white mb-0.5">${gem.name}</h4>
        <p class="text-xs font-medium text-amber-200/90 mb-2 italic">${gem.subtitle}</p>

        <p class="text-xs text-slate-300 leading-relaxed mb-3">
          ${gem.why_visit}
        </p>

        <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800 mb-3 space-y-1.5 text-xs">
          <div>
            <strong class="text-amber-300">Qué pedir (para 3):</strong>
            <span class="text-slate-300">${gem.must_order}</span>
          </div>
          <div>
            <strong class="text-slate-400">Presupuesto orientativo:</strong>
            <span class="font-mono text-emerald-400 font-semibold">${gem.budget}</span>
          </div>
        </div>

        <div class="text-[11px] text-slate-400 space-y-1 mb-3">
          <span class="font-semibold text-slate-300 block">Ubicaciones en ruta:</span>
          ${gem.locations.map(loc => `
            <div class="flex items-center gap-1.5">
              <i data-lucide="map-pin" class="w-3 h-3 text-slate-500 flex-shrink-0"></i>
              <span>${loc}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="pt-2 border-t border-slate-700/60 mt-auto">
        <a href="${gem.maps_url}" target="_blank" rel="noopener noreferrer" class="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors">
          <i data-lucide="navigation" class="w-3.5 h-3.5 text-amber-400"></i>
          <span>Buscar en Google Maps</span>
        </a>
      </div>
    </div>
  `).join('');

  const html = `
    <div class="space-y-6">
      <!-- Main Gastronomy Header Banner -->
      <div class="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-amber-950/80 via-slate-850 to-slate-900 border border-amber-500/30 shadow-xl">
        <div class="flex items-center gap-3 mb-2">
          <div class="w-10 h-10 rounded-xl bg-amber-600/30 border border-amber-500/50 flex items-center justify-center text-xl">
            🍽️
          </div>
          <div>
            <h2 class="text-lg sm:text-xl font-bold text-white">Guía Gastronómica de Londres: Comidas y Cenas</h2>
            <p class="text-xs text-amber-300">Restaurantes, puestos de mercado y pubs tradicionales propuestos para cada día</p>
          </div>
        </div>
        <p class="text-xs sm:text-sm text-slate-300 leading-relaxed mb-4">
          Cada parada estratégica cuenta con 3 o 4 opciones seleccionadas: desde bocadillos virales y Sunday Roast clásico hasta auténtico pato asado, sushi fresco, pizzas artesanales y las mejores smashburgers de la capital.
        </p>

        <!-- Quick Tips in Header -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          ${tipsHtml}
        </div>
      </div>

      <!-- Daily Meals Sections -->
      <div class="space-y-6">
        <div class="flex items-center gap-2">
          <i data-lucide="calendar" class="w-5 h-5 text-amber-400"></i>
          <h3 class="text-lg font-bold text-white">Propuestas por Día del Itinerario</h3>
        </div>
        ${dailyMealsHtml}
      </div>

      <!-- 7 Multicultural Culinary Gems -->
      <div class="space-y-4 pt-4 border-t border-slate-800">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-2">
            <i data-lucide="sparkles" class="w-5 h-5 text-amber-400"></i>
            <h3 class="text-lg font-bold text-white">"Lo que haría yo": 7 Joyas Multiculturales Únicas</h3>
          </div>
          <span class="text-xs text-slate-400">Cocinas del mundo en Londres de nivel superior</span>
        </div>
        <p class="text-xs sm:text-sm text-slate-300 leading-relaxed">
          Si os apetece salir de la rutina de hamburguesas y pizzas, estas 7 experiencias gastronómicas representan la cumbre multicultural de Londres, con locales ubicados directamente en vuestra ruta y presupuestos moderados para la familia.
        </p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${gemsHtml}
        </div>
      </div>
    </div>
  `;

  elements.contentContainer.innerHTML = html;

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Map Focus Function
window.focusOnMap = function(stopId) {
  const marker = state.markersMap.get(stopId);
  if (marker && state.map) {
    if (window.innerWidth < 1024) {
      showMobileMap(true);
      setTimeout(() => {
        state.map.setView(marker.getLatLng(), 16, { animate: true });
        marker.openPopup();
      }, 200);
    } else {
      state.map.setView(marker.getLatLng(), 16, { animate: true });
      marker.openPopup();
    }
  }
};

// Helper to find a guide by ID with fallback matching for aliases or short names
function findGuide(guideId) {
  if (!guideId || !state.audioguides) return null;
  // 1. Exact match
  let guide = state.audioguides.find(g => g.guide_id === guideId);
  if (guide) return guide;

  // 2. Fallback prefix or substring matching
  const cleanId = String(guideId).toLowerCase().trim();
  guide = state.audioguides.find(g => {
    const gid = g.guide_id.toLowerCase();
    return gid.startsWith(cleanId) || cleanId.startsWith(gid) || gid.includes(cleanId) || cleanId.includes(gid);
  });
  return guide;
}

// ==================== AUDIO PLAYER LOGIC ====================

// Play Specific Track
window.playTrack = function(guideId, trackNum) {
  const guide = findGuide(guideId);
  if (!guide) {
    console.warn(`[AudioPlayer] Audioguía no encontrada para: "${guideId}"`);
    return;
  }

  const track = guide.tracks.find(t => t.track_number === trackNum) || guide.tracks[0];
  if (!track) {
    console.warn(`[AudioPlayer] Pista no encontrada: ${trackNum} en guía "${guide.guide_id}"`);
    return;
  }

  state.currentGuide = guide;
  state.currentTrack = track;

  // Set audio source
  elements.audioEl.src = track.audio_file;
  elements.audioEl.playbackRate = state.playbackSpeed;

  // Update Player UI
  elements.playerTrackTitle.textContent = `Pista ${track.track_number}: ${track.title}`;
  elements.playerGuideTitle.textContent = guide.title;
  elements.playerTimeCurrent.textContent = '0:00';
  elements.playerTimeTotal.textContent = track.duration_est || '--:--';
  elements.playerProgressFill.style.width = '0%';

  // Highlight player bar & restore if minimized
  restorePlayer();
  if (elements.playerRestoreLabel) {
    elements.playerRestoreLabel.textContent = `Pista ${track.track_number}`;
  }
  if (elements.playerBar) {
    elements.playerBar.classList.add('ring-1', 'ring-indigo-500/50');
  }

  // Play audio
  elements.audioEl.play().then(() => {
    state.isPlaying = true;
    updatePlayStateUI(true);
    setupMediaSession(guide, track);
  }).catch(err => {
    console.warn('Auto-play blocked or audio load error:', err);
    updatePlayStateUI(false);
  });
};

function minimizePlayer() {
  if (!elements.playerBar) return;
  elements.playerBar.classList.add('player-minimized');
  if (elements.playerRestoreBtn) {
    elements.playerRestoreBtn.classList.remove('hidden');
    elements.playerRestoreBtn.classList.add('flex');
  }
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function restorePlayer() {
  if (!elements.playerBar) return;
  elements.playerBar.classList.remove('player-minimized');
  if (elements.playerRestoreBtn) {
    elements.playerRestoreBtn.classList.remove('flex');
    elements.playerRestoreBtn.classList.add('hidden');
  }
}

function updatePlayStateUI(playing) {
  state.isPlaying = playing;
  if (elements.playerPlayBtn) {
    if (playing) {
      elements.playerPlayBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 text-white">
          <rect width="4" height="16" x="6" y="4" rx="1"></rect>
          <rect width="4" height="16" x="14" y="4" rx="1"></rect>
        </svg>
      `;
      elements.playerPlayBtn.setAttribute('title', 'Pausar');
      elements.playerPlayBtn.setAttribute('aria-label', 'Pausar');
    } else {
      elements.playerPlayBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 text-white ml-0.5">
          <polygon points="6 3 20 12 6 21 6 3"></polygon>
        </svg>
      `;
      elements.playerPlayBtn.setAttribute('title', 'Reproducir');
      elements.playerPlayBtn.setAttribute('aria-label', 'Reproducir');
    }
  }
}

// MediaSession API (Lockscreen & Smartwatch controls)
function setupMediaSession(guide, track) {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `Pista ${track.track_number}: ${track.title}`,
      artist: guide.title,
      album: 'Guía de Londres 2026',
      artwork: [
        { src: 'images/d1-s1.jpg', sizes: '512x512', type: 'image/jpeg' },
      ],
    });

    navigator.mediaSession.setActionHandler('play', () => {
      elements.audioEl.play();
      updatePlayStateUI(true);
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      elements.audioEl.pause();
      updatePlayStateUI(false);
    });

    navigator.mediaSession.setActionHandler('seekbackward', () => {
      elements.audioEl.currentTime = Math.max(0, elements.audioEl.currentTime - 15);
    });

    navigator.mediaSession.setActionHandler('seekforward', () => {
      elements.audioEl.currentTime = Math.min(elements.audioEl.duration, elements.audioEl.currentTime + 15);
    });

    navigator.mediaSession.setActionHandler('previoustrack', () => {
      playPreviousTrack();
    });

    navigator.mediaSession.setActionHandler('nexttrack', () => {
      playNextTrack();
    });
  }
}

function playNextTrack() {
  if (!state.currentGuide || !state.currentTrack) return;
  const currentIdx = state.currentGuide.tracks.findIndex(t => t.track_number === state.currentTrack.track_number);
  if (currentIdx !== -1 && currentIdx + 1 < state.currentGuide.tracks.length) {
    const nextTrack = state.currentGuide.tracks[currentIdx + 1];
    playTrack(state.currentGuide.guide_id, nextTrack.track_number);
  } else {
    // Si concluye el día actual, avanzar a la primera pista del día siguiente en el orden del viaje
    const guideIdx = state.audioguides.findIndex(g => g.guide_id === state.currentGuide.guide_id);
    if (guideIdx !== -1 && guideIdx + 1 < state.audioguides.length) {
      const nextGuide = state.audioguides[guideIdx + 1];
      if (nextGuide.tracks.length > 0) {
        playTrack(nextGuide.guide_id, nextGuide.tracks[0].track_number);
      }
    }
  }
}

function playPreviousTrack() {
  if (!state.currentGuide || !state.currentTrack) return;
  const currentIdx = state.currentGuide.tracks.findIndex(t => t.track_number === state.currentTrack.track_number);
  if (currentIdx > 0) {
    const prevTrack = state.currentGuide.tracks[currentIdx - 1];
    playTrack(state.currentGuide.guide_id, prevTrack.track_number);
  } else {
    // Si está en la primera pista del día y pulsa anterior, ir a la última pista del día anterior
    const guideIdx = state.audioguides.findIndex(g => g.guide_id === state.currentGuide.guide_id);
    if (guideIdx > 0) {
      const prevGuide = state.audioguides[guideIdx - 1];
      if (prevGuide.tracks.length > 0) {
        const lastTrack = prevGuide.tracks[prevGuide.tracks.length - 1];
        playTrack(prevGuide.guide_id, lastTrack.track_number);
      }
    }
  }
}

function formatSeconds(secs) {
  if (isNaN(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Setup Event Listeners
function setupEventListeners() {
  // Navigation Pills
  elements.navPills.forEach(pill => {
    pill.addEventListener('click', () => {
      renderTabContent(pill.dataset.tab);
    });
  });

  // Mobile Map Toggle Button
  if (elements.mobileMapToggle) {
    elements.mobileMapToggle.addEventListener('click', () => {
      showMobileMap(!state.isMobileMapView);
    });
  }

  // Mobile Map Close Button (inline in map header)
  if (elements.mobileMapCloseBtn) {
    elements.mobileMapCloseBtn.addEventListener('click', () => {
      showMobileMap(false);
    });
  }

  // Responsive Resize
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) {
      elements.contentContainer.classList.remove('hidden');
      elements.mapWrapper.classList.remove('hidden');
      if (state.map) state.map.invalidateSize();
    } else {
      if (state.isMobileMapView) {
        elements.contentContainer.classList.add('hidden');
        elements.mapWrapper.classList.remove('hidden');
        if (state.map) state.map.invalidateSize();
      } else {
        elements.contentContainer.classList.remove('hidden');
        elements.mapWrapper.classList.add('hidden');
      }
    }
  });

  // Header Audioguides Shortcut
  if (elements.headerAudioguidesBtn) {
    elements.headerAudioguidesBtn.addEventListener('click', () => {
      renderTabContent('audioguides');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Header Food Shortcut
  if (elements.headerFoodBtn) {
    elements.headerFoodBtn.addEventListener('click', () => {
      renderTabContent('food');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Audio Play/Pause Button
  elements.playerPlayBtn.addEventListener('click', () => {
    if (!state.currentTrack) {
      // Default to first track of first guide
      if (state.audioguides.length > 0 && state.audioguides[0].tracks.length > 0) {
        playTrack(state.audioguides[0].guide_id, 1);
      }
      return;
    }

    if (elements.audioEl.paused) {
      elements.audioEl.play().catch(err => console.warn('Play error:', err));
    } else {
      elements.audioEl.pause();
    }
  });

  // Sincronización automática con eventos nativos del elemento de audio
  elements.audioEl.addEventListener('play', () => updatePlayStateUI(true));
  elements.audioEl.addEventListener('playing', () => updatePlayStateUI(true));
  elements.audioEl.addEventListener('pause', () => updatePlayStateUI(false));
  elements.audioEl.addEventListener('ended', () => updatePlayStateUI(false));

  // Rewind / Forward 15s
  elements.playerRewindBtn.addEventListener('click', () => {
    elements.audioEl.currentTime = Math.max(0, elements.audioEl.currentTime - 15);
  });

  elements.playerForwardBtn.addEventListener('click', () => {
    elements.audioEl.currentTime = Math.min(elements.audioEl.duration || 0, elements.audioEl.currentTime + 15);
  });

  // Speed Selector
  const speeds = [1.0, 1.25, 1.5, 2.0, 0.85];
  elements.playerSpeedBtn.addEventListener('click', () => {
    const nextIdx = (speeds.indexOf(state.playbackSpeed) + 1) % speeds.length;
    state.playbackSpeed = speeds[nextIdx];
    elements.audioEl.playbackRate = state.playbackSpeed;
    elements.playerSpeedBtn.textContent = `${state.playbackSpeed}x`;
  });

  // Progress Bar Time Update
  elements.audioEl.addEventListener('timeupdate', () => {
    const cur = elements.audioEl.currentTime;
    const dur = elements.audioEl.duration;
    elements.playerTimeCurrent.textContent = formatSeconds(cur);

    if (dur && !isNaN(dur)) {
      elements.playerTimeTotal.textContent = formatSeconds(dur);
      const pct = (cur / dur) * 100;
      elements.playerProgressFill.style.width = `${pct}%`;
    }
  });

  // Scrubber Seek Click
  elements.playerProgressContainer.addEventListener('click', (e) => {
    const rect = elements.playerProgressContainer.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const pct = clickX / width;
    if (elements.audioEl.duration) {
      elements.audioEl.currentTime = pct * elements.audioEl.duration;
    }
  });

  // Auto-play next track on finish
  elements.audioEl.addEventListener('ended', () => {
    playNextTrack();
  });

  // Transcript Button in Audio Bar
  elements.playerTranscriptBtn.addEventListener('click', () => {
    if (state.currentGuide && state.currentTrack) {
      openTranscriptModal(state.currentGuide.guide_id, state.currentTrack.track_number);
    } else if (state.audioguides.length > 0) {
      openTranscriptModal(state.audioguides[0].guide_id, 1);
    }
  });

  // Playlist Button in Audio Bar
  elements.playerPlaylistBtn.addEventListener('click', () => {
    renderTabContent('audioguides');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Minimize & Restore Player Bar
  if (elements.playerMinimizeBtn) {
    elements.playerMinimizeBtn.addEventListener('click', minimizePlayer);
  }
  if (elements.playerRestoreBtn) {
    elements.playerRestoreBtn.addEventListener('click', restorePlayer);
  }

  // Modal Close Buttons
  elements.modalCloseBtn.addEventListener('click', closeTranscriptModal);
  elements.modalCloseFooterBtn.addEventListener('click', closeTranscriptModal);
  elements.modal.addEventListener('click', (e) => {
    if (e.target === elements.modal) {
      closeTranscriptModal();
    }
  });
}

// ==================== TRANSCRIPT MODAL ====================

window.openTranscriptModal = function(guideId, trackNum) {
  const guide = findGuide(guideId);
  if (!guide) return;
  const track = guide.tracks.find(t => t.track_number === trackNum) || guide.tracks[0];
  if (!track) return;

  elements.modalBadge.textContent = `${guide.title} · Pista ${track.track_number}`;
  elements.modalTitle.textContent = track.title;

  elements.modalBody.innerHTML = `
    <!-- Location Instructions -->
    ${track.location ? `
      <div class="p-3.5 rounded-xl bg-slate-900 border border-slate-700/80">
        <h5 class="text-xs font-bold text-sky-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
          <i data-lucide="map-pin" class="w-3.5 h-3.5"></i> 📍 Dónde situarse
        </h5>
        <p class="text-xs sm:text-sm text-slate-300 leading-relaxed">${track.location}</p>
      </div>
    ` : ''}

    <!-- Visual Cues -->
    ${track.visual_cue ? `
      <div class="p-3.5 rounded-xl bg-slate-900 border border-slate-700/80">
        <h5 class="text-xs font-bold text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
          <i data-lucide="eye" class="w-3.5 h-3.5"></i> 👀 Dónde mirar
        </h5>
        <p class="text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line">${track.visual_cue}</p>
      </div>
    ` : ''}

    <!-- Spoken Narration -->
    <div class="p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/30">
      <h5 class="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <i data-lucide="mic" class="w-3.5 h-3.5"></i> 🎙️ Guion de la Audioguía (Voz del Narrador)
      </h5>
      <p class="text-xs sm:text-sm text-slate-100 leading-relaxed font-serif italic whitespace-pre-line">
        "${track.narration}"
      </p>
    </div>

    <!-- Anecdote & Fun Facts -->
    ${track.anecdote ? `
      <div class="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30">
        <h5 class="text-xs font-bold text-emerald-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
          <i data-lucide="sparkles" class="w-3.5 h-3.5"></i> ✨ Curiosidades & Anécdotas
        </h5>
        <p class="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">${track.anecdote}</p>
      </div>
    ` : ''}

    <!-- Transition to Next -->
    ${track.transition ? `
      <div class="p-3.5 rounded-xl bg-slate-900 border border-slate-700/80">
        <h5 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
          <i data-lucide="arrow-right-circle" class="w-3.5 h-3.5"></i> 🚶 Hacia la siguiente pista
        </h5>
        <p class="text-xs sm:text-sm text-slate-300 leading-relaxed">${track.transition}</p>
      </div>
    ` : ''}
  `;

  elements.modalPlayBtn.onclick = () => {
    playTrack(guideId, trackNum);
    closeTranscriptModal();
  };

  elements.modal.classList.remove('hidden');
  elements.modal.classList.add('flex');

  if (window.lucide) {
    window.lucide.createIcons();
  }
};

function closeTranscriptModal() {
  elements.modal.classList.add('hidden');
  elements.modal.classList.remove('flex');
}

// Start App on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  init();
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.log('SW registration skipped or failed:', err);
    });
  }
});
