// ===== HEALTH ALERTS BANNER =====
// Dismissed alerts (keyed by alert id, expires after 30min)
const _dismissedAlerts = {};
function dismissAlert(id) {
  _dismissedAlerts[id] = Date.now() + 30 * 60000;
  refreshAlerts();
}

// Wake a sleeping cron agent from the alert banner
async function wakeAgentFromAlert(cronJobId, agentName) {
  try {
    const _wakeHeaders = { 'Content-Type': 'application/json' };
    if (_authToken) _wakeHeaders['X-API-Key'] = _authToken;
    const r = await fetch(API + '/wake-agent', { method: 'POST', headers: _wakeHeaders, body: JSON.stringify({ cronJobId }) });
    const d = await r.json();
    if (d.ok) {
      showToast('⚡', `Woke ${agentName}`, 'var(--green)');
    } else {
      showToast('❌', `Failed to wake ${agentName}: ${d.error || 'unknown'}`, 'var(--red)');
    }
  } catch (e) { showToast('❌', `Wake failed: ${e.message}`, 'var(--red)'); }
}

function escJsArg(v) {
  return String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function formatAgeCompact(mins) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return mm ? `${h}h ${mm}m` : `${h}h`;
  }
  return `${m}m`;
}

function summarizeAlertMessage(message) {
  const cleaned = typeof sanitizeAgentText === 'function'
    ? sanitizeAgentText(message || '')
    : String(message || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const first = cleaned.split(/(?:\n|\.\s+)/)[0].trim();
  if (!first) return '';
  return first.length > 56 ? first.slice(0, 55) + '…' : first;
}

function collapseInfraSpikeAlerts(alerts) {
  const spikeAlerts = alerts.filter(a => a.groupKey === 'infra-spike');
  if (spikeAlerts.length <= 1) return alerts.slice();

  const nonSpike = alerts.filter(a => a.groupKey !== 'infra-spike');
  const hasCritical = spikeAlerts.some(a => a.severity === 'critical');
  const severity = hasCritical ? 'critical' : 'warning';
  const color = hasCritical ? 'var(--red)' : 'var(--orange)';
  const members = spikeAlerts
    .map((a) => {
      const label = a.memberLabel || a.text;
      const severity = a.severity || 'warning';
      const icon = a.icon || '•';
      const key = String(a.memberKey || label || '').toLowerCase();
      const value = Number(a.memberValue);
      const hasValue = Number.isFinite(value);
      const prev = hasValue ? Number(_infraMetricPrev[key]) : NaN;
      const hasPrev = Number.isFinite(prev);
      let trend = 'baseline';
      let delta = null;
      if (hasValue && hasPrev) {
        delta = value - prev;
        if (Math.abs(delta) < 0.05) trend = 'flat';
        else trend = delta > 0 ? 'up' : 'down';
      }
      let history = [];
      let volatilityScore = 0;
      let volatilityFlag = 'STABLE';
      if (hasValue && key) {
        _infraMetricPrev[key] = value;
        const prevHist = Array.isArray(_infraMetricHistory[key]) ? _infraMetricHistory[key].slice() : [];
        const last = prevHist.length ? Number(prevHist[prevHist.length - 1]) : NaN;
        if (!Number.isFinite(last) || Math.abs(last - value) > 0.0001) prevHist.push(value);
        if (prevHist.length > INFRA_HISTORY_MAX) prevHist.splice(0, prevHist.length - INFRA_HISTORY_MAX);
        _infraMetricHistory[key] = prevHist;
        history = prevHist.slice();

        const vol = computeVolatilityFromHistory(history, _alertsVolatilityMode);
        volatilityScore = vol.score;
        volatilityFlag = vol.flag;
      }
      return { label, severity, icon, key, value: hasValue ? value : null, delta, trend, hasPrev, history, volatilityScore, volatilityFlag, volatilityBasis: _alertsVolatilityMode };
    })
    .filter(m => !!m.label);
  const labels = members.map(m => m.label);
  const preview = labels.slice(0, 3).join(' · ');
  const extra = labels.length > 3 ? ` +${labels.length - 3} more` : '';

  nonSpike.push({
    id: 'infra-spike-group',
    icon: hasCritical ? '🧯' : '⚠️',
    text: `Infra spike (${labels.length}): ${preview}${extra}`,
    color,
    severity,
    source: 'infra',
    groupedMembers: members,
    action: {
      label: 'Inspect',
      onClick: "if(typeof openAlertsDrawer==='function'){openAlertsDrawer();}if(typeof setAlertsSourceFilter==='function'){setAlertsSourceFilter('infra');}",
    },
  });

  return nonSpike;
}

let _activeAlertsCache = [];
let _alertsDrawerOpen = false;
const _alertSeenAt = Object.create(null);
const _alertLastAt = Object.create(null);
const _alertGroupExpanded = Object.create(null);
const _infraMetricPrev = Object.create(null);
const _infraMetricHistory = Object.create(null);
const INFRA_HISTORY_MAX = 12;
const SUPPORTED_VOLATILITY_PROFILE_VERSION = 1;
let _presetImportWarnings = [];
let _presetImportVersion = null;
let _presetImportAt = 0;
let _selectedImportHistoryIndex = 0;

let _alertsSourceFilter = localStorage.getItem('alerts-source-filter') || 'all';
const ALERT_SOURCES = ['all', 'infra', 'agent', 'performance'];
const ALERT_SOURCE_LABELS = {
  all: 'All',
  infra: 'Infra',
  agent: 'Agent',
  performance: 'Performance',
};
if (!ALERT_SOURCES.includes(_alertsSourceFilter)) _alertsSourceFilter = 'all';

let _alertsSortMode = localStorage.getItem('alerts-sort-mode') || 'severity';
const ALERT_SORT_MODES = ['severity', 'time', 'source'];
const ALERT_SORT_LABELS = {
  severity: 'Sort: Severity',
  time: 'Sort: Time',
  source: 'Sort: Source',
};
if (!ALERT_SORT_MODES.includes(_alertsSortMode)) _alertsSortMode = 'severity';

const ALERT_SOURCE_VOLATILITY_PRESET_DEFAULTS = {
  all: 'raw',
  infra: 'ewma',
  agent: 'raw',
  performance: 'raw',
};
const ALERT_VOLATILITY_PRESET_STORAGE_KEY = 'alerts-volatility-presets';
const ALERT_VOLATILITY_PRESET_META_STORAGE_KEY = 'alerts-volatility-presets-meta';
const ALERT_VOLATILITY_IMPORT_HISTORY_STORAGE_KEY = 'alerts-volatility-import-history';
const ALERT_VOLATILITY_LEGACY_LAST_IMPORT_SNAPSHOT_KEY = 'alerts-volatility-last-import-snapshot';
const ALERT_VOLATILITY_IMPORT_HISTORY_MAX = 3;
let _alertsVolatilityPresets = { ...ALERT_SOURCE_VOLATILITY_PRESET_DEFAULTS };
let _alertsVolatilityPresetMeta = {};
let _volatilityImportHistory = [];
try {
  const rawPresets = localStorage.getItem(ALERT_VOLATILITY_PRESET_STORAGE_KEY);
  if (rawPresets) {
    const parsed = JSON.parse(rawPresets);
    if (parsed && typeof parsed === 'object') {
      _alertsVolatilityPresets = { ..._alertsVolatilityPresets, ...parsed };
    }
  }
} catch {}
try {
  const rawMeta = localStorage.getItem(ALERT_VOLATILITY_PRESET_META_STORAGE_KEY);
  if (rawMeta) {
    const parsedMeta = JSON.parse(rawMeta);
    if (parsedMeta && typeof parsedMeta === 'object') {
      _alertsVolatilityPresetMeta = parsedMeta;
    }
  }
} catch {}
try {
  const rawHistory = localStorage.getItem(ALERT_VOLATILITY_IMPORT_HISTORY_STORAGE_KEY);
  if (rawHistory) {
    const parsedHistory = JSON.parse(rawHistory);
    if (Array.isArray(parsedHistory)) {
      _volatilityImportHistory = parsedHistory
        .filter((entry) => entry && typeof entry === 'object' && entry.profile && typeof entry.profile === 'object')
        .slice(0, ALERT_VOLATILITY_IMPORT_HISTORY_MAX);
    }
  }
} catch {}
try {
  if (!_volatilityImportHistory.length) {
    const rawLegacySnapshot = localStorage.getItem(ALERT_VOLATILITY_LEGACY_LAST_IMPORT_SNAPSHOT_KEY);
    if (rawLegacySnapshot) {
      const legacy = JSON.parse(rawLegacySnapshot);
      if (legacy && typeof legacy === 'object' && legacy.profile && typeof legacy.profile === 'object') {
        _volatilityImportHistory = [legacy];
      }
      localStorage.removeItem(ALERT_VOLATILITY_LEGACY_LAST_IMPORT_SNAPSHOT_KEY);
    }
  }
} catch {}
const ALERT_VOLATILITY_MODES = ['raw', 'ewma'];
const ALERT_VOLATILITY_LABELS = {
  raw: 'Volatility: Raw',
  ewma: 'Volatility: EWMA',
};
for (const src of ALERT_SOURCES) {
  if (!ALERT_VOLATILITY_MODES.includes(_alertsVolatilityPresets[src])) {
    _alertsVolatilityPresets[src] = ALERT_SOURCE_VOLATILITY_PRESET_DEFAULTS[src] || 'raw';
  }
  const ts = Number(_alertsVolatilityPresetMeta[src]);
  if (!Number.isFinite(ts) || ts <= 0) delete _alertsVolatilityPresetMeta[src];
}
let _alertsVolatilityMode = localStorage.getItem('alerts-volatility-mode') || (_alertsVolatilityPresets[_alertsSourceFilter] || 'raw');
if (!ALERT_VOLATILITY_MODES.includes(_alertsVolatilityMode)) _alertsVolatilityMode = _alertsVolatilityPresets[_alertsSourceFilter] || 'raw';
normalizeImportHistorySelection();

function escHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dismissAllAlerts() {
  if (!_activeAlertsCache.length) return;
  const until = Date.now() + 30 * 60000;
  _activeAlertsCache.forEach(a => { _dismissedAlerts[a.id] = until; });
  refreshAlerts();
}

function openAlertsDrawer() {
  _alertsDrawerOpen = true;
  renderAlertsDrawer();
}

function closeAlertsDrawer() {
  _alertsDrawerOpen = false;
  renderAlertsDrawer();
}

function toggleAlertsDrawer() {
  _alertsDrawerOpen = !_alertsDrawerOpen;
  renderAlertsDrawer();
}

function saveVolatilityPresets() {
  try {
    localStorage.setItem(ALERT_VOLATILITY_PRESET_STORAGE_KEY, JSON.stringify(_alertsVolatilityPresets));
  } catch {}
}

function saveVolatilityPresetMeta() {
  try {
    localStorage.setItem(ALERT_VOLATILITY_PRESET_META_STORAGE_KEY, JSON.stringify(_alertsVolatilityPresetMeta));
  } catch {}
}

function saveImportHistory() {
  try {
    if (!_volatilityImportHistory.length) {
      localStorage.removeItem(ALERT_VOLATILITY_IMPORT_HISTORY_STORAGE_KEY);
      return;
    }
    localStorage.setItem(ALERT_VOLATILITY_IMPORT_HISTORY_STORAGE_KEY, JSON.stringify(_volatilityImportHistory));
  } catch {}
}

function addImportHistorySnapshot(snapshotProfile, context = {}) {
  if (!snapshotProfile || typeof snapshotProfile !== 'object') return;
  const entry = {
    savedAt: Date.now(),
    context,
    profile: snapshotProfile,
  };
  _volatilityImportHistory = [entry, ..._volatilityImportHistory]
    .filter((e) => e && typeof e === 'object' && e.profile && typeof e.profile === 'object')
    .slice(0, ALERT_VOLATILITY_IMPORT_HISTORY_MAX);
  normalizeImportHistorySelection();
  saveImportHistory();
  if (_alertsDrawerOpen) renderAlertsDrawer();
}

function removeImportHistorySnapshotAt(index) {
  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= _volatilityImportHistory.length) return;
  _volatilityImportHistory.splice(idx, 1);
  normalizeImportHistorySelection();
  saveImportHistory();
  if (_alertsDrawerOpen) renderAlertsDrawer();
}

