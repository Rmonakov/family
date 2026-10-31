// Інтерактивний родинний портал (Apple/Editorial Light Style)
// D3.js v7 (Pinch-to-Zoom + SVG Cubic Bezier Tree) • Bottom Sheet Inspector • Visual Timeline • Leaflet Map • Panzoom Lightbox

let currentTab = "tree";
let currentPersonId = null;
let currentBranchFilter = "all";
let currentEraFilter = "all";
let currentMapBranch = "all";
let showMigrationRoutes = true;

let d3ZoomBehavior = null;
let d3SvgSelection = null;
let leafletMap = null;
let leafletMarkers = {};
let leafletRouteLines = [];
let lightboxPanzoom = null;

const CARD_WIDTH = 228;
const CARD_HEIGHT = 86;

// ==================== D3.JS + SVG + HTML HYBRID INTERACTIVE TREE ====================
const GENERATION_BANDS = [
  { gen: 7, y: 70, label: "VII покоління • поч. XIX ст. (~1805–1815)" },
  { gen: 6, y: 230, label: "VI покоління • сер. XIX ст. (Пруссія / Двінськ / Антонів)" },
  { gen: 5, y: 410, label: "V покоління • кін. XIX ст. (~1865–1886)" },
  { gen: 4, y: 600, label: "IV покоління • поч. XX ст. (1898–1910)" },
  { gen: 3, y: 790, label: "III покоління • Бабусі та дідусі (1926–1931)" },
  { gen: 2, y: 960, label: "II покоління • Батьки та сестри (1952–1962)" },
  { gen: 1, y: 1130, label: "I покоління • Сучасність (1985)" }
];

function isPersonMatchingFilter(person, filter) {
  if (filter === "all") return true;
  if (filter === "direct") return Boolean(person.isDirectGerlach);
  if (person.branch === "root") return true;
  if (filter === "rudenko" && person.id === "irina_rudenko") return true;
  return person.branch === filter;
}

