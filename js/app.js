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

let activeCryptoKey = null;
const decryptedBlobUrlCache = new Map();
const pendingBlobPromises = new Map();

const CARD_WIDTH = 228;
const CARD_HEIGHT = 86;

// ==================== HTML ESCAPING & SANITIZATION (DOM-XSS PROTECTION) ====================
function escapeHtml(val) {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeHtml(val) {
  const escaped = escapeHtml(val);
  return escaped
    .replace(/&lt;strong&gt;/gi, "<strong>")
    .replace(/&lt;\/strong&gt;/gi, "</strong>")
    .replace(/&lt;em&gt;/gi, "<em>")
    .replace(/&lt;\/em&gt;/gi, "</em>")
    .replace(/&lt;br\s*\/?&gt;/gi, "<br />")
    .replace(
      /&lt;strong\s+class=&quot;([a-zA-Z0-9_\-\s]+)&quot;&gt;/gi,
      '<strong class="$1">'
    );
}

// ==================== ENCRYPTED MEDIA ASSET LOADER (AES-256-GCM BLOB CACHE) ====================
const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function base64ToBytes(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    arr[i] = bin.charCodeAt(i);
  }
  return arr;
}

async function resolveEncryptedAssetUrl(rawPath) {
  const cleanPath = String(rawPath || "").split("?")[0];
  if (!cleanPath) return "";
  if (decryptedBlobUrlCache.has(cleanPath)) {
    return decryptedBlobUrlCache.get(cleanPath);
  }
  if (pendingBlobPromises.has(cleanPath)) {
    return pendingBlobPromises.get(cleanPath);
  }

  const manifest = window.ASSET_MANIFEST || {};
  const entry = manifest[cleanPath];
  if (!entry || !entry.bin || !entry.iv || !activeCryptoKey) {
    return "";
  }

  const promise = (async () => {
    try {
      const resp = await fetch(entry.bin);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const cipherBuffer = await resp.arrayBuffer();
      const ivBytes = base64ToBytes(entry.iv);
      const plainBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivBytes },
        activeCryptoKey,
        cipherBuffer
      );
      const blob = new Blob([plainBuffer], { type: entry.mime || "image/jpeg" });
      const blobUrl = URL.createObjectURL(blob);
      decryptedBlobUrlCache.set(cleanPath, blobUrl);
      return blobUrl;
    } catch (e) {
      return "";
    } finally {
      pendingBlobPromises.delete(cleanPath);
    }
  })();

  pendingBlobPromises.set(cleanPath, promise);
  return promise;
}

function setEncryptedImgSrc(imgEl, rawPath) {
  if (!imgEl) return;
  const cleanPath = String(rawPath || "").split("?")[0];
  if (!cleanPath) {
    imgEl.removeAttribute("src");
    return;
  }
  imgEl.setAttribute("data-enc-src", cleanPath);
  if (decryptedBlobUrlCache.has(cleanPath)) {
    imgEl.src = decryptedBlobUrlCache.get(cleanPath);
    return;
  }
  imgEl.src = TRANSPARENT_PIXEL;
  resolveEncryptedAssetUrl(cleanPath).then(blobUrl => {
    if (blobUrl && imgEl.getAttribute("data-enc-src") === cleanPath) {
      imgEl.src = blobUrl;
    }
  });
}

function hydrateEncryptedImages(container) {
  if (!container) return;
  container.querySelectorAll("img[data-enc-src]").forEach(imgEl => {
    const path = imgEl.getAttribute("data-enc-src");
    if (path) setEncryptedImgSrc(imgEl, path);
  });
}

// ==================== D3.JS + SVG + HTML HYBRID INTERACTIVE TREE ====================
function getGenerationBands() {
  return window.GENERATION_BANDS || [];
}