function getImportHistorySnapshot(index = 0) {
  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= _volatilityImportHistory.length) return null;
  const snap = _volatilityImportHistory[idx];
  if (!snap || typeof snap !== 'object' || !snap.profile || typeof snap.profile !== 'object') return null;
  return snap;
}

function hasImportHistory() {
  return _volatilityImportHistory.length > 0;
}

function normalizeImportHistorySelection() {
  if (!_volatilityImportHistory.length) {
    _selectedImportHistoryIndex = 0;
    return;
  }
  if (!Number.isInteger(_selectedImportHistoryIndex)) _selectedImportHistoryIndex = 0;
  if (_selectedImportHistoryIndex < 0) _selectedImportHistoryIndex = 0;
  if (_selectedImportHistoryIndex >= _volatilityImportHistory.length) _selectedImportHistoryIndex = _volatilityImportHistory.length - 1;
}

function setSelectedImportHistoryIndex(index) {
  _selectedImportHistoryIndex = Number(index);
  normalizeImportHistorySelection();
  if (_alertsDrawerOpen) renderAlertsDrawer();
}

function getSelectedImportHistorySnapshot() {
  normalizeImportHistorySelection();
  return getImportHistorySnapshot(_selectedImportHistoryIndex);
}

function getVolatilityPresetForSource(source) {
  const preset = _alertsVolatilityPresets[source];
  return ALERT_VOLATILITY_MODES.includes(preset) ? preset : (ALERT_SOURCE_VOLATILITY_PRESET_DEFAULTS[source] || 'raw');
}

function setVolatilityPresetForSource(source, mode) {
  const safeSource = ALERT_SOURCES.includes(source) ? source : 'all';
  const safeMode = ALERT_VOLATILITY_MODES.includes(mode) ? mode : 'raw';
  const currentMode = getVolatilityPresetForSource(safeSource);
  if (currentMode === safeMode) {
    renderAlertsDrawer();
    return;
  }

  _alertsVolatilityPresets[safeSource] = safeMode;
  const defaultMode = ALERT_SOURCE_VOLATILITY_PRESET_DEFAULTS[safeSource] || 'raw';
  if (safeMode === defaultMode) delete _alertsVolatilityPresetMeta[safeSource];
  else _alertsVolatilityPresetMeta[safeSource] = Date.now();
  saveVolatilityPresets();
  saveVolatilityPresetMeta();

  if (_alertsSourceFilter === safeSource) {
    _alertsVolatilityMode = safeMode;
    localStorage.setItem('alerts-volatility-mode', safeMode);
    refreshAlerts();
    return;
  }
  renderAlertsDrawer();
}

function resetVolatilityPresetForSource(source) {
  const safeSource = ALERT_SOURCES.includes(source) ? source : 'all';
  const defaultMode = ALERT_SOURCE_VOLATILITY_PRESET_DEFAULTS[safeSource] || 'raw';
  setVolatilityPresetForSource(safeSource, defaultMode);
}

function setPresetImportWarnings(warnings = [], version = null) {
  _presetImportWarnings = Array.isArray(warnings) ? warnings.map(w => String(w)).slice(0, 12) : [];
  _presetImportVersion = Number.isFinite(Number(version)) ? Number(version) : null;
  _presetImportAt = Date.now();
  if (_alertsDrawerOpen) renderAlertsDrawer();
}

