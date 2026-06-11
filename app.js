"use strict";

/**
 * としょさが - 近くの図書館を探すサイト
 * カーリル(Calil) 図書館APIを利用して、現在地や住所から近隣の図書館を検索します。
 * API リファレンス: https://calil.jp/doc/api_ref.html
 */

const CALIL_LIBRARY_API = "https://api.calil.jp/library";
const NOMINATIM_API = "https://nominatim.openstreetmap.org/search";
const APPKEY_STORAGE = "calil_appkey";

// ---- 状態 ----
let map;
let markers = [];
let originMarker = null;

// ---- DOM ----
const els = {
  locateBtn: document.getElementById("locateBtn"),
  addressForm: document.getElementById("addressForm"),
  addressInput: document.getElementById("addressInput"),
  limitSelect: document.getElementById("limitSelect"),
  status: document.getElementById("status"),
  resultList: document.getElementById("resultList"),
  settingsBtn: document.getElementById("settingsBtn"),
  settingsModal: document.getElementById("settingsModal"),
  appkeyInput: document.getElementById("appkeyInput"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  closeSettingsBtn: document.getElementById("closeSettingsBtn"),
};

// ---- 地図初期化 ----
function initMap() {
  map = L.map("map").setView([35.681236, 139.767125], 12); // 初期位置: 東京駅
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
}

// ---- ステータス表示 ----
function setStatus(message, isError = false) {
  els.status.textContent = message || "";
  els.status.classList.toggle("error", Boolean(isError));
}

// ---- APIキー管理 ----
function getAppKey() {
  return localStorage.getItem(APPKEY_STORAGE) || "";
}

function ensureAppKey() {
  const key = getAppKey();
  if (!key) {
    openSettings();
    setStatus("はじめにカーリルのアプリケーションキーを設定してください。", true);
    return null;
  }
  return key;
}

// ---- JSONP ヘルパー ----
// カーリルAPIはCORSに対応していないため、JSONPで呼び出します。
function jsonp(url, params) {
  return new Promise((resolve, reject) => {
    const callbackName = "calil_cb_" + Math.random().toString(36).slice(2);
    const query = new URLSearchParams({ ...params, callback: callbackName }).toString();
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("通信がタイムアウトしました。"));
    }, 15000);

    function cleanup() {
      clearTimeout(timer);
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("APIへの接続に失敗しました。"));
    };

    script.src = `${url}?${query}`;
    document.body.appendChild(script);
  });
}

// ---- 図書館検索 ----
async function searchLibraries(lat, lng) {
  const appkey = ensureAppKey();
  if (!appkey) return;

  const limit = els.limitSelect.value;
  setStatus("近くの図書館を検索しています…");
  clearResults();
  setOrigin(lat, lng);

  try {
    // geocode は「経度,緯度」の順で指定する
    const libraries = await jsonp(CALIL_LIBRARY_API, {
      appkey,
      geocode: `${lng},${lat}`,
      limit,
    });

    if (!Array.isArray(libraries) || libraries.length === 0) {
      setStatus("近くに図書館が見つかりませんでした。", true);
      return;
    }

    renderResults(libraries, lat, lng);
    setStatus(`${libraries.length}件の図書館が見つかりました。`);
  } catch (err) {
    console.error(err);
    setStatus(err.message || "検索中にエラーが発生しました。", true);
  }
}

// ---- 距離計算 (Haversine, km) ----
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km) {
  if (km < 1) return `約${Math.round(km * 1000)}m`;
  return `約${km.toFixed(1)}km`;
}

// ---- 結果描画 ----
function clearResults() {
  els.resultList.innerHTML = "";
  markers.forEach((m) => map.removeLayer(m));
  markers = [];
}

function setOrigin(lat, lng) {
  if (originMarker) map.removeLayer(originMarker);
  originMarker = L.circleMarker([lat, lng], {
    radius: 8,
    color: "#fff",
    weight: 2,
    fillColor: "#2e7d5b",
    fillOpacity: 1,
  })
    .addTo(map)
    .bindPopup("検索の起点");
}

function renderResults(libraries, originLat, originLng) {
  const bounds = L.latLngBounds([[originLat, originLng]]);

  // 距離を計算して付与し、近い順に並べ替え
  const enriched = libraries
    .map((lib) => {
      const coords = parseGeocode(lib.geocode);
      const dist = coords ? distanceKm(originLat, originLng, coords.lat, coords.lng) : null;
      return { ...lib, _coords: coords, _dist: dist };
    })
    .sort((a, b) => {
      if (a._dist == null) return 1;
      if (b._dist == null) return -1;
      return a._dist - b._dist;
    });

  enriched.forEach((lib, index) => {
    const li = createResultItem(lib, index);
    els.resultList.appendChild(li);

    if (lib._coords) {
      const marker = L.marker([lib._coords.lat, lib._coords.lng])
        .addTo(map)
        .bindPopup(buildPopup(lib));
      marker.on("click", () => highlightItem(index));
      markers.push(marker);
      bounds.extend([lib._coords.lat, lib._coords.lng]);

      li.addEventListener("click", () => {
        map.setView([lib._coords.lat, lib._coords.lng], 16);
        marker.openPopup();
        highlightItem(index);
      });
    }
  });

  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }
}