function updateGenerationLabelsPosition(transform) {
  const svgEl = document.getElementById("treeSvgLayer");
  if (!svgEl || !transform) return;

  const { x, k } = transform;
  const stickyX = Math.min(Math.max(54, (-x + 22) / k), 2480);

  svgEl.querySelectorAll(".gen-sticky-label").forEach(el => {
    el.setAttribute("x", String(stickyX));
  });

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

  // 2. Render Smooth Cubic Bezier Parent -> Child Connections
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

    // Special case: node with 3 incoming step connections (oral tradition + indirect record)
    if (targetId === "maria" && conns.length === 3) {
      const pGerlach = PEOPLE_DATA.gerlach;
      const pMaria = PEOPLE_DATA.ksenia;
      const pPyotr = PEOPLE_DATA.pyotr;
      if (pGerlach && pMaria) {
        const dimmedTradition = !(
          (isPersonMatchingFilter(pGerlach, currentBranchFilter) || isPersonMatchingFilter(pMaria, currentBranchFilter)) &&
          matchTarget
        );
        drawCurve({
          x1: (pGerlach.x + pMaria.x) / 2,
          y1: (pGerlach.y + pMaria.y) / 2 + 12,
          x2,
          y2,
          branch: "gerlach",
          isDirect: false,
          isStep: true,
          dimmed: dimmedTradition
        });
      }
      if (pMaria && pPyotr) {
        const dimmedParents = !(
          (isPersonMatchingFilter(pMaria, currentBranchFilter) || isPersonMatchingFilter(pPyotr, currentBranchFilter)) &&
          matchTarget
        );
        drawCurve({
          x1: (pMaria.x + pPyotr.x) / 2,
          y1: (pMaria.y + pPyotr.y) / 2 + 12,
          x2,
          y2,
          branch: "gerlach",
          isDirect: false,
          isStep: true,
          dimmed: dimmedParents
        });
      }
      return;
    }

    // Two parents connected by a marriage node
    if (conns.length === 2) {
      const p1 = PEOPLE_DATA[conns[0].from];
      const p2 = PEOPLE_DATA[conns[1].from];
      const couple = p1 && p2 ? findCoupleLink(p1.id, p2.id) : null;
      if (couple && p1 && p2) {
        const match1 = isPersonMatchingFilter(p1, currentBranchFilter);
        const match2 = isPersonMatchingFilter(p2, currentBranchFilter);
        const matchParents = match1 || match2;
        const anyDirect = conns.some(c => c.isDirect);
        let chosenBranch = (conns.find(c => c.isDirect) || conns[0]).branch;
        if (currentBranchFilter !== "all" && currentBranchFilter !== "direct" && matchParents && matchTarget) {
          chosenBranch = currentBranchFilter;
        }
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

    // Single parent -> child
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
    const anyMatch = matchA || matchB;

    const defaultMeta = BRANCH_META[cLink.branch] || BRANCH_META.gerlach;
    const activeMeta = (currentBranchFilter !== "all" && currentBranchFilter !== "direct" && BRANCH_META[currentBranchFilter])
      ? BRANCH_META[currentBranchFilter]
      : defaultMeta;

    const midX = (pA.x + pB.x) / 2;
    const midY = (pA.y + pB.y) / 2;

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");

    const lineA = document.createElementNS("http://www.w3.org/2000/svg", "line");
    lineA.setAttribute("x1", String(pA.x));
    lineA.setAttribute("y1", String(pA.y));
    lineA.setAttribute("x2", String(midX));
    lineA.setAttribute("y2", String(midY));
    lineA.setAttribute("stroke", (matchA && !matchB) ? activeMeta.border : defaultMeta.border);
    lineA.setAttribute("stroke-width", "2.5");
    lineA.setAttribute("stroke-opacity", matchA ? "1" : "0.12");
    lineA.setAttribute("stroke-dasharray", cLink.badge === "✦" ? "5 4" : "none");
    g.appendChild(lineA);

    const lineB = document.createElementNS("http://www.w3.org/2000/svg", "line");
    lineB.setAttribute("x1", String(midX));
    lineB.setAttribute("y1", String(midY));
    lineB.setAttribute("x2", String(pB.x));
    lineB.setAttribute("y2", String(pB.y));
    lineB.setAttribute("stroke", (matchB && !matchA) ? activeMeta.border : defaultMeta.border);
    lineB.setAttribute("stroke-width", "2.5");
    lineB.setAttribute("stroke-opacity", matchB ? "1" : "0.12");
    lineB.setAttribute("stroke-dasharray", cLink.badge === "✦" ? "5 4" : "none");
    g.appendChild(lineB);

    const badgeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    if (!anyMatch) badgeGroup.setAttribute("class", "tree-link-dimmed");

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(midX));
    circle.setAttribute("cy", String(midY));
    circle.setAttribute("r", "12");
    circle.setAttribute("fill", "#ffffff");
    circle.setAttribute("stroke", (matchA !== matchB) ? activeMeta.border : defaultMeta.border);
    circle.setAttribute("stroke-width", "2");
    badgeGroup.appendChild(circle);

    const iconText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    iconText.setAttribute("x", String(midX));
    iconText.setAttribute("y", String(midY + 4));
    iconText.setAttribute("text-anchor", "middle");
    iconText.setAttribute("font-size", "11");
    iconText.textContent = cLink.badge;
    badgeGroup.appendChild(iconText);

    g.appendChild(badgeGroup);
    svgEl.appendChild(g);
  });

  // 3.5. Render Generation Coordinate Labels above Bezier lines
  getGenerationBands().forEach(band => {
    const labelGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const labelY = band.y - 56;

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
    const effectiveBranch = (currentBranchFilter === "rudenko" && person.id === "irina_rudenko")
      ? "rudenko"
      : person.branch;
    const meta = BRANCH_META[effectiveBranch] || BRANCH_META.gerlach;
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

    const initial = escapeHtml((person.shortName || person.name || "Р").trim().charAt(0));
    const cleanPhoto = person.photo ? String(person.photo).split("?")[0] : "";
    const avatarHtml = cleanPhoto
      ? `<img data-enc-src="${escapeHtml(cleanPhoto)}" src="${TRANSPARENT_PIXEL}" alt="${escapeHtml(person.shortName)}" class="w-12 h-14 object-cover object-center rounded-xl border border-slate-200 flex-shrink-0 bg-slate-100" loading="lazy" />`
      : `<div class="w-11 h-12 rounded-xl flex items-center justify-center font-serif-editorial font-bold text-base flex-shrink-0 border" style="background-color: ${escapeHtml(meta.bgLight)}; color: ${escapeHtml(meta.badgeText)}; border-color: ${escapeHtml(meta.border)}">${initial}</div>`;

    const isRoot = person.branch === "root";
    const nameColorClass = isRoot ? "text-white" : "text-slate-900";
    const subColorClass = isRoot ? "text-slate-300" : "text-slate-500";

    card.innerHTML = `
      ${avatarHtml}
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-1">
          <span class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style="background-color: ${escapeHtml(meta.badgeBg)}; color: ${escapeHtml(meta.badgeText)}">
            ${escapeHtml(person.genRoman.replace(" покоління", " пок."))}
          </span>
          <div class="flex items-center gap-1 text-[10px]">
            ${person.photo && person.secondPhoto ? '<span title="2 архівні портрети (відкрийте картку)">📷×2</span>' : (person.photo ? '<span title="Є архівне фото">📷</span>' : '')}
            ${person.docImage ? '<span title="Є оцифрований документ">📜</span>' : ''}
          </div>
        </div>
        <div class="text-xs font-bold ${nameColorClass} leading-tight truncate mt-1" title="${escapeHtml(person.name)}">
          ${escapeHtml(person.shortName)}
        </div>
        <div class="text-[10.5px] ${subColorClass} leading-tight truncate mt-0.5">
          ${escapeHtml(person.role)}
        </div>
      </div>
    `;

    card.addEventListener("click", (e) => {
      e.stopPropagation();
      selectPerson(person.id, { center: true, openSheet: true });
    });

    nodesLayer.appendChild(card);
  });

  hydrateEncryptedImages(nodesLayer);

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
      relatives.push({ id: conn.from, rel: conn.parentLabel || "Батьки / Предки", person: PEOPLE_DATA[conn.from] });
    } else if (conn.from === personId && PEOPLE_DATA[conn.to] && !seen.has(conn.to)) {
      seen.add(conn.to);
      relatives.push({ id: conn.to, rel: conn.label || "Діти / Нащадки", person: PEOPLE_DATA[conn.to] });
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
    setEncryptedImgSrc(photoEl, person.photo);
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
      setEncryptedImgSrc(secondPhotoEl, person.secondPhoto);
      secondPhotoEl.alt = person.shortName;
      secondPhotoEl.classList.remove("hidden");
    } else {
      secondPhotoEl.classList.add("hidden");
    }
  }

  const heroWrapEl = document.getElementById("sheetHeroWrap");
  if (heroWrapEl) {
    if (person.secondPhoto) {
      heroWrapEl.className = "flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 pb-3 border-b border-slate-100";
    } else {
      heroWrapEl.className = "flex items-center gap-3 pb-3 border-b border-slate-100";
    }
  }

  const scrollBodyEl = document.getElementById("personSheetScrollBody");
  if (scrollBodyEl) {
    scrollBodyEl.scrollTop = 0;
  }

  const showMapBtn = document.getElementById("sheetShowOnMapBtn");
  if (showMapBtn) {
    if (person.mapLocId) {
      showMapBtn.classList.remove("hidden");
      const locObj = MAP_LOCATIONS.find(l => l.id === person.mapLocId);
      const shortLocTitle = locObj ? locObj.title.replace(/^[0-9а-я]+\.\s*/i, "") : person.place;
      showMapBtn.innerHTML = `<span>🗺️ На карті: <strong>${escapeHtml(shortLocTitle)}</strong> →</span>`;
    } else {
      showMapBtn.classList.add("hidden");
    }
  }

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
        chip.innerHTML = `<span class="text-[10px] font-semibold text-slate-400">${escapeHtml(r.rel)}:</span> <span class="font-semibold">${escapeHtml(r.person.shortName)}</span>`;
        chip.addEventListener("click", () => {
          selectPerson(r.id, { center: true, openSheet: true });
        });
        relList.appendChild(chip);
      });
    } else {
      relBox.classList.add("hidden");
    }
  }

  const docBox = document.getElementById("sheetDocBox");
  const docImg = document.getElementById("sheetDocImg");
  const docTitleEl = document.getElementById("sheetDocTitle");
  const docDescEl = document.getElementById("sheetDocDesc");
  const docTechEl = document.getElementById("sheetDocTechBox");
  const legendHint = document.getElementById("sheetPhotoLegendHint");
  if (person.docImage) {
    setEncryptedImgSrc(docImg, person.docImage);
    docBox.classList.remove("hidden");
    const metaForDoc = findPhotoDetails(person.docImage, person);
    const resolvedTitle = person.docTitle || metaForDoc.title || "Оцифрований документ / знімок";
    const resolvedDesc = person.docDesc || metaForDoc.desc || "";
    const resolvedTech = person.docTechNotes || metaForDoc.techNotes || "";

    if (docTitleEl) {
      docTitleEl.textContent = resolvedTitle;
    }
    if (docDescEl) {
      if (resolvedDesc) {
        docDescEl.textContent = resolvedDesc;
        docDescEl.classList.remove("hidden");
      } else {
        docDescEl.textContent = "";
        docDescEl.classList.add("hidden");
      }
    }
    if (legendHint) {
      if (metaForDoc.photoLegend && metaForDoc.photoLegend.length > 0) {
        legendHint.classList.remove("hidden");
        legendHint.onclick = () => openLightbox(person.docImage, resolvedTitle, person.generation, resolvedDesc || person.facts);
      } else {
        legendHint.classList.add("hidden");
      }
    }
    if (docTechEl) {
      if (resolvedTech) {
        docTechEl.innerHTML = `<strong class="text-slate-700">🔬 Технічні деталі / напис на звороті цього знімка:</strong> ${sanitizeHtml(resolvedTech)}`;
        docTechEl.classList.remove("hidden");
      } else {
        docTechEl.innerHTML = "";
        docTechEl.classList.add("hidden");
      }
    }
  } else {
    docBox.classList.add("hidden");
    if (legendHint) legendHint.classList.add("hidden");
    if (docDescEl) docDescEl.classList.add("hidden");
    if (docTechEl) docTechEl.classList.add("hidden");
  }

  const extraBox = document.getElementById("sheetExtraDocsBox");
  if (extraBox) {
    extraBox.innerHTML = "";
    const extras = person.extraDocs || [];
    if (extras.length > 0) {
      extraBox.classList.remove("hidden");
      extras.forEach(ex => {
        const exMeta = findPhotoDetails(ex.img, person);
        const hasGroupLegend = exMeta.photoLegend && exMeta.photoLegend.length > 0;
        const exTech = ex.techNotes !== undefined ? ex.techNotes : (exMeta.techNotes || "");
        const cleanExImg = String(ex.img || "").split("?")[0];
        const card = document.createElement("div");
        card.className = "bg-slate-50 rounded-2xl p-3 border border-slate-200/80 space-y-2";
        card.innerHTML = `
          <div class="flex items-start justify-between gap-2">
            <span class="text-xs font-semibold text-slate-800 leading-snug">${escapeHtml(ex.title)}</span>
            <button type="button" class="text-[11px] font-semibold text-amber-700 hover:text-amber-900 whitespace-nowrap flex-shrink-0">🔍 На весь екран</button>
          </div>
          <img data-enc-src="${escapeHtml(cleanExImg)}" src="${TRANSPARENT_PIXEL}" alt="${escapeHtml(ex.title)}" class="w-full max-h-52 object-contain rounded-xl bg-white border border-slate-200/70 p-1 cursor-pointer hover:opacity-95 transition" />
          <p class="text-[11.5px] text-slate-600 leading-relaxed">${sanitizeHtml(ex.desc || "")}</p>
          ${hasGroupLegend ? `<div class="text-[11px] font-semibold text-amber-800 bg-amber-50/90 border border-amber-200/70 rounded-lg px-2.5 py-1 cursor-pointer">👥 Натисніть на фото, щоб побачити детальний опис хто де стоїть (${exMeta.photoLegend.length}) →</div>` : ""}
          ${exTech ? `<div class="pt-2 border-t border-slate-200/80 text-[11px] text-slate-600 leading-relaxed"><strong class="text-slate-700">🔬 Технічні деталі / напис на звороті цього документа:</strong> ${sanitizeHtml(exTech)}</div>` : ""}
        `;
        const openEx = () => openLightbox(ex.img, ex.title, person.generation, ex.desc || person.facts);
        card.querySelector("button")?.addEventListener("click", (e) => { e.stopPropagation(); openEx(); });
        card.querySelector("img")?.addEventListener("click", (e) => { e.stopPropagation(); openEx(); });
        card.addEventListener("click", openEx);
        extraBox.appendChild(card);
      });
      hydrateEncryptedImages(extraBox);
    } else {
      extraBox.classList.add("hidden");
    }
  }

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
    const cleanEvImg = ev.img ? String(ev.img).split("?")[0] : "";

    item.innerHTML = `
      <div class="absolute -left-[31px] sm:-left-[39px] top-1.5 w-4 h-4 rounded-full border-2 border-white shadow-sm" style="background-color: ${escapeHtml(meta.color)}"></div>

      <div class="bg-slate-50/80 hover:bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 hover:border-slate-300 shadow-sm transition flex flex-col sm:flex-row gap-4 justify-between">
        <div class="space-y-1.5 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-bold px-2.5 py-0.5 rounded-lg" style="background-color: ${escapeHtml(meta.badgeBg)}; color: ${escapeHtml(meta.badgeText)}">
              ${escapeHtml(ev.year)}
            </span>
            <span class="text-xs font-medium text-slate-500 flex items-center gap-1">
              📍 ${escapeHtml(ev.place)}
            </span>
          </div>
          <h3 class="text-base font-bold text-slate-900 pt-0.5">${escapeHtml(ev.title)}</h3>
          <p class="text-xs sm:text-sm text-slate-600 leading-relaxed">${sanitizeHtml(ev.desc)}</p>
          ${ev.personId ? `
            <div class="pt-2">
              <button type="button" data-jump-person="${escapeHtml(ev.personId)}" class="text-xs font-semibold text-amber-700 hover:text-amber-900 inline-flex items-center gap-1 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 px-3 py-1.5 rounded-xl transition">
                <span>Показати на дереві роду</span>
                <span>→</span>
              </button>
            </div>
          ` : ''}
        </div>

        ${cleanEvImg ? `
          <div class="sm:w-48 md:w-52 flex-shrink-0 flex flex-col items-center justify-center">
            <div data-lb-src="${escapeHtml(cleanEvImg)}" data-lb-title="${escapeHtml(ev.title)}" data-lb-badge="${escapeHtml(ev.year + ' • ' + ev.place)}" data-lb-desc="${escapeHtml(ev.desc)}" class="w-full h-48 sm:h-40 bg-white rounded-xl border border-slate-200/90 p-1.5 flex items-center justify-center cursor-pointer hover:border-amber-400 hover:shadow-md transition relative overflow-hidden group/img shadow-sm" title="Натисніть, щоб відкрити у повному розмірі">
              <img data-enc-src="${escapeHtml(cleanEvImg)}" src="${TRANSPARENT_PIXEL}" alt="${escapeHtml(ev.title)}" class="max-w-full max-h-full object-contain rounded-lg group-hover/img:scale-[1.03] transition duration-200" loading="lazy" />
              <span class="absolute bottom-1.5 right-1.5 text-[10px] font-semibold bg-slate-900/75 text-white px-2 py-0.5 rounded-md opacity-90 group-hover/img:bg-amber-600 transition">🔍 Збільшити</span>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    container.appendChild(item);
  });

  hydrateEncryptedImages(container);

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

  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    subdomains: "abcd",
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
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
      poly.bindPopup(`<strong>${escapeHtml(route.label)}</strong>`);
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
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:${escapeHtml(loc.color)};">${escapeHtml(loc.badge)} • ${escapeHtml(loc.period)}</div>
          <div style="font-size:13px;font-weight:700;color:#0f172a;margin-top:2px;">${escapeHtml(loc.title)}</div>
          <p style="font-size:11.5px;color:#475569;margin-top:5px;line-height:1.45;">${sanitizeHtml(loc.desc)}</p>
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
        <span class="text-[10.5px] font-bold px-2 py-0.5 rounded-md text-white" style="background-color: ${escapeHtml(loc.color)}">${escapeHtml(loc.badge)}</span>
        <span class="text-[11px] font-semibold text-slate-400">${escapeHtml(loc.period)}</span>
      </div>
      <h4 class="font-bold text-xs sm:text-sm text-slate-900 mt-1.5">${escapeHtml(loc.title)}</h4>
      <p class="text-xs text-slate-600 mt-1 leading-relaxed">${sanitizeHtml(loc.desc)}</p>
      ${loc.personId ? `
        <div class="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between">
          <span class="text-[11px] font-medium text-sky-700">Натисніть картку, щоб наблизити на карті</span>
          <button type="button" data-map-jump-person="${escapeHtml(loc.personId)}" class="text-[11px] font-bold text-amber-700 hover:text-amber-900 underline">
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
  if (!cleanSrc) return { photoLegend: [], techNotes: "", desc: "", title: "" };

  const galMatch = ARCHIVE_GALLERY_ITEMS.find(item => String(item.img || "").split("?")[0] === cleanSrc);
  const extraMatch = fallbackPerson && Array.isArray(fallbackPerson.extraDocs)
    ? fallbackPerson.extraDocs.find(e => String(e.img || "").split("?")[0] === cleanSrc)
    : null;
  const isFallbackMainDoc = fallbackPerson && String(fallbackPerson.docImage || "").split("?")[0] === cleanSrc;

  if (galMatch) {
    return {
      photoLegend: galMatch.photoLegend || (isFallbackMainDoc ? (fallbackPerson.photoLegend || []) : []),
      techNotes: (extraMatch && extraMatch.techNotes !== undefined)
        ? extraMatch.techNotes
        : (isFallbackMainDoc && fallbackPerson.docTechNotes !== undefined
          ? fallbackPerson.docTechNotes
          : (galMatch.techNotes || "")),
      desc: (extraMatch && extraMatch.desc) || (isFallbackMainDoc && fallbackPerson.docDesc) || galMatch.desc || "",
      badge: galMatch.badge || "",
      title: (extraMatch && extraMatch.title) || (isFallbackMainDoc && fallbackPerson.docTitle) || galMatch.title || ""
    };
  }

  if (extraMatch) {
    return {
      photoLegend: extraMatch.photoLegend || [],
      techNotes: extraMatch.techNotes || "",
      desc: extraMatch.desc || "",
      badge: fallbackPerson?.generation || "",
      title: extraMatch.title || ""
    };
  }

  if (isFallbackMainDoc) {
    return {
      photoLegend: fallbackPerson.photoLegend || [],
      techNotes: fallbackPerson.docTechNotes || fallbackPerson.techNotes || "",
      desc: fallbackPerson.docDesc || "",
      badge: fallbackPerson.generation || "",
      title: fallbackPerson.docTitle || ""
    };
  }

  const personMatch = Object.values(PEOPLE_DATA).find(p => String(p.docImage || "").split("?")[0] === cleanSrc);
  if (personMatch) {
    return {
      photoLegend: personMatch.photoLegend || [],
      techNotes: personMatch.docTechNotes || personMatch.techNotes || "",
      desc: personMatch.docDesc || "",
      badge: personMatch.generation || "",
      title: personMatch.docTitle || ""
    };
  }

  return {
    photoLegend: [],
    techNotes: "",
    desc: "",
    title: ""
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

    const cleanImg = String(item.img || "").split("?")[0];

    card.innerHTML = `
      <div>
        <div class="h-52 bg-slate-900 flex items-center justify-center p-2 overflow-hidden relative">
          <img data-enc-src="${escapeHtml(cleanImg)}" src="${TRANSPARENT_PIXEL}" alt="${escapeHtml(item.title)}" class="max-h-full max-w-full object-contain group-hover:scale-105 transition duration-300" loading="lazy" />
          <span class="absolute top-2.5 left-2.5 text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-slate-950 px-2 py-0.5 rounded-md shadow">${escapeHtml(item.badge)}</span>
          <span class="absolute bottom-2 right-2 text-[11px] font-semibold bg-slate-900/80 text-white px-2.5 py-1 rounded-lg opacity-90 group-hover:bg-amber-600 transition">🔍 Збільшити</span>
        </div>
        <div class="p-4">
          <h3 class="font-bold text-sm text-slate-900 leading-snug">${escapeHtml(item.title)}</h3>
          <p class="text-xs text-slate-600 mt-1.5 leading-relaxed">${sanitizeHtml(item.desc)}</p>
          ${hintHtml}
        </div>
      </div>
    `;
    card.addEventListener("click", () => {
      openLightbox(item.img, item.title, item.badge, item.desc);
    });
    grid.appendChild(card);
  });

  hydrateEncryptedImages(grid);
}

function openLightbox(imgSrc, title, badge, caption) {
  const modal = document.getElementById("docLightboxModal");
  const imgEl = document.getElementById("lightboxImg");
  const captionEl = document.getElementById("lightboxCaption");
  if (!modal || !imgEl || !imgSrc) return;

  setEncryptedImgSrc(imgEl, imgSrc);

  const details = findPhotoDetails(imgSrc, PEOPLE_DATA[currentPersonId]);
  const rawBadge = details.badge || badge || "Архів";
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
            ${legendItems.map(item => `<li class="bg-slate-800/90 border border-slate-700/80 rounded-xl px-2.5 py-1.5">${sanitizeHtml(item)}</li>`).join("")}
          </ul>
        </div>
      `;
      if (mainDesc) {
        html += `<p class="text-[11.5px] text-slate-300 leading-relaxed pt-1">${sanitizeHtml(mainDesc)}</p>`;
      }
    } else if (mainDesc) {
      html += `<p class="text-xs text-slate-200 leading-relaxed">${sanitizeHtml(mainDesc)}</p>`;
    }

    if (techNotes) {
      html += `
        <div class="pt-2 border-t border-dashed border-slate-700/90 text-[11px] text-slate-400 leading-relaxed">
          <strong class="text-slate-300">🔬 Технічні деталі фото та написи на звороті:</strong> ${sanitizeHtml(techNotes)}
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
        <div class="text-[11px] font-bold uppercase text-amber-800">${escapeHtml(s.step)}</div>
        <div class="font-bold text-sm sm:text-base text-slate-900 mt-1">${escapeHtml(s.title)}</div>
        <p class="text-xs text-slate-600 mt-1.5 leading-relaxed">${sanitizeHtml(s.desc)}</p>
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
          <span class="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900">${escapeHtml(c.badge)}</span>
          <span class="text-xs font-semibold text-slate-400">${escapeHtml(c.years)}</span>
        </div>
        <h4 class="font-bold text-sm sm:text-base text-slate-900 mt-1.5">${escapeHtml(c.name)}</h4>
        <p class="text-xs text-slate-600 mt-1 leading-relaxed">${sanitizeHtml(c.desc)}</p>
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
        <span class="text-[10.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-sky-100 text-sky-900 inline-block">${escapeHtml(d.badge)}</span>
        <h4 class="font-bold text-sm text-slate-900 pt-0.5">${escapeHtml(d.title)}</h4>
        <p class="text-xs text-slate-600 leading-relaxed">${sanitizeHtml(d.desc)}</p>
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

// ==================== NON-EXTRACTABLE CRYPTOKEY STORAGE (INDEXEDDB) ====================
const KEY_DB_NAME = "family_archive_keystore_v3";
const KEY_STORE_NAME = "keys";
const KEY_RECORD_ID = "active_aes_key";

function openKeyDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = window.indexedDB.open(KEY_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KEY_STORE_NAME)) {
        db.createObjectStore(KEY_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveCryptoKeyToIndexedDB(cryptoKey, saltB64) {
  try {
    const db = await openKeyDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(KEY_STORE_NAME, "readwrite");
      tx.objectStore(KEY_STORE_NAME).put({ key: cryptoKey, salt: saltB64 }, KEY_RECORD_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {}
}

async function loadCryptoKeyFromIndexedDB(expectedSaltB64) {
  try {
    const db = await openKeyDatabase();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(KEY_STORE_NAME, "readonly");
      const getReq = tx.objectStore(KEY_STORE_NAME).get(KEY_RECORD_ID);
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = () => reject(getReq.error);
    });
    db.close();
    if (record && record.key && record.salt === expectedSaltB64) {
      return record.key;
    }
  } catch (e) {}
  return null;
}

async function clearStoredCryptoKey() {
  try {
    localStorage.removeItem("family_archive_session_v2");
    sessionStorage.clear();
  } catch (e) {}
  try {
    const db = await openKeyDatabase();
    await new Promise((resolve) => {
      const tx = db.transaction(KEY_STORE_NAME, "readwrite");
      tx.objectStore(KEY_STORE_NAME).delete(KEY_RECORD_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch (e) {}
}

// ==================== INITIALIZATION & AES-256-GCM FAMILY ACCESS GATE ====================
let portalInitialized = false;
let unlockInProgress = false;

async function deriveAesKeyFromPassphrase(passphrase, bundle) {
  const salt = base64ToBytes(bundle.salt);
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: bundle.iter || 600000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

async function decryptBundleWithKey(aesKey, bundle) {
  const iv = base64ToBytes(bundle.iv);
  const ciphertext = base64ToBytes(bundle.ct);
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    ciphertext
  );
  const jsonText = new TextDecoder("utf-8").decode(decryptedBuffer);
  const parsedData = JSON.parse(jsonText);
  Object.assign(window, parsedData);
  activeCryptoKey = aesKey;
  return typeof window.PEOPLE_DATA !== "undefined";
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
    altBox.innerHTML = sanitizeHtml(ui.mapAlternatingNamesHtml);
  }
}

function completePortalInitialization() {
  const gate = document.getElementById("familyAccessGate");
  if (gate) {
    gate.classList.add("hidden");
  }

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
}

async function unlockWithPassphrase(rawPassphrase, rememberDevice = false) {
  if (portalInitialized || unlockInProgress) return false;
  const cleaned = String(rawPassphrase || "").trim();
  const bundle = window.ENCRYPTED_FAMILY_ARCHIVE;
  if (!cleaned || !bundle || !bundle.ct || !window.crypto || !window.crypto.subtle) {
    return false;
  }

  unlockInProgress = true;
  try {
    const aesKey = await deriveAesKeyFromPassphrase(cleaned, bundle);
    const ok = await decryptBundleWithKey(aesKey, bundle);
    if (!ok) {
      unlockInProgress = false;
      return false;
    }
    if (rememberDevice) {
      await saveCryptoKeyToIndexedDB(aesKey, bundle.salt);
    } else {
      await clearStoredCryptoKey();
    }
    completePortalInitialization();
    return true;
  } catch (err) {
    unlockInProgress = false;
    return false;
  }
}

async function lockAndExitArchive() {
  await clearStoredCryptoKey();
  decryptedBlobUrlCache.forEach(url => {
    try { URL.revokeObjectURL(url); } catch (e) {}
  });
  decryptedBlobUrlCache.clear();
  activeCryptoKey = null;
  window.location.reload();
}

window.addEventListener("DOMContentLoaded", async () => {
  // Always remove legacy base64 PIN from localStorage
  try { localStorage.removeItem("family_archive_session_v2"); } catch (e) {}

  if (typeof lucide !== "undefined") {
    try { lucide.createIcons(); } catch (e) {}
  }

  const form = document.getElementById("familyAccessForm");
  const input = document.getElementById("familyAccessInput");
  const rememberCheckbox = document.getElementById("familyRememberDevice");
  const errEl = document.getElementById("familyAccessError");
  const submitBtn = document.getElementById("familyAccessSubmitBtn");

  input?.addEventListener("input", () => {
    errEl?.classList.add("hidden");
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (unlockInProgress) return;
    errEl?.classList.add("hidden");
    const val = input?.value || "";
    const remember = Boolean(rememberCheckbox?.checked);

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Розшифрування архіву...";
    }

    const ok = await unlockWithPassphrase(val, remember);
    if (ok) {
      if (input) input.value = "";
      input?.blur();
      return;
    }

    // Rate-limit delay (1.5s) on failed attempt
    await new Promise(r => setTimeout(r, 1500));
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Відкрити родинний архів →";
    }
    errEl?.classList.remove("hidden");
    if (input) {
      input.value = "";
      input.focus();
    }
  });

  document.getElementById("lockArchiveBtn")?.addEventListener("click", lockAndExitArchive);

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

  // Try restoring non-extractable CryptoKey from IndexedDB if user previously checked "Remember on this device"
  const bundle = window.ENCRYPTED_FAMILY_ARCHIVE;
  if (bundle && bundle.salt && bundle.ct) {
    const savedKey = await loadCryptoKeyFromIndexedDB(bundle.salt);
    if (savedKey) {
      try {
        unlockInProgress = true;
        const ok = await decryptBundleWithKey(savedKey, bundle);
        if (ok) {
          completePortalInitialization();
          return;
        }
      } catch (e) {
        await clearStoredCryptoKey();
      }
      unlockInProgress = false;
    }
  }

  setTimeout(() => input?.focus(), 100);
});