function renderTreeGraph() {
  const svgEl = document.getElementById("treeSvgLayer");
  const nodesLayer = document.getElementById("treeNodesLayer");
  if (!svgEl || !nodesLayer) return;

  svgEl.innerHTML = "";
  nodesLayer.innerHTML = "";

  // 1. Render subtle horizontal Generation Guide Bands in SVG
  GENERATION_BANDS.forEach((band, idx) => {
    const bandGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    if (idx % 2 === 0) {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", "30");
      rect.setAttribute("y", String(band.y - 68));
      rect.setAttribute("width", "1740");
      rect.setAttribute("height", "136");
      rect.setAttribute("rx", "24");
      rect.setAttribute("fill", "rgba(241, 245, 249, 0.55)");
      bandGroup.appendChild(rect);
    }

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", "54");
    text.setAttribute("y", String(band.y - 44));
    text.setAttribute("fill", "#94a3b8");
    text.setAttribute("font-size", "11");
    text.setAttribute("font-weight", "600");
    text.setAttribute("letter-spacing", "0.06em");
    text.textContent = band.label.toUpperCase();
    bandGroup.appendChild(text);

    svgEl.appendChild(bandGroup);
  });

  // 2. Render Couple horizontal connectors & badges
  COUPLE_LINKS.forEach(cLink => {
    const pA = PEOPLE_DATA[cLink.a];
    const pB = PEOPLE_DATA[cLink.b];
    if (!pA || !pB) return;

    const matchA = isPersonMatchingFilter(pA, currentBranchFilter);
    const matchB = isPersonMatchingFilter(pB, currentBranchFilter);
    const dimmed = !(matchA && matchB);

    const meta = BRANCH_META[cLink.branch] || BRANCH_META.gerlach;
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    if (dimmed) g.setAttribute("class", "tree-link-dimmed");

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(pA.x));
    line.setAttribute("y1", String(pA.y));
    line.setAttribute("x2", String(pB.x));
    line.setAttribute("y2", String(pB.y));
    line.setAttribute("stroke", meta.border);
    line.setAttribute("stroke-width", "2.5");
    line.setAttribute("stroke-dasharray", cLink.badge === "✦" ? "5 4" : "none");
    g.appendChild(line);

    // Midpoint badge between couple cards
    const midX = (pA.x + pB.x) / 2;
    const midY = (pA.y + pB.y) / 2;

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(midX));
    circle.setAttribute("cy", String(midY));
    circle.setAttribute("r", "12");
    circle.setAttribute("fill", "#ffffff");
    circle.setAttribute("stroke", meta.border);
    circle.setAttribute("stroke-width", "2");
    g.appendChild(circle);

    const iconText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    iconText.setAttribute("x", String(midX));
    iconText.setAttribute("y", String(midY + 4));
    iconText.setAttribute("text-anchor", "middle");
    iconText.setAttribute("font-size", "11");
    iconText.textContent = cLink.badge;
    g.appendChild(iconText);

    svgEl.appendChild(g);
  });

  // 3. Render Smooth Cubic Bezier Parent -> Child Connections
  TREE_CONNECTIONS.forEach(conn => {
    const source = PEOPLE_DATA[conn.from];
    const target = PEOPLE_DATA[conn.to];
    if (!source || !target) return;

    const matchSource = isPersonMatchingFilter(source, currentBranchFilter);
    const matchTarget = isPersonMatchingFilter(target, currentBranchFilter);
    const dimmed = !(matchSource && matchTarget);

    const meta = BRANCH_META[conn.branch] || BRANCH_META.gerlach;
    const x1 = source.x;
    const y1 = source.y + CARD_HEIGHT / 2 - 2;
    const x2 = target.x;
    const y2 = target.y - CARD_HEIGHT / 2 + 2;
    const midY = y1 + (y2 - y1) * 0.52;

    const pathData = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", meta.color);

    const isHighlightedDirect = conn.isDirect && (currentBranchFilter === "direct" || currentBranchFilter === "all");
    path.setAttribute("stroke-width", isHighlightedDirect ? "3" : "2");
    path.setAttribute("stroke-opacity", dimmed ? "0.12" : (conn.type === "step" ? "0.55" : "0.78"));

    if (conn.type === "step") {
      path.setAttribute("stroke-dasharray", "5 5");
    } else if (conn.isDirect && currentBranchFilter === "direct") {
      path.setAttribute("class", "direct-line-animated");
    }

    svgEl.appendChild(path);
  });

  // 4. Render Crisp HTML Person Cards
  Object.values(PEOPLE_DATA).forEach(person => {
    const meta = BRANCH_META[person.branch] || BRANCH_META.gerlach;
    const matched = isPersonMatchingFilter(person, currentBranchFilter);
    const isSelected = currentPersonId === person.id;

    const card = document.createElement("div");
    card.setAttribute("data-person-node", person.id);
    card.className = [
      "tree-node-card pointer-events-auto absolute rounded-2xl bg-white p-2.5 cursor-pointer flex items-center gap-2.5 border-2 shadow-sm",
      isSelected ? "tree-node-selected" : "",
      !matched ? "tree-node-dimmed" : ""
    ].join(" ");

    card.style.left = `${person.x - CARD_WIDTH / 2}px`;
    card.style.top = `${person.y - CARD_HEIGHT / 2}px`;
    card.style.height = `${CARD_HEIGHT}px`;
    card.style.borderColor = isSelected ? "#d97706" : meta.border;

    if (person.branch === "root") {
      card.style.backgroundColor = "#0f172a";
      card.style.color = "#ffffff";
    }

    const initial = (person.shortName || person.name || "Р").trim().charAt(0);
    const avatarHtml = person.photo
      ? `<img src="${person.photo}" alt="${person.shortName}" class="w-12 h-14 object-cover object-center rounded-xl border border-slate-200 flex-shrink-0 bg-slate-100" loading="lazy" />`
      : `<div class="w-11 h-12 rounded-xl flex items-center justify-center font-serif-editorial font-bold text-base flex-shrink-0 border" style="background-color: ${meta.bgLight}; color: ${meta.badgeText}; border-color: ${meta.border}">${initial}</div>`;

    const isRoot = person.branch === "root";
    const nameColorClass = isRoot ? "text-white" : "text-slate-900";
    const subColorClass = isRoot ? "text-slate-300" : "text-slate-500";

    card.innerHTML = `
      ${avatarHtml}
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-1">
          <span class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style="background-color: ${meta.badgeBg}; color: ${meta.badgeText}">
            ${person.genRoman.replace(" покоління", " пок.")}
          </span>
          <div class="flex items-center gap-1 text-[10px]">
            ${person.photo ? '<span title="Є архівне фото">📷</span>' : ''}
            ${person.docImage ? '<span title="Є оцифрований документ">📜</span>' : ''}
          </div>
        </div>
        <div class="text-xs font-bold ${nameColorClass} leading-tight truncate mt-1" title="${person.name}">
          ${person.shortName}
        </div>
        <div class="text-[10.5px] ${subColorClass} leading-tight truncate mt-0.5">
          ${person.role}
        </div>
      </div>
    `;

    card.addEventListener("click", (e) => {
      e.stopPropagation();
      selectPerson(person.id, { center: true, openSheet: true });
    });

    nodesLayer.appendChild(card);
  });
}