function parseGeocode(geocode) {
  if (!geocode) return null;
  const [lng, lat] = geocode.split(",").map(Number);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function createResultItem(lib, index) {
  const li = document.createElement("li");
  li.className = "result-item";
  li.dataset.index = index;

  const name = lib.formal || lib.short || lib.libkey || "図書館";
  const distance = lib._dist != null ? formatDistance(lib._dist) : "";
  const address = lib.address || "";
  const tel = lib.tel || "";

  const links = [];
  if (lib.url_pc) {
    links.push(
      `<a href="${escapeHtml(lib.url_pc)}" target="_blank" rel="noopener">公式サイト ↗</a>`
    );
  }
  if (lib._coords) {
    links.push(
      `<a href="https://www.google.com/maps/search/?api=1&query=${lib._coords.lat},${lib._coords.lng}" target="_blank" rel="noopener">経路 ↗</a>`
    );
  }

  li.innerHTML = `
    <p class="result-name">
      <span>${escapeHtml(name)}</span>
      ${distance ? `<span class="result-distance">${distance}</span>` : ""}
    </p>
    ${address ? `<p class="result-meta">📍 ${escapeHtml(address)}</p>` : ""}
    ${tel ? `<p class="result-meta">☎ ${escapeHtml(tel)}</p>` : ""}
    ${links.length ? `<div class="result-links">${links.join("")}</div>` : ""}
  `;
  return li;
}

function buildPopup(lib) {
  const name = lib.formal || lib.short || lib.libkey || "図書館";
  const address = lib.address || "";
  return `
    <div class="popup-title">${escapeHtml(name)}</div>
    ${address ? `<div class="popup-meta">${escapeHtml(address)}</div>` : ""}
  `;
}

function highlightItem(index) {
  document.querySelectorAll(".result-item").forEach((el) => {
    el.classList.toggle("active", Number(el.dataset.index) === index);
  });
  const target = document.querySelector(`.result-item[data-index="${index}"]`);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---- 現在地検索 ----
function locateAndSearch() {
  if (!navigator.geolocation) {
    setStatus("このブラウザは位置情報に対応していません。住所検索をご利用ください。", true);
    return;
  }
  setStatus("現在地を取得しています…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      searchLibraries(latitude, longitude);
    },
    (err) => {
      console.error(err);
      const msg =
        err.code === err.PERMISSION_DENIED
          ? "位置情報の利用が許可されませんでした。住所検索をご利用ください。"
          : "現在地を取得できませんでした。住所検索をご利用ください。";
      setStatus(msg, true);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// ---- 住所検索 (Nominatim でジオコーディング) ----
async function searchByAddress(query) {
  if (!query.trim()) return;
  if (!ensureAppKey()) return;

  setStatus("住所を検索しています…");
  try {
    const url = `${NOMINATIM_API}?format=json&limit=1&countrycodes=jp&q=${encodeURIComponent(
      query
    )}`;
    const res = await fetch(url, { headers: { "Accept-Language": "ja" } });
    const data = await res.json();
    if (!data || data.length === 0) {
      setStatus("該当する住所が見つかりませんでした。", true);
      return;
    }
    const { lat, lon } = data[0];
    searchLibraries(Number(lat), Number(lon));
  } catch (err) {
    console.error(err);
    setStatus("住所の検索に失敗しました。", true);
  }
}

// ---- 設定モーダル ----
function openSettings() {
  els.appkeyInput.value = getAppKey();
  els.settingsModal.classList.remove("hidden");
}

function closeSettings() {
  els.settingsModal.classList.add("hidden");
}

function saveSettings() {
  const key = els.appkeyInput.value.trim();
  if (key) {
    localStorage.setItem(APPKEY_STORAGE, key);
    setStatus("アプリケーションキーを保存しました。");
  } else {
    localStorage.removeItem(APPKEY_STORAGE);
  }
  closeSettings();
}

// ---- イベント登録 ----
function bindEvents() {
  els.locateBtn.addEventListener("click", locateAndSearch);
  els.addressForm.addEventListener("submit", (e) => {
    e.preventDefault();
    searchByAddress(els.addressInput.value);
  });
  els.settingsBtn.addEventListener("click", openSettings);
  els.saveSettingsBtn.addEventListener("click", saveSettings);
  els.closeSettingsBtn.addEventListener("click", closeSettings);
  els.settingsModal.addEventListener("click", (e) => {
    if (e.target === els.settingsModal) closeSettings();
  });
}

// ---- 起動 ----
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  bindEvents();
  if (!getAppKey()) {
    setStatus("まずは右上の⚙️からカーリルのアプリケーションキーを設定してください。");
  } else {
    setStatus("「現在地から探す」または住所検索を始めてください。");
  }
});