function validateVolatilityPresetProfile(input) {
  const warnings = [];
  const obj = (input && typeof input === 'object' && !Array.isArray(input)) ? input : null;

  if (!obj) {
    warnings.push('Profile root is not an object; defaults were applied where needed.');
    return { warnings, version: null };
  }

  const allowedTop = ['version', 'exportedAt', 'presets', 'modifiedAt'];
  Object.keys(obj).forEach((k) => {
    if (!allowedTop.includes(k)) warnings.push(`Unknown top-level key ignored: ${k}`);
  });

  const version = Number(obj.version);
  if (!Number.isFinite(version)) {
    warnings.push('Missing/invalid profile version; importing with v1 compatibility assumptions.');
  } else if (version > SUPPORTED_VOLATILITY_PROFILE_VERSION) {
    warnings.push(`Profile version v${version} is newer than supported v${SUPPORTED_VOLATILITY_PROFILE_VERSION}; imported in compatibility mode.`);
  } else if (version < SUPPORTED_VOLATILITY_PROFILE_VERSION) {
    warnings.push(`Profile version v${version} is older than supported v${SUPPORTED_VOLATILITY_PROFILE_VERSION}; imported in compatibility mode.`);
  }

  const srcPresets = (obj.presets && typeof obj.presets === 'object' && !Array.isArray(obj.presets))
    ? obj.presets
    : obj;
  if (!obj.presets) warnings.push('No `presets` object found; using top-level fallback + defaults.');

  Object.keys(srcPresets || {}).forEach((key) => {
    if (!ALERT_SOURCES.includes(key)) warnings.push(`Unknown source key ignored: ${key}`);
  });

  ALERT_SOURCES.forEach((source) => {
    if (!(source in (srcPresets || {}))) {
      warnings.push(`Missing preset for ${source}; default ${ALERT_SOURCE_VOLATILITY_PRESET_DEFAULTS[source]} applied.`);
      return;
    }
    const mode = srcPresets[source];
    if (!ALERT_VOLATILITY_MODES.includes(mode)) warnings.push(`Invalid mode for ${source}: ${mode}; default applied.`);
  });

  const srcMeta = (obj.modifiedAt && typeof obj.modifiedAt === 'object' && !Array.isArray(obj.modifiedAt)) ? obj.modifiedAt : {};
  Object.keys(srcMeta).forEach((key) => {
    if (!ALERT_SOURCES.includes(key)) warnings.push(`Unknown modifiedAt source ignored: ${key}`);
    else {
      const ts = Number(srcMeta[key]);
      if (!Number.isFinite(ts) || ts <= 0) warnings.push(`Invalid modifiedAt timestamp for ${key}; ignored.`);
    }
  });

  return { warnings, version: Number.isFinite(version) ? version : null };
}

function buildVolatilityPresetProfile() {
  const presets = {};
  const modifiedAt = {};
  ALERT_SOURCES.forEach((source) => {
    const mode = getVolatilityPresetForSource(source);
    presets[source] = mode;
    const ts = Number(_alertsVolatilityPresetMeta[source]);
    if (Number.isFinite(ts) && ts > 0) modifiedAt[source] = ts;
  });
  return {
    version: SUPPORTED_VOLATILITY_PROFILE_VERSION,
    exportedAt: Date.now(),
    presets,
    modifiedAt,
  };
}

function normalizeVolatilityPresetProfile(input) {
  const obj = (input && typeof input === 'object') ? input : {};
  const srcPresets = (obj.presets && typeof obj.presets === 'object') ? obj.presets : obj;
  const srcMeta = (obj.modifiedAt && typeof obj.modifiedAt === 'object') ? obj.modifiedAt : {};

  const presets = { ...ALERT_SOURCE_VOLATILITY_PRESET_DEFAULTS };
  const modifiedAt = {};
  ALERT_SOURCES.forEach((source) => {
    const mode = srcPresets[source];
    if (ALERT_VOLATILITY_MODES.includes(mode)) presets[source] = mode;
    const ts = Number(srcMeta[source]);
    if (Number.isFinite(ts) && ts > 0) modifiedAt[source] = ts;
  });

  return { presets, modifiedAt };
}

function computeVolatilityPresetDiff(normalizedProfile) {
  const normalized = normalizeVolatilityPresetProfile(normalizedProfile);
  const lines = [];

  ALERT_SOURCES.forEach((source) => {
    const currentMode = getVolatilityPresetForSource(source);
    const incomingMode = normalized.presets[source] || (ALERT_SOURCE_VOLATILITY_PRESET_DEFAULTS[source] || 'raw');

    const currentTs = Number(_alertsVolatilityPresetMeta[source]);
    const currentState = (Number.isFinite(currentTs) && currentTs > 0)
      ? `updated ${timeAgoShort(currentTs)}`
      : 'default';

    const incomingTs = Number(normalized.modifiedAt[source]);
    const incomingState = (Number.isFinite(incomingTs) && incomingTs > 0)
      ? `updated ${timeAgoShort(incomingTs)}`
      : (incomingMode === (ALERT_SOURCE_VOLATILITY_PRESET_DEFAULTS[source] || 'raw') ? 'default' : 'custom');

    if (currentMode !== incomingMode || currentState !== incomingState) {
      lines.push(`${ALERT_SOURCE_LABELS[source]}: ${currentMode.toUpperCase()} (${currentState}) → ${incomingMode.toUpperCase()} (${incomingState})`);
    }
  });

  return { changed: lines.length, lines };
}

function applyVolatilityPresetProfile(profile) {
  const normalized = normalizeVolatilityPresetProfile(profile);
  _alertsVolatilityPresets = { ...normalized.presets };
  _alertsVolatilityPresetMeta = { ...normalized.modifiedAt };

  ALERT_SOURCES.forEach((source) => {
    const mode = getVolatilityPresetForSource(source);
    const def = ALERT_SOURCE_VOLATILITY_PRESET_DEFAULTS[source] || 'raw';
    if (mode === def) delete _alertsVolatilityPresetMeta[source];
    else if (!Number.isFinite(Number(_alertsVolatilityPresetMeta[source]))) _alertsVolatilityPresetMeta[source] = Date.now();
  });

  saveVolatilityPresets();
  saveVolatilityPresetMeta();

  _alertsVolatilityMode = getVolatilityPresetForSource(_alertsSourceFilter);
  localStorage.setItem('alerts-volatility-mode', _alertsVolatilityMode);
  refreshAlerts();
}

async function exportVolatilityPresetProfile() {
  const payload = JSON.stringify(buildVolatilityPresetProfile(), null, 2);
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload);
      if (typeof showToast === 'function') showToast('📋', 'Preset profile copied to clipboard', 'var(--green)');
      return;
    }
  } catch {}
  window.prompt('Copy volatility preset profile JSON', payload);
}

function importVolatilityPresetProfile() {
  const raw = window.prompt('Paste volatility preset profile JSON');
  if (!raw || !raw.trim()) return;
  try {
    const parsed = JSON.parse(raw);
    const validation = validateVolatilityPresetProfile(parsed);
    const normalized = normalizeVolatilityPresetProfile(parsed);
    const diff = computeVolatilityPresetDiff(normalized);

    const previewLines = diff.lines.length
      ? diff.lines.map((line) => `• ${line}`).join('\n')
      : '• No preset changes detected';
    const warningLine = validation.warnings.length
      ? `\n\nCompatibility warnings: ${validation.warnings.length}`
      : '';
    const confirmed = window.confirm(
      `Import volatility preset profile?\n\nChanges (${diff.changed}):\n${previewLines}${warningLine}`
    );
    if (!confirmed) {
      if (typeof showToast === 'function') showToast('ℹ️', 'Preset import canceled', 'var(--dim)');
      return;
    }

    const beforeProfile = buildVolatilityPresetProfile();
    addImportHistorySnapshot(beforeProfile, {
      importedVersion: validation.version,
      warningCount: validation.warnings.length,
      changed: diff.changed,
    });

    applyVolatilityPresetProfile(normalized);
    setPresetImportWarnings(validation.warnings, validation.version);

    if (typeof showToast === 'function') {
      if (validation.warnings.length) {
        showToast('⚠️', `Profile imported with ${validation.warnings.length} compatibility warning(s)`, 'var(--orange)');
      } else {
        showToast('✅', 'Preset profile imported', 'var(--green)');
      }
    }
  } catch (e) {
    if (typeof showToast === 'function') showToast('❌', `Invalid preset JSON: ${e.message}`, 'var(--red)');
  }
}