function initInteractiveTree() {
  const viewportEl = document.getElementById("treeViewport");
  const zoomLayerEl = document.getElementById("treeZoomLayer");
  const zoomLabelEl = document.getElementById("treeZoomLabel");
  if (!viewportEl || !zoomLayerEl || typeof d3 === "undefined") return;

  d3SvgSelection = d3.select(viewportEl);

  d3ZoomBehavior = d3.zoom()
    .scaleExtent([0.28, 2.4])
    .clickDistance(8)
    .on("zoom", (event) => {
      const { x, y, k } = event.transform;
      zoomLayerEl.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${k})`;
      if (zoomLabelEl) {
        zoomLabelEl.textContent = `${Math.round(k * 100)}%`;
      }
    });

  d3SvgSelection.call(d3ZoomBehavior).on("dblclick.zoom", null);

  viewportEl.addEventListener("click", (e) => {
    if (e.target === viewportEl || e.target.id === "treeZoomLayer" || e.target.id === "treeSvgLayer") {
      closePersonSheet();
    }
  });

  document.getElementById("treeZoomInBtn")?.addEventListener("click", () => {
    d3SvgSelection.transition().duration(260).call(d3ZoomBehavior.scaleBy, 1.25);
  });
  document.getElementById("treeZoomOutBtn")?.addEventListener("click", () => {
    d3SvgSelection.transition().duration(260).call(d3ZoomBehavior.scaleBy, 0.8);
  });
  document.getElementById("treeFitBtn")?.addEventListener("click", () => {
    fitTreeToFilter(currentBranchFilter, true);
  });

  renderTreeGraph();
  requestAnimationFrame(() => {
    fitTreeToFilter("all", false);
  });
}

function fitTreeToFilter(filter = "all", animate = true) {
  const viewportEl = document.getElementById("treeViewport");
  if (!viewportEl || !d3SvgSelection || !d3ZoomBehavior) return;

  const matchingNodes = Object.values(PEOPLE_DATA).filter(p => isPersonMatchingFilter(p, filter));
  if (matchingNodes.length === 0) return;

  const minX = Math.min(...matchingNodes.map(p => p.x - CARD_WIDTH / 2)) - 40;
  const maxX = Math.max(...matchingNodes.map(p => p.x + CARD_WIDTH / 2)) + 40;
  const minY = Math.min(...matchingNodes.map(p => p.y - CARD_HEIGHT / 2)) - 70;
  const maxY = Math.max(...matchingNodes.map(p => p.y + CARD_HEIGHT / 2)) + 60;

  const boxWidth = Math.max(maxX - minX, 320);
  const boxHeight = Math.max(maxY - minY, 320);

  const vw = viewportEl.clientWidth || window.innerWidth;
  const vh = viewportEl.clientHeight || (window.innerHeight - 120);

  const scaleX = vw / boxWidth;
  const scaleY = vh / boxHeight;
  const k = Math.min(Math.max(Math.min(scaleX, scaleY) * 0.92, 0.32), 1.15);

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const tx = vw / 2 - centerX * k;
  const ty = vh / 2 - centerY * k + 14;

  const transform = d3.zoomIdentity.translate(tx, ty).scale(k);
  if (animate) {
    d3SvgSelection.transition().duration(550).ease(d3.easeCubicOut).call(d3ZoomBehavior.transform, transform);
  } else {
    d3SvgSelection.call(d3ZoomBehavior.transform, transform);
  }
}

function centerOnPerson(personId, animate = true) {
  const person = PEOPLE_DATA[personId];
  const viewportEl = document.getElementById("treeViewport");
  if (!person || !viewportEl || !d3SvgSelection || !d3ZoomBehavior) return;

  const vw = viewportEl.clientWidth || window.innerWidth;
  const vh = viewportEl.clientHeight || window.innerHeight;
  const isMobile = window.innerWidth < 768;

  const currentTransform = d3.zoomTransform(viewportEl);
  const targetK = Math.max(currentTransform.k, isMobile ? 0.88 : 0.95);

  const visibleCenterX = isMobile ? vw / 2 : (vw - 210) / 2;
  const visibleCenterY = isMobile ? vh * 0.28 : vh * 0.45;

  const tx = visibleCenterX - person.x * targetK;
  const ty = visibleCenterY - person.y * targetK;

  const transform = d3.zoomIdentity.translate(tx, ty).scale(targetK);
  if (animate) {
    d3SvgSelection.transition().duration(520).ease(d3.easeCubicOut).call(d3ZoomBehavior.transform, transform);
  } else {
    d3SvgSelection.call(d3ZoomBehavior.transform, transform);
  }
}

// ==================== PERSON SHEET (BOTTOM SHEET / SLIDE-OVER DRAWER) ====================
function getConnectedRelatives(personId) {
  const relatives = [];
  const seen = new Set();

  COUPLE_LINKS.forEach(c => {
    if (c.a === personId && PEOPLE_DATA[c.b] && !seen.has(c.b)) {
      seen.add(c.b);
      relatives.push({ id: c.b, rel: "Подружжя / Пара", person: PEOPLE_DATA[c.b] });
    } else if (c.b === personId && PEOPLE_DATA[c.a] && !seen.has(c.a)) {
      seen.add(c.a);
      relatives.push({ id: c.a, rel: "Подружжя / Пара", person: PEOPLE_DATA[c.a] });
    }
  });

  TREE_CONNECTIONS.forEach(conn => {
    if (conn.to === personId && PEOPLE_DATA[conn.from] && !seen.has(conn.from)) {
      seen.add(conn.from);
      relatives.push({ id: conn.from, rel: "Батьки / Предки", person: PEOPLE_DATA[conn.from] });
    } else if (conn.from === personId && PEOPLE_DATA[conn.to] && !seen.has(conn.to)) {
      seen.add(conn.to);
      relatives.push({ id: conn.to, rel: "Діти / Нащадки", person: PEOPLE_DATA[conn.to] });
    }
  });

  return relatives;
}

function selectPerson(personId, options = { center: true, openSheet: true }) {
  const person = PEOPLE_DATA[personId];
  if (!person) return;
  currentPersonId = personId;

  document.querySelectorAll("[data-person-node]").forEach(el => {
    const id = el.getAttribute("data-person-node");
    const p = PEOPLE_DATA[id];
    const meta = BRANCH_META[p?.branch] || BRANCH_META.gerlach;
    if (id === personId) {
      el.classList.add("tree-node-selected");
      el.style.borderColor = "#d97706";
    } else {
      el.classList.remove("tree-node-selected");
      el.style.borderColor = meta.border;
    }
  });

  const quickSelect = document.getElementById("quickPersonSelect");
  if (quickSelect && quickSelect.value !== personId) {
    quickSelect.value = personId;
  }

  const meta = BRANCH_META[person.branch] || BRANCH_META.gerlach;
  const genBadge = document.getElementById("sheetGenBadge");
  if (genBadge) {
    genBadge.textContent = person.genRoman;
    genBadge.style.backgroundColor = meta.badgeBg;
    genBadge.style.color = meta.badgeText;
  }

  document.getElementById("sheetPlaceBadge").textContent = person.place || "";
  document.getElementById("sheetName").textContent = person.name;
  document.getElementById("sheetFacts").textContent = person.facts;

  const photoEl = document.getElementById("sheetPhoto");
  const fallbackEl = document.getElementById("sheetAvatarFallback");
  if (person.photo) {
    photoEl.src = person.photo;
    photoEl.alt = person.shortName;
    photoEl.classList.remove("hidden");
    fallbackEl.classList.add("hidden");
  } else {
    photoEl.classList.add("hidden");
    fallbackEl.classList.remove("hidden");
    fallbackEl.textContent = (person.shortName || "Р").charAt(0);
    fallbackEl.style.backgroundColor = meta.bgLight;
    fallbackEl.style.color = meta.badgeText;
    fallbackEl.style.borderColor = meta.border;
  }

  // Show on Map button
  const showMapBtn = document.getElementById("sheetShowOnMapBtn");
  if (showMapBtn) {
    if (person.mapLocId) {
      showMapBtn.classList.remove("hidden");
      const locObj = MAP_LOCATIONS.find(l => l.id === person.mapLocId);
      const shortLocTitle = locObj ? locObj.title.replace(/^[0-9а-я]+\.\s*/i, "") : person.place;
      showMapBtn.innerHTML = `<span>🗺️ На карті: <strong>${shortLocTitle}</strong> →</span>`;
    } else {
      showMapBtn.classList.add("hidden");
    }
  }

  // Populate Relatives Chips
  const relatives = getConnectedRelatives(personId);
  const relBox = document.getElementById("sheetRelativesBox");
  const relList = document.getElementById("sheetRelativesList");
  if (relBox && relList) {
    relList.innerHTML = "";
    if (relatives.length > 0) {
      relBox.classList.remove("hidden");
      relatives.forEach(r => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-amber-50 hover:border-amber-300 border border-slate-200 text-xs text-slate-800 flex items-center gap-1.5 transition";
        chip.innerHTML = `<span class="text-[10px] font-semibold text-slate-400">${r.rel}:</span> <span class="font-semibold">${r.person.shortName}</span>`;
        chip.addEventListener("click", () => {
          selectPerson(r.id, { center: true, openSheet: true });
        });
        relList.appendChild(chip);
      });
    } else {
      relBox.classList.add("hidden");
    }
  }

  // Document Preview
  const docBox = document.getElementById("sheetDocBox");
  const docImg = document.getElementById("sheetDocImg");
  if (person.docImage) {
    docImg.src = person.docImage;
    docBox.classList.remove("hidden");
  } else {
    docBox.classList.add("hidden");
  }

  // Research Clues / Questions
  const cluesBox = document.getElementById("sheetCluesBox");
  const cluesList = document.getElementById("sheetCluesList");
  if (cluesBox && cluesList) {
    cluesList.innerHTML = "";
    const qs = person.questions || [];
    if (qs.length > 0) {
      cluesBox.classList.remove("hidden");
      qs.forEach(q => {
        const li = document.createElement("li");
        li.textContent = q;
        cluesList.appendChild(li);
      });
    } else {
      cluesBox.classList.add("hidden");
    }
  }

  if (options.openSheet) {
    openPersonSheet();
  }
  if (options.center) {
    centerOnPerson(personId, true);
  }
}

function openPersonSheet() {
  const sheet = document.getElementById("personSheet");
  const backdrop = document.getElementById("personSheetBackdrop");
  if (!sheet) return;

  sheet.classList.remove("translate-y-full", "md:translate-x-[450px]");
  if (backdrop && window.innerWidth < 768) {
    backdrop.classList.remove("hidden");
    requestAnimationFrame(() => backdrop.classList.remove("opacity-0"));
  }
}

function closePersonSheet() {
  const sheet = document.getElementById("personSheet");
  const backdrop = document.getElementById("personSheetBackdrop");
  if (!sheet) return;

  sheet.classList.add("translate-y-full", "md:translate-x-[450px]");
  if (backdrop) {
    backdrop.classList.add("opacity-0");
    setTimeout(() => backdrop.classList.add("hidden"), 200);
  }
}

// ==================== INTERACTIVE VISUAL TIMELINE ====================
function renderTimeline(eraFilter = "all") {
  currentEraFilter = eraFilter;
  const container = document.getElementById("timelineListContainer");
  if (!container) return;
  container.innerHTML = "";

  const events = TIMELINE_EVENTS.filter(ev => eraFilter === "all" || ev.era === eraFilter);

  events.forEach(ev => {
    const meta = BRANCH_META[ev.branch] || BRANCH_META.gerlach;
    const item = document.createElement("div");
    item.className = "relative group";

    item.innerHTML = `
      <div class="absolute -left-[31px] sm:-left-[39px] top-1.5 w-4 h-4 rounded-full border-2 border-white shadow-sm" style="background-color: ${meta.color}"></div>

      <div class="bg-slate-50/80 hover:bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 hover:border-slate-300 shadow-sm transition flex flex-col sm:flex-row gap-4 justify-between">
        <div class="space-y-1.5 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-bold px-2.5 py-0.5 rounded-lg" style="background-color: ${meta.badgeBg}; color: ${meta.badgeText}">
              ${ev.year}
            </span>
            <span class="text-xs font-medium text-slate-500 flex items-center gap-1">
              📍 ${ev.place}
            </span>
          </div>
          <h3 class="text-base font-bold text-slate-900 pt-0.5">${ev.title}</h3>
          <p class="text-xs sm:text-sm text-slate-600 leading-relaxed">${ev.desc}</p>
          ${ev.personId ? `
            <div class="pt-2">
              <button type="button" data-jump-person="${ev.personId}" class="text-xs font-semibold text-amber-700 hover:text-amber-900 inline-flex items-center gap-1 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 px-3 py-1.5 rounded-xl transition">
                <span>Показати на дереві роду</span>
                <span>→</span>
              </button>
            </div>
          ` : ''}
        </div>

        ${ev.img ? `
          <div class="sm:w-36 flex-shrink-0">
            <img src="${ev.img}" alt="${ev.title}" data-lb-src="${ev.img}" data-lb-title="${ev.title}" data-lb-badge="${ev.year} • ${ev.place}" data-lb-desc="${ev.desc}" class="w-full h-32 sm:h-28 object-cover object-center rounded-xl border border-slate-200 cursor-pointer hover:opacity-90 transition shadow-sm bg-white" loading="lazy" />
          </div>
        ` : ''}
      </div>
    `;

    container.appendChild(item);
  });

  container.querySelectorAll("[data-jump-person]").forEach(btn => {
    btn.addEventListener("click", () => {
      const pid = btn.getAttribute("data-jump-person");
      switchTab("tree");
      setTimeout(() => {
        selectPerson(pid, { center: true, openSheet: true });
      }, 120);
    });
  });

  container.querySelectorAll("[data-lb-src]").forEach(img => {
    img.addEventListener("click", () => {
      openLightbox(
        img.getAttribute("data-lb-src"),
        img.getAttribute("data-lb-title"),
        img.getAttribute("data-lb-badge"),
        img.getAttribute("data-lb-desc")
      );
    });
  });
}

// ==================== INTERACTIVE LEAFLET MAP ====================
function ensureLeafletMapCreated() {
  if (leafletMap || typeof L === "undefined") return;
  const mapContainer = document.getElementById("familyLeafletMap");
  if (!mapContainer) return;

  leafletMap = L.map("familyLeafletMap", {
    zoomControl: true,
    scrollWheelZoom: true
  }).setView([52.2, 26.5], 5);

  // 100% безкоштовний офіційний шар OpenStreetMap (без жодних API-ключів та з українськими назвами міст і сіл)
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(leafletMap);
}

function initOrUpdateMap(branchFilter = "all", options = { focusRegion: "europe" }) {
  currentMapBranch = branchFilter;
  const listEl = document.getElementById("mapLocationsList");
  if (!listEl) return;
  listEl.innerHTML = "";

  ensureLeafletMapCreated();

  const filtered = MAP_LOCATIONS.filter(loc => branchFilter === "all" || loc.branch === branchFilter);

  if (leafletMap && typeof L !== "undefined") {
    Object.values(leafletMarkers).forEach(m => leafletMap.removeLayer(m));
    leafletMarkers = {};
    leafletRouteLines.forEach(l => leafletMap.removeLayer(l));
    leafletRouteLines = [];
  }

  if (leafletMap && typeof L !== "undefined" && showMigrationRoutes) {
    MIGRATION_ROUTES.filter(r => branchFilter === "all" || r.branch === branchFilter).forEach(route => {
      const poly = L.polyline(route.points, {
        color: route.color,
        weight: 3.5,
        opacity: 0.82,
        dashArray: "8, 6"
      }).addTo(leafletMap);
      poly.bindPopup(`<strong>${route.label}</strong>`);
      leafletRouteLines.push(poly);
    });
  }

  const boundsEurope = [];
  const boundsAll = [];

  filtered.forEach(loc => {
    boundsAll.push(loc.coords);
    if (!loc.isAustralia) {
      boundsEurope.push(loc.coords);
    }

    if (leafletMap && typeof L !== "undefined") {
      const marker = L.circleMarker(loc.coords, {
        radius: 9,
        fillColor: loc.color,
        color: "#ffffff",
        weight: 2.5,
        opacity: 1,
        fillOpacity: 0.95
      }).addTo(leafletMap);

      const popupHtml = `
        <div style="min-width:210px;max-width:260px;font-family:Inter,sans-serif;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:${loc.color};">${loc.badge} • ${loc.period}</div>
          <div style="font-size:13px;font-weight:700;color:#0f172a;margin-top:2px;">${loc.title}</div>
          <p style="font-size:11.5px;color:#475569;margin-top:5px;line-height:1.45;">${loc.desc}</p>
        </div>
      `;
      marker.bindPopup(popupHtml);
      leafletMarkers[loc.id] = marker;
    }

    const card = document.createElement("div");
    card.setAttribute("data-map-loc-card", loc.id);
    card.className = "p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/70 hover:bg-white hover:border-amber-400 cursor-pointer transition shadow-sm";
    card.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <span class="text-[10.5px] font-bold px-2 py-0.5 rounded-md text-white" style="background-color: ${loc.color}">${loc.badge}</span>
        <span class="text-[11px] font-semibold text-slate-400">${loc.period}</span>
      </div>
      <h4 class="font-bold text-xs sm:text-sm text-slate-900 mt-1.5">${loc.title}</h4>
      <p class="text-xs text-slate-600 mt-1 leading-relaxed">${loc.desc}</p>
      ${loc.personId ? `
        <div class="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between">
          <span class="text-[11px] font-medium text-sky-700">Натисніть картку, щоб наблизити на карті</span>
          <button type="button" data-map-jump-person="${loc.personId}" class="text-[11px] font-bold text-amber-700 hover:text-amber-900 underline">
            У дереві →
          </button>
        </div>
      ` : ''}
    `;

    card.addEventListener("click", (e) => {
      if (e.target.closest("[data-map-jump-person]")) return;
      focusMapOnLocation(loc.id);
    });

    listEl.appendChild(card);
  });

  listEl.querySelectorAll("[data-map-jump-person]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const pid = btn.getAttribute("data-map-jump-person");
      switchTab("tree");
      setTimeout(() => {
        selectPerson(pid, { center: true, openSheet: true });
      }, 120);
    });
  });

  if (leafletMap) {
    setTimeout(() => {
      leafletMap.invalidateSize();
      const targetBounds = (options.focusRegion === "europe" && boundsEurope.length > 0) ? boundsEurope : boundsAll;
      if (targetBounds.length === 1) {
        leafletMap.setView(targetBounds[0], 8);
      } else if (targetBounds.length > 1) {
        leafletMap.fitBounds(targetBounds, { padding: [32, 32], maxZoom: 8 });
      }
    }, 100);
  }
}

