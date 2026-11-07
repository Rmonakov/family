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
function getGenerationBands() {
  return window.GENERATION_BANDS || [];
}

function updateGenerationLabelsPosition(transform) {
  const svgEl = document.getElementById("treeSvgLayer");
  if (!svgEl || !transform) return;

  const { x, k } = transform;
  // Тримаємо основний підпис покоління біля лівого краю екрана як координатну шкалу
  const stickyX = Math.min(Math.max(54, (-x + 22) / k), 2480);

  svgEl.querySelectorAll(".gen-sticky-label").forEach(el => {
    el.setAttribute("x", String(stickyX));
  });

  // Ховаємо повторювані координатні мітки, якщо до них наблизився основний плаваючий підпис
  svgEl.querySelectorAll(".gen-repeat-label").forEach(el => {
    const anchorX = Number(el.getAttribute("data-anchor-x") || 0);
    const dist = Math.abs(stickyX + 140 - anchorX);
    el.style.opacity = dist < 340 ? "0" : "0.72";
  });
}

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

  // 1. Render subtle horizontal Generation Guide Bands & Guide Lines in SVG
  getGenerationBands().forEach((band, idx) => {
    const bandGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const bandTopY = band.y - 76;

    if (idx % 2 === 0) {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", "30");
      rect.setAttribute("y", String(bandTopY));
      rect.setAttribute("width", "2840");
      rect.setAttribute("height", "138");
      rect.setAttribute("rx", "24");
      rect.setAttribute("fill", "rgba(241, 245, 249, 0.55)");
      bandGroup.appendChild(rect);
    }

    // Тонка пунктирна лінія-орієнтир уздовж верхньої межі кожного покоління
    const guideLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    guideLine.setAttribute("x1", "48");
    guideLine.setAttribute("y1", String(bandTopY));
    guideLine.setAttribute("x2", "2850");
    guideLine.setAttribute("y2", String(bandTopY));
    guideLine.setAttribute("stroke", "rgba(148, 163, 184, 0.28)");
    guideLine.setAttribute("stroke-width", "1");
    guideLine.setAttribute("stroke-dasharray", "4 6");
    bandGroup.appendChild(guideLine);

    svgEl.appendChild(bandGroup);
  });

  // 2. Render Smooth Cubic Bezier Parent -> Child Connections (routed cleanly from Couple Marriage Nodes)
  const connsByChild = {};
  TREE_CONNECTIONS.forEach(conn => {
    if (!connsByChild[conn.to]) connsByChild[conn.to] = [];
    connsByChild[conn.to].push(conn);
  });

  const findCoupleLink = (id1, id2) => COUPLE_LINKS.find(
    c => (c.a === id1 && c.b === id2) || (c.a === id2 && c.b === id1)
  );

  const drawCurve = ({ x1, y1, x2, y2, branch, isDirect, isStep, dimmed }) => {
    const meta = BRANCH_META[branch] || BRANCH_META.gerlach;
    const midY = y1 + (y2 - y1) * 0.5;
    const pathData = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", meta.color);

    const isHighlightedDirect = isDirect && (currentBranchFilter === "direct" || currentBranchFilter === "all");
    path.setAttribute("stroke-width", isHighlightedDirect ? "3" : "2.2");
    path.setAttribute("stroke-opacity", dimmed ? "0.12" : (isStep ? "0.55" : "0.82"));

    if (isStep) {
      path.setAttribute("stroke-dasharray", "5 5");
    } else if (isDirect && currentBranchFilter === "direct") {
      path.setAttribute("class", "direct-line-animated");
    }

    svgEl.appendChild(path);
  };

  Object.entries(connsByChild).forEach(([targetId, conns]) => {
    const target = PEOPLE_DATA[targetId];
    if (!target) return;
    const x2 = target.x;
    const y2 = target.y - CARD_HEIGHT / 2 + 2;
    const matchTarget = isPersonMatchingFilter(target, currentBranchFilter);

    // Спеціальний випадок: Ксенія Петрівна (maria) — від спілки Герлах ✦ Марія та шлюбу Марія 💍 Петро
    if (targetId === "maria" && conns.length === 3) {
      const pGerlach = PEOPLE_DATA.gerlach;
      const pMaria = PEOPLE_DATA.ksenia;
      const pPyotr = PEOPLE_DATA.pyotr;
      if (pGerlach && pMaria) {
        const dimmedBlood = !(
          (isPersonMatchingFilter(pGerlach, currentBranchFilter) || isPersonMatchingFilter(pMaria, currentBranchFilter)) &&
          matchTarget
        );
        drawCurve({
          x1: (pGerlach.x + pMaria.x) / 2,
          y1: (pGerlach.y + pMaria.y) / 2 + 12,
          x2,
          y2,
          branch: "gerlach",
          isDirect: true,
          isStep: false,
          dimmed: dimmedBlood
        });
      }
      if (pMaria && pPyotr) {
        const dimmedStep = !(
          isPersonMatchingFilter(pPyotr, currentBranchFilter) && matchTarget
        );
        drawCurve({
          x1: (pMaria.x + pPyotr.x) / 2,
          y1: (pMaria.y + pPyotr.y) / 2 + 12,
          x2,
          y2,
          branch: "gerlach",
          isDirect: false,
          isStep: true,
          dimmed: dimmedStep
        });
      }
      return;
    }

    // Якщо у дитини двоє батьків, з'єднаних шлюбним вузлом 💍 — ведемо одну чисту лінію від значка 💍 (без перехрещень!)
    if (conns.length === 2) {
      const p1 = PEOPLE_DATA[conns[0].from];
      const p2 = PEOPLE_DATA[conns[1].from];
      const couple = p1 && p2 ? findCoupleLink(p1.id, p2.id) : null;
      if (couple && p1 && p2) {
        const matchParents = isPersonMatchingFilter(p1, currentBranchFilter) || isPersonMatchingFilter(p2, currentBranchFilter);
        const anyDirect = conns.some(c => c.isDirect);
        const chosenBranch = (conns.find(c => c.isDirect) || conns[0]).branch;
        drawCurve({
          x1: (p1.x + p2.x) / 2,
          y1: (p1.y + p2.y) / 2 + 12,
          x2,
          y2,
          branch: chosenBranch,
          isDirect: anyDirect,
          isStep: false,
          dimmed: !(matchParents && matchTarget)
        });
        return;
      }
    }

    // Одиночний предок -> дитина
    conns.forEach(conn => {
      const source = PEOPLE_DATA[conn.from];
      if (!source) return;
      const matchSource = isPersonMatchingFilter(source, currentBranchFilter);
      drawCurve({
        x1: source.x,
        y1: source.y + CARD_HEIGHT / 2 - 2,
        x2,
        y2,
        branch: conn.branch,
        isDirect: Boolean(conn.isDirect),
        isStep: conn.type === "step",
        dimmed: !(matchSource && matchTarget)
      });
    });
  });

  // 3. Render Couple horizontal connectors & badges on top of curve origins
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

  // 3.5. Render Generation Coordinate Labels above Bezier lines (13px above card tops)
  getGenerationBands().forEach(band => {
    const labelGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const labelY = band.y - 56; // 13px вище верхнього краю карток (band.y - 43)

    // Основний підпис покоління (плавно слідує за лівим краєм області перегляду)
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("class", "gen-sticky-label");
    text.setAttribute("x", "54");
    text.setAttribute("y", String(labelY));
    text.setAttribute("fill", "#64748b");
    text.setAttribute("font-size", "10.5");
    text.setAttribute("font-weight", "600");
    text.setAttribute("letter-spacing", "0.06em");
    text.setAttribute("style", "paint-order: stroke; stroke: rgba(248, 250, 252, 0.96); stroke-width: 5px; stroke-linejoin: round;");
    text.textContent = band.label.toUpperCase();
    labelGroup.appendChild(text);

    // Додаткові ненав'язливі координатні мітки у центральній та правій частинах дерева
    [
      { x: 1480, anchor: "middle", anchorCenter: 1480 },
      { x: 2840, anchor: "end", anchorCenter: 2760 }
    ].forEach(marker => {
      const repeatText = document.createElementNS("http://www.w3.org/2000/svg", "text");
      repeatText.setAttribute("class", "gen-repeat-label");
      repeatText.setAttribute("data-anchor-x", String(marker.anchorCenter));
      repeatText.setAttribute("x", String(marker.x));
      repeatText.setAttribute("y", String(labelY));
      repeatText.setAttribute("text-anchor", marker.anchor);
      repeatText.setAttribute("fill", "#94a3b8");
      repeatText.setAttribute("font-size", "10");
      repeatText.setAttribute("font-weight", "600");
      repeatText.setAttribute("letter-spacing", "0.05em");
      repeatText.setAttribute("style", "paint-order: stroke; stroke: rgba(248, 250, 252, 0.94); stroke-width: 4px; stroke-linejoin: round; transition: opacity 0.2s ease;");
      repeatText.textContent = band.shortLabel.toUpperCase();
      labelGroup.appendChild(repeatText);
    });

    svgEl.appendChild(labelGroup);
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
            ${person.photo && person.secondPhoto ? '<span title="2 архівні портрети (відкрийте картку)">📷×2</span>' : (person.photo ? '<span title="Є архівне фото">📷</span>' : '')}
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

  const viewportEl = document.getElementById("treeViewport");
  if (viewportEl && typeof d3 !== "undefined") {
    updateGenerationLabelsPosition(d3.zoomTransform(viewportEl));
  }
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
      updateGenerationLabelsPosition(event.transform);
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
  const secondPhotoEl = document.getElementById("sheetSecondPhoto");
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
  if (secondPhotoEl) {
    if (person.secondPhoto) {
      secondPhotoEl.src = person.secondPhoto;
      secondPhotoEl.alt = person.shortName;
      secondPhotoEl.classList.remove("hidden");
    } else {
      secondPhotoEl.classList.add("hidden");
    }
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

  // Document Preview & Hint to open Fullscreen Lightbox for itemized breakdown
  const docBox = document.getElementById("sheetDocBox");
  const docImg = document.getElementById("sheetDocImg");
  const legendHint = document.getElementById("sheetPhotoLegendHint");
  if (person.docImage) {
    docImg.src = person.docImage;
    docBox.classList.remove("hidden");
    const metaForDoc = findPhotoDetails(person.docImage, person);
    if (legendHint) {
      if (metaForDoc.photoLegend && metaForDoc.photoLegend.length > 0) {
        legendHint.classList.remove("hidden");
        legendHint.onclick = () => openLightbox(person.docImage, person.name, person.generation, person.facts);
      } else {
        legendHint.classList.add("hidden");
      }
    }
  } else {
    docBox.classList.add("hidden");
    if (legendHint) legendHint.classList.add("hidden");
  }

  // Extra Documents / Back Side / AI Reconstructed Portrait
  const extraBox = document.getElementById("sheetExtraDocsBox");
  if (extraBox) {
    extraBox.innerHTML = "";
    const extras = person.extraDocs || [];
    if (extras.length > 0) {
      extraBox.classList.remove("hidden");
      extras.forEach(ex => {
        const exMeta = findPhotoDetails(ex.img);
        const hasGroupLegend = exMeta.photoLegend && exMeta.photoLegend.length > 0;
        const card = document.createElement("div");
        card.className = "bg-slate-50 rounded-2xl p-3 border border-slate-200/80 space-y-2";
        card.innerHTML = `
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-semibold text-slate-800">${ex.title}</span>
            <button type="button" class="text-[11px] font-semibold text-amber-700 hover:text-amber-900 whitespace-nowrap">🔍 На весь екран</button>
          </div>
          <img src="${ex.img}" alt="${ex.title}" class="w-full max-h-52 object-contain rounded-xl bg-white border border-slate-200/70 p-1 cursor-pointer hover:opacity-95 transition" />
          <p class="text-[11.5px] text-slate-600 leading-relaxed">${ex.desc || ""}</p>
          ${hasGroupLegend ? `<div class="text-[11px] font-semibold text-amber-800 bg-amber-50/90 border border-amber-200/70 rounded-lg px-2.5 py-1 cursor-pointer">👥 Натисніть на фото, щоб побачити детальний опис хто де стоїть (${exMeta.photoLegend.length}) →</div>` : ""}
        `;
        const openEx = () => openLightbox(ex.img, ex.title, person.generation, ex.desc || person.facts);
        card.querySelector("button")?.addEventListener("click", openEx);
        card.querySelector("img")?.addEventListener("click", openEx);
        card.addEventListener("click", openEx);
        extraBox.appendChild(card);
      });
    } else {
      extraBox.classList.add("hidden");
    }
  }

  // Technical Photo & Back-Side Inscription Details (Separated at Bottom)
  const techBox = document.getElementById("sheetTechNotesBox");
  const techText = document.getElementById("sheetTechNotesText");
  if (techBox && techText) {
    if (person.techNotes) {
      techBox.classList.remove("hidden");
      techText.textContent = person.techNotes;
    } else {
      techBox.classList.add("hidden");
      techText.textContent = "";
    }
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
          <div class="sm:w-48 md:w-52 flex-shrink-0 flex flex-col items-center justify-center">
            <div data-lb-src="${ev.img}" data-lb-title="${ev.title}" data-lb-badge="${ev.year} • ${ev.place}" data-lb-desc="${ev.desc}" class="w-full h-48 sm:h-40 bg-white rounded-xl border border-slate-200/90 p-1.5 flex items-center justify-center cursor-pointer hover:border-amber-400 hover:shadow-md transition relative overflow-hidden group/img shadow-sm" title="Натисніть, щоб відкрити у повному розмірі">
              <img src="${ev.img}" alt="${ev.title}" class="max-w-full max-h-full object-contain rounded-lg group-hover/img:scale-[1.03] transition duration-200" loading="lazy" />
              <span class="absolute bottom-1.5 right-1.5 text-[10px] font-semibold bg-slate-900/75 text-white px-2 py-0.5 rounded-md opacity-90 group-hover/img:bg-amber-600 transition">🔍 Збільшити</span>
            </div>
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
    if (!loc.isAustralia && !loc.isDistantEast) {
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
    const zoomLvl = loc.isAustralia ? 6 : (locId === "loc_kyiv_barbusse" ? 15 : 8);
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
function findPhotoDetails(imgSrc, fallbackPerson = null) {
  const cleanSrc = String(imgSrc || "").split("?")[0];
  if (!cleanSrc) return { photoLegend: [], techNotes: "", desc: "" };

  const galMatch = ARCHIVE_GALLERY_ITEMS.find(item => String(item.img || "").split("?")[0] === cleanSrc);
  if (galMatch && ((galMatch.photoLegend && galMatch.photoLegend.length > 0) || galMatch.techNotes)) {
    return {
      photoLegend: galMatch.photoLegend || [],
      techNotes: galMatch.techNotes || "",
      desc: galMatch.desc || "",
      badge: galMatch.badge || "",
      title: galMatch.title || ""
    };
  }

  if (fallbackPerson && String(fallbackPerson.docImage || "").split("?")[0] === cleanSrc) {
    return {
      photoLegend: fallbackPerson.photoLegend || [],
      techNotes: fallbackPerson.techNotes || "",
      desc: fallbackPerson.facts || ""
    };
  }

  const personMatch = Object.values(PEOPLE_DATA).find(p => String(p.docImage || "").split("?")[0] === cleanSrc && p.photoLegend);
  if (personMatch) {
    return {
      photoLegend: personMatch.photoLegend || [],
      techNotes: personMatch.techNotes || "",
      desc: personMatch.facts || ""
    };
  }

  return {
    photoLegend: galMatch?.photoLegend || [],
    techNotes: galMatch?.techNotes || "",
    desc: galMatch?.desc || ""
  };
}

function renderArchiveGallery(categoryFilter = "all") {
  const grid = document.getElementById("archiveGalleryGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const items = ARCHIVE_GALLERY_ITEMS.filter(item => categoryFilter === "all" || item.category === categoryFilter);
  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "group bg-slate-50/80 hover:bg-white rounded-2xl border border-slate-200/90 hover:border-amber-400 overflow-hidden shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between";

    const hasGroupLegend = item.photoLegend && item.photoLegend.length > 0;
    const hintHtml = hasGroupLegend
      ? `<div class="mt-2.5 text-[11px] font-semibold text-amber-800 bg-amber-50/90 border border-amber-200/70 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
           <span>👥 Натисніть, щоб збільшити й побачити хто де стоїть (${item.photoLegend.length})</span>
           <span>🔍 →</span>
         </div>`
      : "";

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
          ${hintHtml}
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
  const captionEl = document.getElementById("lightboxCaption");
  if (!modal || !imgEl || !imgSrc) return;

  imgEl.src = imgSrc;

  const details = findPhotoDetails(imgSrc, PEOPLE_DATA[currentPersonId]);
  const rawBadge = details.badge || badge || "Архів";
  // Компактний бейдж в один рядок (щоб на мобільному шапка займала мінімум місця)
  const shortBadge = rawBadge.includes("•") ? rawBadge.split("•")[0].trim() : rawBadge;

  document.getElementById("lightboxTitle").textContent = details.title || title || "Архівний документ роду";
  document.getElementById("lightboxBadge").textContent = shortBadge;

  if (captionEl) {
    captionEl.classList.remove("hidden");
    const legendItems = details.photoLegend || [];
    const techNotes = details.techNotes || "";
    const mainDesc = details.desc || caption || "";

    let html = "";
    if (legendItems.length > 0) {
      html += `
        <div>
          <div class="text-[11px] font-bold uppercase tracking-wider text-amber-400 mb-1.5 flex items-center justify-between gap-2">
            <span>👥 Хто де стоїть і ким доводиться (збільшуйте фото пальцем або коліщатком):</span>
          </div>
          <ul class="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs text-slate-100 leading-snug">
            ${legendItems.map(item => `<li class="bg-slate-800/90 border border-slate-700/80 rounded-xl px-2.5 py-1.5">${item}</li>`).join("")}
          </ul>
        </div>
      `;
      if (mainDesc) {
        html += `<p class="text-[11.5px] text-slate-300 leading-relaxed pt-1">${mainDesc}</p>`;
      }
    } else if (mainDesc) {
      html += `<p class="text-xs text-slate-200 leading-relaxed">${mainDesc}</p>`;
    }

    if (techNotes) {
      html += `
        <div class="pt-2 border-t border-dashed border-slate-700/90 text-[11px] text-slate-400 leading-relaxed">
          <strong class="text-slate-300">🔬 Технічні деталі фото та написи на звороті:</strong> ${techNotes}
        </div>
      `;
    }

    captionEl.innerHTML = html;
  }

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

// ==================== INITIALIZATION & AES-256-GCM FAMILY ACCESS GATE ====================
const FAMILY_AUTH_STORAGE_KEY = "family_archive_session_v2";
let portalInitialized = false;
let unlockInProgress = false;

// Компактний SHA-256 (FIPS 180-4) для миттєвої перевірки солоного хешу перед запуском PBKDF2
function sha256HexFromBytes(bytes) {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  const rotr = (n, x) => (x >>> n) | (x << (32 - n));
  const l = bytes.length;
  const bitLenHi = Math.floor((l * 8) / 0x100000000);
  const bitLenLo = (l * 8) >>> 0;
  const padLen = ((l + 9 + 63) & ~63);
  const buf = new Uint8Array(padLen);
  buf.set(bytes);
  buf[l] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(padLen - 8, bitLenHi, false);
  dv.setUint32(padLen - 4, bitLenLo, false);

  let H0 = 0x6a09e667, H1 = 0xbb67ae85, H2 = 0x3c6ef372, H3 = 0xa54ff53a;
  let H4 = 0x510e527f, H5 = 0x9b05688c, H6 = 0x1f83d9ab, H7 = 0x5be0cd19;
  const W = new Uint32Array(64);

  for (let offset = 0; offset < padLen; offset += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, W[i - 15]) ^ rotr(18, W[i - 15]) ^ (W[i - 15] >>> 3);
      const s1 = rotr(17, W[i - 2]) ^ rotr(19, W[i - 2]) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let a = H0, b = H1, c = H2, d = H3, e = H4, f = H5, g = H6, h = H7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    H0 = (H0 + a) >>> 0; H1 = (H1 + b) >>> 0; H2 = (H2 + c) >>> 0; H3 = (H3 + d) >>> 0;
    H4 = (H4 + e) >>> 0; H5 = (H5 + f) >>> 0; H6 = (H6 + g) >>> 0; H7 = (H7 + h) >>> 0;
  }
  return [H0, H1, H2, H3, H4, H5, H6, H7].map(v => v.toString(16).padStart(8, "0")).join("");
}

function hexToBytes(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return arr;
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    arr[i] = bin.charCodeAt(i);
  }
  return arr;
}

function isFamilyCodeValid(rawInput) {
  const cleaned = String(rawInput || "").trim();
  if (cleaned.length !== 4) return false;
  const bundle = window.ENCRYPTED_FAMILY_ARCHIVE;
  if (!bundle || !bundle.vsalt || !bundle.vhash) return false;
  const saltBytes = hexToBytes(bundle.vsalt);
  const pinBytes = new TextEncoder().encode(cleaned);
  const combined = new Uint8Array(saltBytes.length + pinBytes.length);
  combined.set(saltBytes, 0);
  combined.set(pinBytes, saltBytes.length);
  return sha256HexFromBytes(combined) === bundle.vhash;
}

async function decryptAndLoadArchive(rawPin) {
  if (typeof window.PEOPLE_DATA !== "undefined") return true;
  const pin = String(rawPin || "").trim();
  if (!isFamilyCodeValid(pin)) return false;

  const bundle = window.ENCRYPTED_FAMILY_ARCHIVE;
  if (window.crypto && window.crypto.subtle && bundle && bundle.ct) {
    const salt = base64ToBytes(bundle.salt);
    const iv = base64ToBytes(bundle.iv);
    const ciphertext = base64ToBytes(bundle.ct);

    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(pin),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    const aesKey = await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: bundle.iter || 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      aesKey,
      ciphertext
    );

    const jsCode = new TextDecoder("utf-8").decode(decryptedBuffer);
    (new Function(jsCode))();
    return typeof window.PEOPLE_DATA !== "undefined";
  }

  // Fallback для локального відкриття file:// у браузерах без crypto.subtle
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "js/data.js";
    s.onload = () => resolve(typeof window.PEOPLE_DATA !== "undefined");
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

function applyPortalUiTexts() {
  const ui = window.PORTAL_UI_TEXTS;
  if (!ui) return;
  if (ui.pageTitle) document.title = ui.pageTitle;
  const mapText = {
    headerSurnamesSub: ui.headerSurnamesSub,
    headerGenSub: ui.headerGenSub,
    navMysteryLabel: ui.navMysteryLabel,
    branchLabelAll: ui.branchAll,
    branchLabelDirect: ui.branchDirect,
    branchLabelGerlach: ui.branchGerlach,
    branchLabelRudenko: ui.branchRudenko,
    branchLabelMonakov: ui.branchMonakov,
    timelineSubtitle: ui.timelineSubtitle,
    eraBtnEmpire: ui.eraEmpire,
    eraBtnPostwar: ui.eraPostwar,
    eraBtnKyiv: ui.eraKyiv,
    mapMainTitle: ui.mapTitle,
    mapFocusSemeyBtn: ui.mapBtnSemey,
    mapFocusSydneyBtn: ui.mapBtnSydney,
    mapBranchBtnGerlach: ui.mapBranchGerlach,
    mapBranchBtnRudenko: ui.mapBranchRudenko,
    mapBranchBtnMonakov: ui.mapBranchMonakov,
    galBtnDvinsk: ui.galDvinsk,
    galBtnRigaSydney: ui.galRigaSydney,
    galBtnRudenkoMonakov: ui.galRudenkoMonakov,
    mysteryMainTitle: ui.mysteryMainTitle,
    mysteryMainSubtitle: ui.mysteryMainSubtitle,
    mysteryCandTitle: ui.mysteryCandTitle,
    mysteryDirSubtitle: ui.mysteryDirSubtitle
  };
  Object.entries(mapText).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el && val) el.textContent = val;
  });
  const altBox = document.getElementById("mapAlternatingNamesBox");
  if (altBox && ui.mapAlternatingNamesHtml) {
    altBox.innerHTML = ui.mapAlternatingNamesHtml;
  }
}

async function unlockAndInitPortal(pinCode) {
  if (portalInitialized || unlockInProgress) return false;
  unlockInProgress = true;
  try {
    const ok = await decryptAndLoadArchive(pinCode);
    if (!ok) {
      unlockInProgress = false;
      return false;
    }
  } catch (err) {
    unlockInProgress = false;
    return false;
  }

  const gate = document.getElementById("familyAccessGate");
  if (gate) {
    gate.classList.add("hidden");
  }
  try {
    localStorage.setItem(FAMILY_AUTH_STORAGE_KEY, btoa(String(pinCode).trim()));
  } catch (e) {}

  portalInitialized = true;
  unlockInProgress = false;

  applyPortalUiTexts();

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
  return true;
}

window.addEventListener("DOMContentLoaded", async () => {
  if (typeof lucide !== "undefined") {
    try { lucide.createIcons(); } catch (e) {}
  }

  // Перевірка збереженого доступу або показ форми входу
  let savedPin = "";
  try {
    const rawSaved = localStorage.getItem(FAMILY_AUTH_STORAGE_KEY);
    if (rawSaved) savedPin = atob(rawSaved);
  } catch (e) {}

  if (savedPin && isFamilyCodeValid(savedPin)) {
    const unlocked = await unlockAndInitPortal(savedPin);
    if (unlocked) return;
  }

  const form = document.getElementById("familyAccessForm");
  const input = document.getElementById("familyAccessInput");
  const errEl = document.getElementById("familyAccessError");

  setTimeout(() => input?.focus(), 100);

  input?.addEventListener("input", async () => {
    errEl?.classList.add("hidden");
    const val = input.value;
    if (isFamilyCodeValid(val)) {
      input.blur();
      await unlockAndInitPortal(val);
    }
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const val = input?.value || "";
    if (isFamilyCodeValid(val)) {
      input?.blur();
      await unlockAndInitPortal(val);
    } else {
      errEl?.classList.remove("hidden");
      if (input) {
        input.value = "";
        input.focus();
      }
    }
  });

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
  document.getElementById("sheetSecondPhoto")?.addEventListener("click", () => {
    const p = PEOPLE_DATA[currentPersonId];
    if (p && p.secondPhoto) {
      openLightbox(p.secondPhoto, p.name, p.generation, p.facts);
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

  document.getElementById("mapFocusSemeyBtn")?.addEventListener("click", () => {
    if (currentMapBranch !== "all" && currentMapBranch !== "monakov") {
      initOrUpdateMap("all", { focusRegion: "all" });
    }
    focusMapOnLocation("loc_semipalatinsk");
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
  document.getElementById("lbToggleCaptionBtn")?.addEventListener("click", () => {
    const cap = document.getElementById("lightboxCaption");
    if (cap) cap.classList.toggle("hidden");
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