function rollbackVolatilityImportAt(index = 0) {
  if (!hasImportHistory()) {
    if (typeof showToast === 'function') showToast('ℹ️', 'No import rollback snapshot available', 'var(--dim)');
    return;
  }

  const snapshot = getImportHistorySnapshot(index);
  if (!snapshot) {
    if (typeof showToast === 'function') showToast('❌', 'Selected rollback snapshot is unavailable', 'var(--red)');
    return;
  }

  const contextText = snapshot?.context?.importedVersion
    ? `Imported profile v${snapshot.context.importedVersion}`
    : 'Imported preset profile';
  const confirmed = window.confirm(`Rollback presets to selected import snapshot?\n\n${contextText}\nSaved ${timeAgoShort(snapshot.savedAt || Date.now())}`);
  if (!confirmed) return;

  applyVolatilityPresetProfile(snapshot.profile);
  removeImportHistorySnapshotAt(Number(index) || 0);
  setPresetImportWarnings([], null);
  if (typeof showToast === 'function') showToast('↩️', 'Rolled back to selected pre-import preset state', 'var(--green)');
}

function rollbackLastVolatilityImport() {
  rollbackVolatilityImportAt(0);
}

function rollbackSelectedVolatilityImport() {
  const sel = document.getElementById('alerts-import-history-select');
  if (sel) setSelectedImportHistoryIndex(sel.value);
  rollbackVolatilityImportAt(_selectedImportHistoryIndex);
}

function setAlertsSourceFilter(source) {
  const safe = ALERT_SOURCES.includes(source) ? source : 'all';
  const changed = safe !== _alertsSourceFilter;
  _alertsSourceFilter = safe;
  localStorage.setItem('alerts-source-filter', safe);

  if (changed) {
    const presetMode = getVolatilityPresetForSource(safe);
    _alertsVolatilityMode = presetMode;
    localStorage.setItem('alerts-volatility-mode', presetMode);
  }

  refreshAlerts();
}

function setAlertsSortMode(mode) {
  const safe = ALERT_SORT_MODES.includes(mode) ? mode : 'severity';
  _alertsSortMode = safe;
  localStorage.setItem('alerts-sort-mode', safe);
  renderAlertsDrawer();
}

function setAlertsVolatilityMode(mode) {
  const safe = ALERT_VOLATILITY_MODES.includes(mode) ? mode : 'raw';
  _alertsVolatilityMode = safe;
  localStorage.setItem('alerts-volatility-mode', safe);
  refreshAlerts();
}

function toggleAlertGroupMembers(alertId) {
  const id = String(alertId || '');
  if (!id) return;
  _alertGroupExpanded[id] = !_alertGroupExpanded[id];
  renderAlertsDrawer();
}