function focusMapOnLocation(locId) {
  const loc = MAP_LOCATIONS.find(l => l.id === locId);
  if (!loc) return;

  ensureLeafletMapCreated();
  if (!leafletMap) return;

  setTimeout(() => {
    leafletMap.invalidateSize();
    const zoomLvl = loc.isAustralia ? 6 : 8;
    leafletMap.flyTo(loc.coords, zoomLvl, { duration: 0.85 });
    const marker = leafletMarkers[locId];
    if (marker) {
      setTimeout(() => marker.openPopup(), 450);
    }
  }, 120);

  // Highlight card in the side list
  const cardEl = document.querySelector(`[data-map-loc-card="${locId}"]`);
  if (cardEl) {
    document.querySelectorAll("[data-map-loc-card]").forEach(c => c.classList.remove("ring-2", "ring-amber-500", "bg-white"));
    cardEl.classList.add("ring-2", "ring-amber-500", "bg-white");
    cardEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

// ==================== ARCHIVE GALLERY & ZOOMABLE LIGHTBOX ====================
function renderArchiveGallery(categoryFilter = "all") {
  const grid = document.getElementById("archiveGalleryGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const items = ARCHIVE_GALLERY_ITEMS.filter(item => categoryFilter === "all" || item.category === categoryFilter);
  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "group bg-slate-50/80 hover:bg-white rounded-2xl border border-slate-200/90 hover:border-amber-400 overflow-hidden shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between";
    card.innerHTML = `
      <div>
        <div class="h-52 bg-slate-900 flex items-center justify-center p-2 overflow-hidden relative">
          <img src="${item.img}" alt="${item.title}" class="max-h-full max-w-full object-contain group-hover:scale-105 transition duration-300" loading="lazy" />
          <span class="absolute top-2.5 left-2.5 text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-slate-950 px-2 py-0.5 rounded-md shadow">${item.badge}</span>
          <span class="absolute bottom-2 right-2 text-[11px] font-semibold bg-slate-900/80 text-white px-2.5 py-1 rounded-lg opacity-90 group-hover:bg-amber-600 transition">🔍 Збільшити</span>
        </div>
        <div class="p-4">
          <h3 class="font-bold text-sm text-slate-900 leading-snug">${item.title}</h3>
          <p class="text-xs text-slate-600 mt-1.5 leading-relaxed">${item.desc}</p>
        </div>
      </div>
    `;
    card.addEventListener("click", () => {
      openLightbox(item.img, item.title, item.badge, item.desc);
    });
    grid.appendChild(card);
  });
}

function openLightbox(imgSrc, title, badge, caption) {
  const modal = document.getElementById("docLightboxModal");
  const imgEl = document.getElementById("lightboxImg");
  if (!modal || !imgEl || !imgSrc) return;

  imgEl.src = imgSrc;
  document.getElementById("lightboxTitle").textContent = title || "Архівний документ роду";
  document.getElementById("lightboxBadge").textContent = badge || "Оцифрований архів";
  document.getElementById("lightboxCaption").textContent = caption || "";
  modal.classList.remove("hidden");

  if (lightboxPanzoom) {
    lightboxPanzoom.reset();
  } else if (typeof Panzoom !== "undefined") {
    lightboxPanzoom = Panzoom(imgEl, {
      maxScale: 4,
      minScale: 0.8,
      contain: false
    });
    document.getElementById("lightboxViewport")?.addEventListener("wheel", lightboxPanzoom.zoomWithWheel);
  }
}

function closeLightbox() {
  const modal = document.getElementById("docLightboxModal");
  if (modal) modal.classList.add("hidden");
}

// ==================== PRUSSIAN LEGEND & RESEARCH DIRECTIONS ====================
function renderMysteryAndDirections() {
  const stepsGrid = document.getElementById("gerlachStepsGrid");
  if (stepsGrid) {
    stepsGrid.innerHTML = "";
    GERLACH_STORY_STEPS.forEach(s => {
      const card = document.createElement("div");
      card.className = "bg-amber-50/60 border border-amber-200/80 rounded-2xl p-4";
      card.innerHTML = `
        <div class="text-[11px] font-bold uppercase text-amber-800">${s.step}</div>
        <div class="font-bold text-sm sm:text-base text-slate-900 mt-1">${s.title}</div>
        <p class="text-xs text-slate-600 mt-1.5 leading-relaxed">${s.desc}</p>
      `;
      stepsGrid.appendChild(card);
    });
  }

  const candGrid = document.getElementById("gerlachCandidatesGrid");
  if (candGrid) {
    candGrid.innerHTML = "";
    GERLACH_CANDIDATES.forEach(c => {
      const card = document.createElement("div");
      card.className = "border border-slate-200/90 rounded-2xl p-4 bg-slate-50/60";
      card.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <span class="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900">${c.badge}</span>
          <span class="text-xs font-semibold text-slate-400">${c.years}</span>
        </div>
        <h4 class="font-bold text-sm sm:text-base text-slate-900 mt-1.5">${c.name}</h4>
        <p class="text-xs text-slate-600 mt-1 leading-relaxed">${c.desc}</p>
      `;
      candGrid.appendChild(card);
    });
  }

  const dirContainer = document.getElementById("researchDirectionsContainer");
  if (dirContainer && typeof RESEARCH_DIRECTIONS !== "undefined") {
    dirContainer.innerHTML = "";
    RESEARCH_DIRECTIONS.forEach(d => {
      const box = document.createElement("div");
      box.className = "bg-slate-50/80 border border-slate-200/90 rounded-2xl p-4 space-y-1.5";
      box.innerHTML = `
        <span class="text-[10.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-sky-100 text-sky-900 inline-block">${d.badge}</span>
        <h4 class="font-bold text-sm text-slate-900 pt-0.5">${d.title}</h4>
        <p class="text-xs text-slate-600 leading-relaxed">${d.desc}</p>
      `;
      dirContainer.appendChild(box);
    });
  }
}

// ==================== TAB NAVIGATION ====================
function switchTab(tabName) {
  currentTab = tabName;
  const views = ["tree", "timeline", "map", "archive", "mystery"];

  views.forEach(v => {
    const section = document.getElementById(`view-${v}`);
    if (!section) return;
    if (v === tabName) {
      section.classList.remove("hidden");
    } else {
      section.classList.add("hidden");
    }
  });

  document.querySelectorAll(".nav-tab-btn").forEach(btn => {
    const t = btn.getAttribute("data-nav-tab");
    if (t === tabName) {
      btn.className = "nav-tab-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-900 shadow-sm transition flex items-center gap-1.5";
    } else {
      btn.className = "nav-tab-btn px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 transition flex items-center gap-1.5";
    }
  });

  document.querySelectorAll(".nav-tab-mobile").forEach(btn => {
    const t = btn.getAttribute("data-nav-tab");
    if (t === tabName) {
      btn.className = "nav-tab-mobile flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-amber-600 font-semibold transition";
    } else {
      btn.className = "nav-tab-mobile flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-slate-500 font-medium transition";
    }
  });

  if (tabName === "map") {
    initOrUpdateMap(currentMapBranch, { focusRegion: "europe" });
  } else if (tabName === "tree") {
    requestAnimationFrame(() => {
      if (!currentPersonId) fitTreeToFilter(currentBranchFilter, false);
    });
  }
}

// ==================== INITIALIZATION ====================
window.addEventListener("DOMContentLoaded", () => {
  if (typeof lucide !== "undefined") {
    try { lucide.createIcons(); } catch (e) {}
  }

  const quickSelect = document.getElementById("quickPersonSelect");
  if (quickSelect) {
    Object.values(PEOPLE_DATA)
      .sort((a, b) => a.gen - b.gen)
      .forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = `${p.genRoman.replace(" покоління", " пок.")} • ${p.shortName}`;
        quickSelect.appendChild(opt);
      });

    quickSelect.addEventListener("change", () => {
      const val = quickSelect.value;
      if (val) {
        if (currentTab !== "tree") switchTab("tree");
        selectPerson(val, { center: true, openSheet: true });
      }
    });
  }

  initInteractiveTree();
  renderTimeline("all");
  renderArchiveGallery("all");
  renderMysteryAndDirections();

  // Tab Listeners
  document.querySelectorAll("[data-nav-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      switchTab(btn.getAttribute("data-nav-tab"));
    });
  });

  // Branch Filter Pills on Tree Canvas
  document.querySelectorAll("[data-branch-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      currentBranchFilter = btn.getAttribute("data-branch-filter");
      document.querySelectorAll("[data-branch-filter]").forEach(b => {
        if (b.getAttribute("data-branch-filter") === currentBranchFilter) {
          b.className = "branch-pill px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 text-white shadow-sm whitespace-nowrap transition flex items-center gap-1.5";
        } else {
          b.className = "branch-pill px-3 py-1.5 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap transition flex items-center gap-1.5";
        }
      });
      renderTreeGraph();
      fitTreeToFilter(currentBranchFilter, true);
    });
  });

  // Person Sheet Controls
  document.getElementById("closePersonSheetBtn")?.addEventListener("click", closePersonSheet);
  document.getElementById("personSheetBackdrop")?.addEventListener("click", closePersonSheet);
  document.getElementById("personSheetGrabber")?.addEventListener("click", closePersonSheet);

  // Person Sheet -> Show on Map button
  document.getElementById("sheetShowOnMapBtn")?.addEventListener("click", () => {
    const p = PEOPLE_DATA[currentPersonId];
    if (!p || !p.mapLocId) return;
    closePersonSheet();
    switchTab("map");
    initOrUpdateMap("all", { focusRegion: p.mapLocId === "loc_sydney" ? "all" : "europe" });
    focusMapOnLocation(p.mapLocId);
  });

  // Open Lightbox from Person Sheet
  const openLbFromSheet = () => {
    const p = PEOPLE_DATA[currentPersonId];
    if (p && p.docImage) {
      openLightbox(p.docImage, p.name, p.generation, p.facts);
    }
  };
  document.getElementById("sheetDocImg")?.addEventListener("click", openLbFromSheet);
  document.getElementById("sheetOpenLightboxBtn")?.addEventListener("click", openLbFromSheet);
  document.getElementById("sheetPhoto")?.addEventListener("click", () => {
    const p = PEOPLE_DATA[currentPersonId];
    if (p && p.photo) {
      openLightbox(p.photo, p.name, p.generation, p.facts);
    }
  });

  // Timeline Era Filter Pills
  document.querySelectorAll("[data-era-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      const era = btn.getAttribute("data-era-filter");
      document.querySelectorAll("[data-era-filter]").forEach(b => {
        if (b.getAttribute("data-era-filter") === era) {
          b.className = "era-pill px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 text-white whitespace-nowrap transition";
        } else {
          b.className = "era-pill px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 whitespace-nowrap transition";
        }
      });
      renderTimeline(era);
    });
  });

  // Map Filter Buttons
  document.querySelectorAll("[data-map-branch]").forEach(btn => {
    btn.addEventListener("click", () => {
      const br = btn.getAttribute("data-map-branch");
      document.querySelectorAll("[data-map-branch]").forEach(b => {
        if (b.getAttribute("data-map-branch") === br) {
          b.className = "map-branch-btn px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 text-white whitespace-nowrap transition";
        } else {
          b.className = "map-branch-btn px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 whitespace-nowrap transition";
        }
      });
      initOrUpdateMap(br, { focusRegion: "europe" });
    });
  });

  document.getElementById("mapFocusEuropeBtn")?.addEventListener("click", () => {
    initOrUpdateMap(currentMapBranch, { focusRegion: "europe" });
  });

  document.getElementById("mapFocusSydneyBtn")?.addEventListener("click", () => {
    if (currentMapBranch !== "all" && currentMapBranch !== "gerlach") {
      initOrUpdateMap("all", { focusRegion: "all" });
    }
    focusMapOnLocation("loc_sydney");
  });

  document.getElementById("mapToggleRoutes")?.addEventListener("click", (e) => {
    showMigrationRoutes = !showMigrationRoutes;
    e.currentTarget.textContent = showMigrationRoutes ? "✨ Маршрути: УВІМК." : "Маршрути: ВИМК.";
    initOrUpdateMap(currentMapBranch, { focusRegion: "europe" });
  });

  // Archive Gallery Filter Buttons
  document.querySelectorAll("[data-gal-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      const cat = btn.getAttribute("data-gal-filter");
      document.querySelectorAll("[data-gal-filter]").forEach(b => {
        if (b.getAttribute("data-gal-filter") === cat) {
          b.className = "gal-filter-btn px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 text-white whitespace-nowrap transition";
        } else {
          b.className = "gal-filter-btn px-3.5 py-1.5 rounded-xl text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 whitespace-nowrap transition";
        }
      });
      renderArchiveGallery(cat);
    });
  });

  // Lightbox Controls
  document.getElementById("lightboxCloseBtn")?.addEventListener("click", closeLightbox);
  document.getElementById("lbZoomResetBtn")?.addEventListener("click", () => {
    if (lightboxPanzoom) lightboxPanzoom.reset();
  });
  document.getElementById("docLightboxModal")?.addEventListener("click", (e) => {
    if (e.target.id === "docLightboxModal" || e.target.id === "lightboxViewport") {
      closeLightbox();
    }
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeLightbox();
      closePersonSheet();
    }
  });

  window.addEventListener("resize", () => {
    if (currentTab === "tree" && !currentPersonId) {
      fitTreeToFilter(currentBranchFilter, false);
    }
  });
});