function timeAgoShort(ts) {
  const delta = Math.max(0, Date.now() - Number(ts || 0));
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

const ALERT_NEW_WINDOW_MS = 2 * 60 * 1000;
function isAlertNew(alert, nowTs = Date.now()) {
  return !!(alert && alert.firstSeenAt && (nowTs - Number(alert.firstSeenAt)) < ALERT_NEW_WINDOW_MS);
}

function sparklineFromHistory(values) {
  const pts = Array.isArray(values) ? values.map(v => Number(v)).filter(Number.isFinite) : [];
  if (!pts.length) return '';
  if (pts.length === 1) return '▁';
  const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min;
  if (range <= 0.0001) return '▅'.repeat(Math.min(pts.length, INFRA_HISTORY_MAX));
  return pts.map((v) => {
    const idx = Math.max(0, Math.min(blocks.length - 1, Math.round(((v - min) / range) * (blocks.length - 1))));
    return blocks[idx];
  }).join('');
}

function computeVolatilityFromHistory(values, mode = 'raw') {
  const pts = Array.isArray(values) ? values.map(v => Number(v)).filter(Number.isFinite) : [];
  if (pts.length < 3) return { score: 0, flag: 'STABLE', basis: mode };
  const deltas = [];
  for (let i = 1; i < pts.length; i++) deltas.push(Math.abs(pts[i] - pts[i - 1]));
  const rawAvg = deltas.reduce((s, v) => s + v, 0) / (deltas.length || 1);
  let ewma = 0;
  const alpha = 0.35;
  deltas.forEach((d, i) => {
    ewma = i === 0 ? d : (alpha * d) + ((1 - alpha) * ewma);
  });
  const smoothDelta = mode === 'ewma' ? ewma : rawAvg;
  const score = Math.max(0, Math.min(100, Math.round((smoothDelta / 5) * 100)));
  let flag = 'STABLE';
  if (score >= 60) flag = 'SPIKY';
  else if (score >= 35) flag = 'NOISY';
  return { score, flag, basis: mode };
}

function renderAlertsDrawer() {
  const drawer = document.getElementById('alerts-drawer');
  const list = document.getElementById('alerts-drawer-list');
  const count = document.getElementById('alerts-drawer-count');
  const filters = document.getElementById('alerts-drawer-filters');
  const sort = document.getElementById('alerts-drawer-sort');
  const presets = document.getElementById('alerts-drawer-presets');
  if (!drawer || !list || !count || !filters || !sort || !presets) return;

  if (!_alertsDrawerOpen) {
    drawer.style.display = 'none';
    return;
  }

  drawer.style.display = 'block';
  const active = _activeAlertsCache || [];
  const counts = {
    all: active.length,
    infra: active.filter(a => a.source === 'infra').length,
    agent: active.filter(a => a.source === 'agent').length,
    performance: active.filter(a => a.source === 'performance').length,
  };
  const newCount = active.filter(a => isAlertNew(a)).length;
  count.textContent = `${active.length} active · ${newCount} new`;

  filters.innerHTML = ALERT_SOURCES.map((source) => {
    const selected = _alertsSourceFilter === source;
    const n = counts[source] || 0;
    return `<button onclick="setAlertsSourceFilter('${source}')" style="font-size:10px;padding:2px 8px;border-radius:999px;border:1px solid ${selected ? 'var(--accent)' : 'var(--border)'};background:${selected ? 'var(--accent-glow)' : 'transparent'};color:${selected ? 'var(--text)' : 'var(--dim)'};cursor:pointer;font-weight:${selected ? '700' : '600'}">${ALERT_SOURCE_LABELS[source]} (${n})</button>`;
  }).join('');

  const sortButtons = ALERT_SORT_MODES.map((mode) => {
    const selected = _alertsSortMode === mode;
    return `<button onclick="setAlertsSortMode('${mode}')" style="font-size:10px;padding:2px 8px;border-radius:999px;border:1px solid ${selected ? 'var(--purple)' : 'var(--border)'};background:${selected ? 'rgba(139,123,200,0.16)' : 'transparent'};color:${selected ? 'var(--text)' : 'var(--dim)'};cursor:pointer;font-weight:${selected ? '700' : '600'}">${escHtml(ALERT_SORT_LABELS[mode])}</button>`;
  }).join('');
  const volatilityButtons = ALERT_VOLATILITY_MODES.map((mode) => {
    const selected = _alertsVolatilityMode === mode;
    return `<button onclick="setAlertsVolatilityMode('${mode}')" style="font-size:10px;padding:2px 8px;border-radius:999px;border:1px solid ${selected ? 'var(--green)' : 'var(--border)'};background:${selected ? 'var(--green-dim)' : 'transparent'};color:${selected ? 'var(--text)' : 'var(--dim)'};cursor:pointer;font-weight:${selected ? '700' : '600'}">${escHtml(ALERT_VOLATILITY_LABELS[mode])}</button>`;
  }).join('');
  sort.innerHTML = `${sortButtons}<span style="font-size:10px;color:var(--dim);margin:0 2px">|</span>${volatilityButtons}`;

  const presetControls = ALERT_SOURCES.map((source) => {
    const currentPreset = getVolatilityPresetForSource(source);
    const defaultPreset = ALERT_SOURCE_VOLATILITY_PRESET_DEFAULTS[source] || 'raw';
    const isDefault = currentPreset === defaultPreset;
    const modifiedTs = Number(_alertsVolatilityPresetMeta[source]);
    const modifiedText = isDefault
      ? 'default'
      : (Number.isFinite(modifiedTs) && modifiedTs > 0 ? `updated ${timeAgoShort(modifiedTs)}` : 'custom');
    const options = ALERT_VOLATILITY_MODES.map((mode) => {
      const selected = currentPreset === mode ? 'selected' : '';
      return `<option value="${mode}" ${selected}>${mode.toUpperCase()}</option>`;
    }).join('');
    return `<div style="display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--dim);padding:2px 4px;border:1px solid var(--border);border-radius:8px;background:var(--glass)"><span style="font-weight:700">${escHtml(ALERT_SOURCE_LABELS[source])}</span><select onchange="setVolatilityPresetForSource('${source}', this.value)" style="font-size:10px;border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:6px;padding:2px 6px">${options}</select><button onclick="resetVolatilityPresetForSource('${source}')" ${isDefault ? 'disabled' : ''} style="font-size:9px;padding:1px 6px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--dim);cursor:${isDefault ? 'default' : 'pointer'};opacity:${isDefault ? '0.45' : '1'}">Reset</button><span style="font-size:9px;color:var(--dim);font-family:'SF Mono',Menlo,monospace">${escHtml(modifiedText)}</span></div>`;
  }).join('');
  const rollbackAvailable = hasImportHistory();
  normalizeImportHistorySelection();
  const latestSnapshot = getImportHistorySnapshot(0);
  const selectedSnapshot = getSelectedImportHistorySnapshot();
  const rollbackLabel = rollbackAvailable
    ? `Rollback latest (${timeAgoShort(latestSnapshot?.savedAt || Date.now())})`
    : 'Rollback latest';
  const historyOptions = _volatilityImportHistory.map((entry, idx) => {
    const version = entry?.context?.importedVersion;
    const changed = Number(entry?.context?.changed || 0);
    const verTxt = Number.isFinite(Number(version)) ? `v${version}` : 'v?';
    const chTxt = Number.isFinite(changed) ? `${changed}Δ` : 'Δ';
    const when = timeAgoShort(entry?.savedAt || Date.now());
    const selected = idx === _selectedImportHistoryIndex ? 'selected' : '';
    return `<option value="${idx}" ${selected}>#${idx + 1} · ${verTxt} · ${chTxt} · ${when}</option>`;
  }).join('');
  const rollbackPicker = `<select id="alerts-import-history-select" onchange="setSelectedImportHistoryIndex(this.value)" ${rollbackAvailable ? '' : 'disabled'} style="font-size:10px;border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:6px;padding:2px 6px;opacity:${rollbackAvailable ? '1' : '0.45'}">${historyOptions || '<option value="0">No history</option>'}</select><button onclick="rollbackSelectedVolatilityImport()" ${rollbackAvailable ? '' : 'disabled'} style="font-size:10px;padding:2px 8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--dim);cursor:${rollbackAvailable ? 'pointer' : 'default'};opacity:${rollbackAvailable ? '1' : '0.45'}">Restore selected</button>`;
  const selectedVersion = selectedSnapshot?.context?.importedVersion;
  const selectedChanged = Number(selectedSnapshot?.context?.changed || 0);
  const selectedWarnings = Number(selectedSnapshot?.context?.warningCount || 0);
  const selectedMetaPanel = rollbackAvailable
    ? `<div style="flex:1 1 100%;padding:6px 8px;border:1px solid var(--border);background:var(--glass);border-radius:8px;color:var(--dim);font-size:10px;line-height:1.35"><div style="font-weight:700">Rollback entry details</div><div>Saved ${timeAgoShort(selectedSnapshot?.savedAt || Date.now())}${Number.isFinite(Number(selectedVersion)) ? ` · imported v${selectedVersion}` : ''}</div><div>Changes: ${Number.isFinite(selectedChanged) ? selectedChanged : 0} · Warnings at import: ${Number.isFinite(selectedWarnings) ? selectedWarnings : 0}</div></div>`
    : '';
  const presetActions = `<button onclick="exportVolatilityPresetProfile()" style="font-size:10px;padding:2px 8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--dim);cursor:pointer">Export JSON</button><button onclick="importVolatilityPresetProfile()" style="font-size:10px;padding:2px 8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--dim);cursor:pointer">Import JSON</button><button onclick="rollbackLastVolatilityImport()" ${rollbackAvailable ? '' : 'disabled'} style="font-size:10px;padding:2px 8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--dim);cursor:${rollbackAvailable ? 'pointer' : 'default'};opacity:${rollbackAvailable ? '1' : '0.45'}">${escHtml(rollbackLabel)}</button>${rollbackPicker}${selectedMetaPanel}`;
  const importWarningBanner = _presetImportWarnings.length
    ? `<div style="flex:1 1 100%;padding:6px 8px;border:1px solid rgba(245,158,11,0.35);background:rgba(245,158,11,0.08);border-radius:8px;color:var(--dim);font-size:10px;line-height:1.35"><div style="font-weight:700;color:var(--orange)">⚠ Import compatibility warning${_presetImportWarnings.length > 1 ? 's' : ''}${_presetImportVersion ? ` (profile v${_presetImportVersion})` : ''}</div><ul style="margin:4px 0 0 14px;padding:0">${_presetImportWarnings.slice(0, 5).map((w) => `<li>${escHtml(w)}</li>`).join('')}${_presetImportWarnings.length > 5 ? `<li>+${_presetImportWarnings.length - 5} more...</li>` : ''}</ul><div style="margin-top:3px;font-size:9px;color:var(--dim)">Imported ${timeAgoShort(_presetImportAt)}</div></div>`
    : '';
  presets.innerHTML = `<span style="font-size:10px;color:var(--dim);font-weight:700;letter-spacing:0.4px;text-transform:uppercase">Volatility presets:</span>${presetActions}${importWarningBanner}${presetControls}`;

  const visible = _alertsSourceFilter === 'all'
    ? active.slice()
    : active.filter(a => a.source === _alertsSourceFilter);

  if (!active.length) {
    list.innerHTML = `<div style="padding:10px 12px;border:1px dashed var(--border);border-radius:8px;color:var(--dim);font-size:11px">No active alerts right now.</div>`;
    return;
  }

  if (!visible.length) {
    list.innerHTML = `<div style="padding:10px 12px;border:1px dashed var(--border);border-radius:8px;color:var(--dim);font-size:11px">No ${escHtml(ALERT_SOURCE_LABELS[_alertsSourceFilter] || _alertsSourceFilter)} alerts active right now.</div>`;
    return;
  }

  const severityRank = { critical: 0, warning: 1 };
  const sourceRank = { infra: 0, agent: 1, performance: 2 };
  visible.sort((a, b) => {
    if (_alertsSortMode === 'time') {
      return (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
    }
    if (_alertsSortMode === 'source') {
      const sr = (sourceRank[a.source] ?? 99) - (sourceRank[b.source] ?? 99);
      if (sr !== 0) return sr;
      const sev = (severityRank[a.severity] ?? 99) - (severityRank[b.severity] ?? 99);
      if (sev !== 0) return sev;
      return (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
    }
    const sev = (severityRank[a.severity] ?? 99) - (severityRank[b.severity] ?? 99);
    if (sev !== 0) return sev;
    return (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
  });

  list.innerHTML = visible.map((a) => {
    const sevColor = a.severity === 'critical' ? 'var(--red)' : 'var(--orange)';
    const sevBg = a.severity === 'critical' ? 'var(--red-dim)' : 'var(--orange-dim)';
    const srcLabel = ALERT_SOURCE_LABELS[a.source] || 'Unknown';
    const actionOnClick = a.action?.onClick ? String(a.action.onClick).replace(/"/g, '&quot;') : '';
    const actionBtn = actionOnClick
      ? `<button onclick="event.stopPropagation();${actionOnClick}" style="font-size:10px;padding:2px 8px;border-radius:6px;border:1px solid ${a.color || sevColor};background:transparent;color:${a.color || sevColor};cursor:pointer;font-weight:600">${escHtml(a.action.label || 'Action')}</button>`
      : '';
    const dismissBtn = `<button onclick="event.stopPropagation();dismissAlert('${escJsArg(a.id)}')" style="font-size:10px;padding:2px 8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--dim);cursor:pointer">Dismiss</button>`;
    const lastSeen = a.lastSeenAt ? timeAgoShort(a.lastSeenAt) : 'just now';
    const alertIsNew = isAlertNew(a);
    const freshnessBadge = alertIsNew
      ? `<span style="font-size:9px;padding:1px 6px;border-radius:999px;background:rgba(34,197,94,0.16);color:var(--green);font-weight:800;letter-spacing:0.5px;text-transform:uppercase">NEW</span>`
      : `<span style="font-size:9px;padding:1px 6px;border-radius:999px;background:rgba(148,163,184,0.14);color:var(--dim);font-weight:700;letter-spacing:0.4px;text-transform:uppercase">ONGOING</span>`;
    const groupedMembers = Array.isArray(a.groupedMembers)
      ? a.groupedMembers.map((m) => {
          const base = (typeof m === 'string')
            ? { label: m, severity: 'warning', icon: '•', trend: 'baseline', delta: null, hasPrev: false, history: [] }
            : {
                label: m.label || '',
                severity: m.severity || 'warning',
                icon: m.icon || '•',
                trend: m.trend || 'baseline',
                delta: Number.isFinite(Number(m.delta)) ? Number(m.delta) : null,
                hasPrev: !!m.hasPrev,
                history: Array.isArray(m.history) ? m.history.map(v => Number(v)).filter(Number.isFinite) : [],
              };
          const vol = computeVolatilityFromHistory(base.history, _alertsVolatilityMode);
          return {
            ...base,
            volatilityScore: vol.score,
            volatilityFlag: vol.flag,
            volatilityBasis: vol.basis,
          };
        }).filter(m => !!m.label)
      : [];
    const hasGroupMembers = groupedMembers.length > 0;
    const groupExpanded = hasGroupMembers && !!_alertGroupExpanded[a.id];
    const criticalMembers = groupedMembers.filter(m => m.severity === 'critical').length;
    const warnMembers = groupedMembers.length - criticalMembers;
    const noisyMembers = groupedMembers.filter(m => (m.volatilityFlag === 'SPIKY' || m.volatilityFlag === 'NOISY')).length;
    const groupSeveritySummary = hasGroupMembers
      ? `<span style="font-size:9px;padding:1px 6px;border-radius:999px;background:rgba(148,163,184,0.14);color:var(--dim);font-weight:700;letter-spacing:0.4px;text-transform:uppercase">members: ${criticalMembers} crit · ${warnMembers} warn</span>`
      : '';
    const volatilityModeLabel = _alertsVolatilityMode === 'ewma' ? 'EWMA' : 'RAW';
    const groupVolatilitySummary = hasGroupMembers
      ? `<span style="font-size:9px;padding:1px 6px;border-radius:999px;background:rgba(245,158,11,0.14);color:var(--orange);font-weight:700;letter-spacing:0.4px;text-transform:uppercase">volatility(${volatilityModeLabel}): ${noisyMembers} noisy</span>`
      : '';
    const groupToggleBtn = hasGroupMembers
      ? `<button onclick="event.stopPropagation();toggleAlertGroupMembers('${escJsArg(a.id)}')" style="font-size:10px;padding:2px 8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--dim);cursor:pointer">${groupExpanded ? 'Hide' : 'Show'} members (${groupedMembers.length})</button>`
      : '';
    const groupDetails = (hasGroupMembers && groupExpanded)
      ? `<span style="font-size:10px;color:var(--dim);line-height:1.35;display:block">${groupedMembers.map((m) => {
          const mCrit = m.severity === 'critical';
          const chipBg = mCrit ? 'var(--red-dim)' : 'var(--orange-dim)';
          const chipColor = mCrit ? 'var(--red)' : 'var(--orange)';
          const chipText = mCrit ? 'CRIT' : 'WARN';
          let trendText = 'baseline';
          let trendColor = 'var(--dim)';
          if (m.hasPrev) {
            const d = Number(m.delta || 0);
            if (m.trend === 'up') { trendText = `↗ ${d.toFixed(1)} pts`; trendColor = 'var(--red)'; }
            else if (m.trend === 'down') { trendText = `↘ ${Math.abs(d).toFixed(1)} pts`; trendColor = 'var(--green)'; }
            else { trendText = '→ 0.0 pts'; trendColor = 'var(--dim)'; }
          }
          const sparkline = sparklineFromHistory(m.history || []);
          const sparklineHtml = sparkline
            ? `<span style="display:inline-block;margin-left:6px;color:var(--dim);font-size:10px;letter-spacing:0.5px;font-family:'SF Mono',Menlo,monospace" title="Recent metric mini-history">${escHtml(sparkline)}</span>`
            : '';
          const volFlag = String(m.volatilityFlag || 'STABLE');
          const volScore = Math.max(0, Math.min(100, Number(m.volatilityScore) || 0));
          let volBadge = '';
          if (volFlag === 'SPIKY' || volFlag === 'NOISY') {
            const vbColor = volFlag === 'SPIKY' ? 'var(--red)' : 'var(--orange)';
            const vbBg = volFlag === 'SPIKY' ? 'var(--red-dim)' : 'var(--orange-dim)';
            const vbMode = _alertsVolatilityMode === 'ewma' ? 'EWMA' : 'RAW';
            volBadge = `<span title="Volatility ${vbMode}" style="font-size:9px;padding:1px 6px;border-radius:999px;background:${vbBg};color:${vbColor};font-weight:800;letter-spacing:0.4px;text-transform:uppercase;margin-left:6px">${escHtml(volFlag)} ${Math.round(volScore)}</span>`;
          }
          return `<span style="display:block;margin-top:2px"><span style="font-size:9px;padding:1px 6px;border-radius:999px;background:${chipBg};color:${chipColor};font-weight:700;letter-spacing:0.4px;text-transform:uppercase;margin-right:6px">${chipText}</span>${escHtml(m.icon)} ${escHtml(m.label)} <span style="color:${trendColor};font-size:9px;font-family:'SF Mono',Menlo,monospace">${escHtml(trendText)}</span>${volBadge}${sparklineHtml}</span>`;
        }).join('')}</span>`
      : '';
    return `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;background:var(--glass);border:1px solid var(--border);border-left:3px solid ${sevColor};border-radius:8px">
      <span style="font-size:13px;line-height:1.2">${escHtml(a.icon || '⚠️')}</span>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-size:9px;padding:1px 6px;border-radius:999px;background:${sevBg};color:${sevColor};font-weight:700;letter-spacing:0.4px;text-transform:uppercase">${a.severity === 'critical' ? 'critical' : 'warning'}</span>
          <span style="font-size:9px;padding:1px 6px;border-radius:999px;background:rgba(148,163,184,0.14);color:var(--dim);font-weight:700;letter-spacing:0.4px;text-transform:uppercase">${escHtml(srcLabel)}</span>
          ${freshnessBadge}
          ${groupSeveritySummary}
          ${groupVolatilitySummary}
          <span style="font-size:9px;color:var(--dim);font-family:'SF Mono',Menlo,monospace">seen ${escHtml(lastSeen)}</span>
          <span style="font-size:11px;color:var(--text);font-weight:600;line-height:1.35">${escHtml(a.text || '')}</span>
          ${groupDetails}
        </div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">${groupToggleBtn}${actionBtn}${dismissBtn}</div>
    </div>`;
  }).join('');
}


// Performance data cache for alert checks
let _perfAlertData = null;
async function fetchPerfForAlerts() {
  try {
    const r = await fetchWithTimeout(API + '/performance', {}, 10000);
    _perfAlertData = await r.json();
  } catch { _perfAlertData = null; }
}
// Perf data for alerts refreshed in consolidated 5s poll (every 12th tick = 60s)
fetchPerfForAlerts();

function refreshAlerts() {
  const now = Date.now();
  // Clean expired dismissals
  for (const k in _dismissedAlerts) { if (_dismissedAlerts[k] < now) delete _dismissedAlerts[k]; }

  const alerts = []; // { id, icon, text, color, severity, action? }

  // CPU alert
  const cpuEl = document.getElementById('ss-cpu');
  if (cpuEl) {
    const cpuPct = parseFloat(cpuEl.textContent);
    if (cpuPct > 80) alerts.push({ id:'cpu-crit', icon:'🔥', text:`CPU ${cpuPct}%`, color:'var(--red)', severity:'critical', source:'infra', groupKey:'infra-spike', memberLabel:`CPU ${cpuPct}%`, memberKey:'cpu', memberValue:cpuPct });
    else if (cpuPct > 60) alerts.push({ id:'cpu-warn', icon:'⚠️', text:`CPU ${cpuPct}%`, color:'var(--orange)', severity:'warning', source:'infra', groupKey:'infra-spike', memberLabel:`CPU ${cpuPct}%`, memberKey:'cpu', memberValue:cpuPct });
  }

  // Memory alert
  const memEl = document.getElementById('ss-mem');
  if (memEl) {
    const memPct = parseFloat(memEl.textContent);
    if (memPct > 90) alerts.push({ id:'mem-crit', icon:'🧠', text:`MEM ${memPct}%`, color:'var(--red)', severity:'critical', source:'infra', groupKey:'infra-spike', memberLabel:`MEM ${memPct}%`, memberKey:'mem', memberValue:memPct });
    else if (memPct > 75) alerts.push({ id:'mem-warn', icon:'🧠', text:`MEM ${memPct}%`, color:'var(--orange)', severity:'warning', source:'infra', groupKey:'infra-spike', memberLabel:`MEM ${memPct}%`, memberKey:'mem', memberValue:memPct });
  }

  // Disk alert
  const diskEl = document.getElementById('ss-disk');
  if (diskEl) {
    const diskPct = parseInt(diskEl.textContent);
    if (diskPct > 90) alerts.push({ id:'disk-crit', icon:'💾', text:`Disk ${diskPct}%`, color:'var(--red)', severity:'critical', source:'infra', groupKey:'infra-spike', memberLabel:`Disk ${diskPct}%`, memberKey:'disk', memberValue:diskPct });
    else if (diskPct > 80) alerts.push({ id:'disk-warn', icon:'💾', text:`Disk ${diskPct}%`, color:'var(--orange)', severity:'warning', source:'infra', groupKey:'infra-spike', memberLabel:`Disk ${diskPct}%`, memberKey:'disk', memberValue:diskPct });
  }

  // Service alerts
  if (_cachedSystem && _cachedSystem.services) {
    _cachedSystem.services.forEach(s => {
      if (s.status !== 'running') alerts.push({ id:`svc-${s.name}`, icon:'🔌', text:`${s.name} down`, color:'var(--red)', severity:'critical', source:'infra' });
    });
  }

  // Agent alerts: stale-working + sleeping too long + failed cron runs
  if (agentData.length) {
    agentData.forEach(a => {
      const ageMin = Number(a.ageMin || 0);
      const wakeOnClick = a.cronJobId
        ? `wakeAgentFromAlert('${escJsArg(a.cronJobId)}','${escJsArg(a.name)}')`
        : null;

      // Stale working alert: agent marked working but no fresh activity
      if (a.status === 'working' && ageMin >= 12) {
        const critical = ageMin >= 25;
        const msgPreview = summarizeAlertMessage(a.lastMessage);
        alerts.push({
          id: `stale-working-${a.name}`,
          icon: critical ? '🚨' : '⏳',
          text: `${a.name} marked working but quiet ${formatAgeCompact(ageMin)}${msgPreview ? ` — ${msgPreview}` : ''}`,
          color: critical ? 'var(--red)' : 'var(--orange)',
          severity: critical ? 'critical' : 'warning',
          source: 'agent',
          action: {
            label: 'Inspect',
            onClick: `if(typeof openAgentDetail==='function'){openAgentDetail('${escJsArg(a.name)}');}`,
          },
        });
      }

      // Sleeping agents with cron jobs
      if (a.status === 'sleeping' && a.cronJobId) {
        if (ageMin > 360) {
          alerts.push({
            id:`sleep-${a.name}`,
            icon:'😴',
            text:`${a.name} sleeping ${Math.round(ageMin/60)}h`,
            color:'var(--red)',
            severity:'critical',
            source:'agent',
            action: wakeOnClick ? { label:'Wake', onClick: wakeOnClick } : null,
          });
        } else if (ageMin > 120) {
          alerts.push({
            id:`sleep-${a.name}`,
            icon:'💤',
            text:`${a.name} sleeping ${Math.round(ageMin/60)}h`,
            color:'var(--orange)',
            severity:'warning',
            source:'agent',
            action: wakeOnClick ? { label:'Wake', onClick: wakeOnClick } : null,
          });
        }
      }

      // Check cron status for errors
      if (a.cronStatus && (a.cronStatus === 'error' || a.cronStatus === 'fail')) {
        alerts.push({
          id:`cron-err-${a.name}`,
          icon:'❌',
          text:`${a.name} last run failed`,
          color:'var(--red)',
          severity:'critical',
          source:'agent',
          action: wakeOnClick ? { label:'Retry', onClick: wakeOnClick } : null,
        });
      }
    });
  }

  // Performance alerts: agents with <50% success rate
  if (_perfAlertData && _perfAlertData.agents) {
    _perfAlertData.agents.forEach(pa => {
      if (pa.total >= 3 && pa.successRate < 50) {
        alerts.push({ id:`perf-${pa.name}`, icon:'📉', text:`${pa.name} ${pa.successRate}% success (${pa.failed} failures)`, color:'var(--red)', severity:'critical', source:'performance' });
      } else if (pa.total >= 5 && pa.successRate < 80) {
        alerts.push({ id:`perf-${pa.name}`, icon:'📊', text:`${pa.name} ${pa.successRate}% success rate`, color:'var(--orange)', severity:'warning', source:'performance' });
      }
    });
  }

  // Collapse related infra spike alerts (CPU/MEM/Disk) to reduce noise
  const dedupedAlerts = collapseInfraSpikeAlerts(alerts);

  // Filter dismissed
  const active = dedupedAlerts.filter(a => !_dismissedAlerts[a.id]);

  // Track first/last seen timestamps for sorting + operator context
  active.forEach((a) => {
    if (!_alertSeenAt[a.id]) _alertSeenAt[a.id] = now;
    _alertLastAt[a.id] = now;
    a.firstSeenAt = _alertSeenAt[a.id];
    a.lastSeenAt = _alertLastAt[a.id];
  });
  const activeIds = new Set(active.map(a => a.id));
  for (const id in _alertLastAt) {
    if (activeIds.has(id)) continue;
    if ((now - _alertLastAt[id]) > 6 * 3600 * 1000) {
      delete _alertLastAt[id];
      delete _alertSeenAt[id];
    }
  }
  for (const id in _alertGroupExpanded) {
    if (!activeIds.has(id)) delete _alertGroupExpanded[id];
  }

  // Sort: critical first for top banner selection
  active.sort((a, b) => (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1));

  _activeAlertsCache = active.slice();
  if (!active.length) _alertsDrawerOpen = false;
  renderAlertsDrawer();

  const banner = document.getElementById('alerts-banner');
  const content = document.getElementById('alerts-content');

  if (active.length) {
    // Color banner based on max severity (collapsed view)
    const hasCritical = active.some(a => a.severity === 'critical');
    banner.style.background = hasCritical ? 'var(--red-dim)' : 'rgba(245,158,11,0.08)';
    banner.style.borderBottomColor = hasCritical ? 'rgba(255,51,102,0.3)' : 'rgba(245,158,11,0.3)';
    banner.style.cursor = 'pointer';
    banner.onclick = () => openAlertsDrawer();

    const first = active[0];
    const extra = active.length > 1 ? ` +${active.length - 1} more` : '';
    const firstIsNew = isAlertNew(first);
    const freshnessBadge = firstIsNew
      ? `<span style="font-size:9px;padding:1px 6px;border-radius:999px;background:rgba(34,197,94,0.16);color:var(--green);font-weight:800;letter-spacing:0.5px;text-transform:uppercase">NEW</span>`
      : `<span style="font-size:9px;padding:1px 6px;border-radius:999px;background:rgba(148,163,184,0.14);color:var(--dim);font-weight:700;letter-spacing:0.4px;text-transform:uppercase">ONGOING</span>`;
    const actionBtn = first.action?.onClick ? `<button onclick="event.stopPropagation();${first.action.onClick}" style="font-size:9px;padding:1px 6px;border-radius:4px;border:1px solid ${first.color};background:transparent;color:${first.color};cursor:pointer;font-weight:600;margin-left:6px;transition:background .15s" onmouseenter="this.style.background=this.style.borderColor+'22'" onmouseleave="this.style.background='transparent'">${escHtml(first.action.label || 'Action')}</button>` : '';
    const detailsBtn = `<button onclick="event.stopPropagation();openAlertsDrawer()" style="font-size:9px;padding:1px 6px;border-radius:4px;border:1px solid var(--border);background:transparent;color:var(--dim);cursor:pointer;font-weight:600;margin-left:6px">Details (${active.length})</button>`;
    const dismissBtn = `<button onclick="event.stopPropagation();dismissAlert('${escJsArg(first.id)}')" style="font-size:9px;padding:0 3px;border:none;background:transparent;color:var(--dim);cursor:pointer;opacity:0.6;transition:opacity .15s" onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.6'" title="Dismiss for 30min">✕</button>`;
    content.innerHTML = `<span style="font-size:10px;color:var(--dim);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;flex-shrink:0">Alerts</span>` +
      `<span style="display:inline-flex;align-items:center;gap:6px;color:${first.color};font-weight:600;flex-shrink:0">${escHtml(first.icon || '⚠️')} ${escHtml(first.text || '')}${freshnessBadge}<span style=\"color:var(--dim)\">${escHtml(extra)}</span>${detailsBtn}${actionBtn}${dismissBtn}</span>`;
    banner.style.display = 'block';

    // Push critical alerts to notification center + browser notification (once per alert)
    active.filter(a => a.severity === 'critical').forEach(a => {
      const nKey = 'alert-notif-' + a.id;
      if (!window[nKey]) {
        window[nKey] = true;
        addNotification(`${a.icon} ${a.text}`, a.color);
        sendBrowserNotification(`🚨 ${a.text}`, a.icon);
        setTimeout(() => { window[nKey] = false; }, 300000);
      }
    });
  } else {
    banner.style.display = 'none';
    banner.onclick = null;
    banner.style.cursor = 'default';
  }
}
// Alert refresh + tab title update handled in consolidated 5s poll above
// (refreshAlerts and updateTabTitle called each tick)

// ===== BROWSER NOTIFICATIONS (for critical alerts when tab is backgrounded) =====
let _browserNotifsEnabled = false;
async function requestBrowserNotifs() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') { _browserNotifsEnabled = true; return; }
  if (Notification.permission !== 'denied') {
    const perm = await Notification.requestPermission();
    _browserNotifsEnabled = perm === 'granted';
  }
}
requestBrowserNotifs();

function sendBrowserNotification(body, icon) {
  if (!_browserNotifsEnabled || document.hasFocus()) return; // only when tab is not focused
  try {
    const n = new Notification('⚡ Agent Space', { body, icon: '/favicon.ico', tag: body.slice(0, 40), renotify: false, silent: false });
    n.onclick = () => { window.focus(); n.close(); };
    setTimeout(() => n.close(), 15000);
  } catch {}
}

// ===== FAVICON BADGE =====
function updateFaviconBadge(activeCount, isCritical) {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });

  // Background circle
  if (isCritical) {
    ctx.fillStyle = '#ef4444';
  } else if (activeCount > 0) {
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, '#3b82f6'); g.addColorStop(1, '#8b5cf6');
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = '#475569';
  }
  ctx.beginPath(); ctx.arc(size/2, size/2, size/2, 0, Math.PI*2); ctx.fill();

  // Inner icon
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (isCritical) {
    ctx.font = 'bold 36px system-ui';
    ctx.fillText('!', size/2, size/2+2);
  } else if (activeCount > 0) {
    ctx.font = 'bold 32px system-ui';
    ctx.fillText('⚡', size/2, size/2+2);
    // Badge count
    const badgeR = 14;
    const bx = size - badgeR, by = badgeR;
    ctx.beginPath(); ctx.arc(bx, by, badgeR, 0, Math.PI*2);
    ctx.fillStyle = '#22c55e'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `bold ${activeCount > 9 ? 14 : 18}px system-ui`;
    ctx.fillText(String(activeCount), bx, by+1);
  } else {
    ctx.font = '36px system-ui';
    ctx.fillText('💤', size/2, size/2+2);
  }

  const link = document.querySelector("link[rel='icon']");
  if (link) link.href = c.toDataURL('image/png');
}

// ===== DYNAMIC TAB TITLE =====
let _lastFaviconState = '';
function updateTabTitle() {
  if (!agentData.length) return;
  const w = agentData.filter(a => a.status === 'working').length;
  const i = agentData.filter(a => a.status === 'idle').length;
  const s = agentData.filter(a => a.status === 'sleeping').length;
  const alertBanner = document.getElementById('alerts-banner');
  const hasAlerts = alertBanner && alertBanner.style.display !== 'none';
  const hasCritical = hasAlerts && alertBanner.style.background?.includes('red');
  let prefix = '';
  if (hasCritical) prefix = `🚨 `;
  else if (w > 0) prefix = `(${w}⚡) `;
  document.title = `${prefix}Agent Space`;
  // Update favicon with active agent count badge (canvas-rendered)
  const newState = hasCritical ? 'alert' : w > 0 ? 'active:'+w : 'idle';
  if (newState !== _lastFaviconState) {
    _lastFaviconState = newState;
    updateFaviconBadge(w, hasCritical);
  }
}
// Tab title updated in consolidated 5s poll

connectSSE();

// Initial data fetch so quickstats show real values immediately (don't wait for SSE)
(async function fetchInitialStats() {
  try {
    const [tokRes, memRes, agRes] = await Promise.all([
      fetch('/api/tokens').then(r => r.json()).catch(() => null),
      fetch('/api/memory').then(r => r.json()).catch(() => null),
      fetch('/api/agents').then(r => r.json()).catch(() => null),
    ]);
    if (tokRes) {
      const total = (tokRes.totals?.input||0) + (tokRes.totals?.output||0);
      const tokLabel = total > 1e6 ? (total/1e6).toFixed(1)+'M' : total > 1e3 ? (total/1e3).toFixed(0)+'K' : String(total);
      const qst = document.getElementById('qs-tokens'); if(qst) qst.textContent = tokLabel;
      const qsc = document.getElementById('qs-cost'); if(qsc) qsc.textContent = '$' + (tokRes.estimatedCostUSD||0).toFixed(2);
    }
    if (memRes) {
      const qsm = document.getElementById('qs-memories'); if(qsm) qsm.textContent = (memRes.totalPoints||memRes.count||0).toLocaleString();
    }
    if (agRes && Array.isArray(agRes)) {
      const active = agRes.filter(a => a.status === 'working').length;
      const qsw = document.getElementById('qs-wrs'); if(qsw) { qsw.textContent = String(active); qsw.style.color = active > 0 ? 'var(--green)' : 'var(--dim)'; }
    }
  } catch(e) { /* SSE will fill in later */ }
})();
