/**
 * ============================================================================
 * HEISENBERG LAB SUPPLY INTELLIGENCE - MAIN APPLICATION LOGIC
 * ============================================================================
 * 
 * Technology: Vanilla JavaScript ES6 (Modular)
 * Cloud Integration: Firebase Cloud Firestore + Firebase Hosting
 * Pricing: ₹0 Free Tier (Spark Plan compliant - No Cloud Functions)
 * ============================================================================
 */

import { CloudService } from "./firebase-config.js";

// ============================================================================
// GLOBAL APPLICATION STATE
// ============================================================================
let chemicals = [];
let suppliers = [];
let transactions = [];
let alerts = [];

let categoryChartInstance = null;
let healthChartInstance = null;

// ============================================================================
// INVENTORY INTELLIGENCE RULES ENGINE
// ============================================================================

/**
 * Rule 1: Stock Status Determination
 * - Normal: quantity >= minimumStock
 * - Low: minimumStock * 0.5 <= quantity < minimumStock
 * - Critical: quantity < minimumStock * 0.5
 */
export function calculateStockStatus(quantity, minimumStock) {
  const qty = Number(quantity);
  const min = Number(minimumStock);
  
  if (qty < min * 0.5) {
    return "CRITICAL";
  } else if (qty < min) {
    return "LOW";
  } else {
    return "NORMAL";
  }
}

/**
 * Rule 2: Expiry Detection
 * - If expiry date is within 30 days from today -> EXPIRING_SOON
 */
export function getDaysUntilExpiry(expiryDateStr) {
  if (!expiryDateStr) return 999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDateStr);
  const diffTime = expiry - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Rule 3: Reorder Recommendation Calculation
 * - recommendedOrder = Math.max(0, maximumStock - currentQuantity)
 * - Returns 0 if current stock is at or above maximum target
 */
export function calculateRecommendedOrder(currentQuantity, maximumStock) {
  const current = Number(currentQuantity);
  const max = Number(maximumStock);
  if (current >= max) return 0;
  return Math.max(0, parseFloat((max - current).toFixed(2)));
}

/**
 * Generate human-readable, consistent document ID based on chemical name
 * Examples:
 *   - "Acetone" -> "Acetone"
 *   - "Sodium Chloride" -> "Sodium_Chloride"
 *   - "Hydrochloric Acid" -> "Hydrochloric_Acid"
 * Handles duplicate names, invalid characters, and retry attempts safely.
 */
export function generateChemicalId(name, attempt = 1) {
  const formatted = (name || "Chemical")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : "")
    .join("_");

  const baseId = (formatted.slice(0, 64).replace(/_+$/g, "")) || "Chemical";

  // If this is a collision retry attempt (attempt > 1), start candidate with attempt counter
  let candidate = attempt > 1 ? `${baseId}_${attempt}` : baseId;
  let counter = attempt > 1 ? attempt : 1;

  // Check against locally loaded chemicals array
  while (chemicals.some(c => c.id === candidate)) {
    counter++;
    candidate = `${baseId}_${counter}`;
  }

  return candidate;
}

/**
 * Generate human-readable, consistent slug ID with entropy suffix for new suppliers (e.g. supp_gray_matter_a9b3)
 */
export function generateSupplierId(name) {
  const slug = (name || "vendor")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  const entropy = Math.random().toString(36).substring(2, 6);
  const baseId = `supp_${slug || "vendor"}_${entropy}`;
  let candidate = baseId;
  let counter = 1;
  while (suppliers.some(s => s.id === candidate)) {
    counter++;
    candidate = `${baseId}_${counter}`;
  }
  return candidate;
}

// ============================================================================
// UI NOTIFICATIONS (TOASTS)
// ============================================================================
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  
  let icon = "ℹ️";
  if (type === "success") icon = "✅";
  if (type === "error") icon = "❌";
  if (type === "warning") icon = "⚠️";

  toast.innerHTML = `
    <span style="font-size: 1.1rem;">${icon}</span>
    <div style="flex: 1;">
      <div style="font-weight: 600;">${message}</div>
      <div style="font-size: 0.7rem; color: var(--text-dim); margin-top: 2px;">${new Date().toLocaleTimeString()}</div>
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "slideInToast 0.3s ease reverse forwards";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================================================
// UI RENDERING FUNCTIONS
// ============================================================================

/**
 * Update the 5 Top Summary Metric Cards
 */
function updateDashboardStats() {
  const total = chemicals.length;
  let normalCount = 0;
  let lowCount = 0;
  let criticalCount = 0;
  let expiringCount = 0;

  chemicals.forEach(chem => {
    const status = calculateStockStatus(chem.quantity, chem.minimumStock);
    if (status === "CRITICAL") criticalCount++;
    else if (status === "LOW") lowCount++;
    else normalCount++;

    const daysLeft = getDaysUntilExpiry(chem.expiryDate);
    if (daysLeft >= 0 && daysLeft <= 30) {
      expiringCount++;
    }
  });

  document.getElementById("stat-total-chemicals").textContent = total;
  document.getElementById("stat-normal-stock").textContent = normalCount;
  document.getElementById("stat-low-stock").textContent = lowCount;
  document.getElementById("stat-critical-stock").textContent = criticalCount;
  document.getElementById("stat-expiring-soon").textContent = expiringCount;

  // Badges in tabs
  document.getElementById("badge-total-chemicals").textContent = total;
  
  const reorderCount = chemicals.filter(c => calculateStockStatus(c.quantity, c.minimumStock) !== "NORMAL").length;
  document.getElementById("badge-reorder-count").textContent = reorderCount;
  
  const activeAlerts = alerts.filter(a => !a.resolved);
  document.getElementById("badge-alerts-count").textContent = activeAlerts.length;
  document.getElementById("badge-trans-count").textContent = transactions.length;
  document.getElementById("badge-supp-count").textContent = suppliers.length;
}

/**
 * Render the Main Chemical Inventory Table
 */
function renderInventoryTable() {
  const tbody = document.getElementById("inventory-table-body");
  if (!tbody) return;

  const searchTerm = (document.getElementById("inventory-search")?.value || "").toLowerCase();
  const categoryFilter = document.getElementById("filter-category")?.value || "ALL";
  const statusFilter = document.getElementById("filter-status")?.value || "ALL";

  const filtered = chemicals.filter(chem => {
    const matchSearch = chem.name.toLowerCase().includes(searchTerm) || 
                        (chem.storageLocation && chem.storageLocation.toLowerCase().includes(searchTerm));
    const matchCat = categoryFilter === "ALL" || chem.category === categoryFilter;
    
    const computedStatus = calculateStockStatus(chem.quantity, chem.minimumStock);
    const daysLeft = getDaysUntilExpiry(chem.expiryDate);
    const isExpiring = daysLeft >= 0 && daysLeft <= 30;

    let matchStatus = true;
    if (statusFilter === "NORMAL") matchStatus = (computedStatus === "NORMAL");
    if (statusFilter === "LOW") matchStatus = (computedStatus === "LOW");
    if (statusFilter === "CRITICAL") matchStatus = (computedStatus === "CRITICAL");
    if (statusFilter === "EXPIRING_SOON") matchStatus = isExpiring;

    return matchSearch && matchCat && matchStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; padding: 2.5rem; color: var(--text-dim);">
          No chemical records match current filters. Click <strong>Seed Sample Lab Data</strong> or <strong>Add Chemical</strong>.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(chem => {
    const status = calculateStockStatus(chem.quantity, chem.minimumStock);
    const daysLeft = getDaysUntilExpiry(chem.expiryDate);
    const isExpiring = daysLeft >= 0 && daysLeft <= 30;
    const isExpired = daysLeft < 0;
    const reorderQty = calculateRecommendedOrder(chem.quantity, chem.maximumStock);

    let statusBadge = `<span class="badge badge-normal">NORMAL</span>`;
    if (status === "CRITICAL") {
      statusBadge = `<span class="badge badge-critical">🚨 CRITICAL</span>`;
    } else if (status === "LOW") {
      statusBadge = `<span class="badge badge-low">⚠️ LOW</span>`;
    }

    let expiryDisplay = `${chem.expiryDate || 'N/A'}`;
    if (isExpired) {
      expiryDisplay += ` <span class="badge badge-critical" style="font-size:0.6rem;">EXPIRED</span>`;
    } else if (isExpiring) {
      expiryDisplay += ` <span class="badge badge-expiring" style="font-size:0.6rem;">${daysLeft}d left</span>`;
    }

    const supplierObj = suppliers.find(s => s.id === chem.supplierId);
    const supplierName = supplierObj ? supplierObj.name : "Unassigned";

    return `
      <tr>
        <td>
          <div class="chemical-name-cell">
            <span class="chemical-title">${escapeHtml(chem.name)}</span>
            <span class="chemical-sub">${supplierName}</span>
          </div>
        </td>
        <td><span class="badge badge-info">${chem.category || 'General'}</span></td>
        <td style="font-weight: 700; font-size: 0.95rem; font-family: 'JetBrains Mono', monospace;">
          ${chem.quantity}
        </td>
        <td>${chem.unit}</td>
        <td>
          <span style="color: var(--status-low);">${chem.minimumStock}</span> / 
          <span style="color: var(--text-muted);">${chem.maximumStock}</span> ${chem.unit}
        </td>
        <td>${expiryDisplay}</td>
        <td><span style="font-family: monospace; font-size: 0.75rem;">${escapeHtml(chem.storageLocation || 'Cabinet')}</span></td>
        <td>${statusBadge}</td>
        <td>
          ${reorderQty > 0 ? `<span class="reorder-qty">+${reorderQty} ${chem.unit}</span>` : `<span style="color: var(--text-dim);">-</span>`}
        </td>
        <td style="text-align: right;">
          <div class="action-buttons-group" style="justify-content: flex-end;">
            <button class="btn btn-secondary btn-sm" onclick="window.quickStockIn('${chem.id}')" title="Stock IN">
              ➕ IN
            </button>
            <button class="btn btn-secondary btn-sm" onclick="window.quickStockOut('${chem.id}')" title="Stock OUT">
              ➖ OUT
            </button>
            <button class="btn btn-secondary btn-icon btn-sm" onclick="window.editChemical('${chem.id}')" title="Edit">
              ✏️
            </button>
            <button class="btn btn-danger btn-icon btn-sm" onclick="window.deleteChemical('${chem.id}')" title="Delete">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

/**
 * Render Reorder Intelligence Recommendations Table
 */
function renderReorderIntelligence() {
  const tbody = document.getElementById("reorder-table-body");
  const overviewTbody = document.getElementById("overview-reorder-body");
  if (!tbody) return;

  const itemsNeedingReorder = chemicals.filter(chem => {
    const status = calculateStockStatus(chem.quantity, chem.minimumStock);
    return status === "CRITICAL" || status === "LOW";
  });

  // Sort critical first
  itemsNeedingReorder.sort((a, b) => {
    const statA = calculateStockStatus(a.quantity, a.minimumStock);
    const statB = calculateStockStatus(b.quantity, b.minimumStock);
    if (statA === "CRITICAL" && statB !== "CRITICAL") return -1;
    if (statB === "CRITICAL" && statA !== "CRITICAL") return 1;
    return (a.quantity / a.minimumStock) - (b.quantity / b.minimumStock);
  });

  if (itemsNeedingReorder.length === 0) {
    const emptyRow = `<tr><td colspan="9" style="text-align:center; padding: 2rem; color: var(--status-normal);">✨ All chemical inventories are adequately stocked! No reorders needed.</td></tr>`;
    tbody.innerHTML = emptyRow;
    if (overviewTbody) overviewTbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-dim);">No urgent reorders required.</td></tr>`;
    return;
  }

  tbody.innerHTML = itemsNeedingReorder.map(chem => {
    const status = calculateStockStatus(chem.quantity, chem.minimumStock);
    const reorderQty = calculateRecommendedOrder(chem.quantity, chem.maximumStock);
    const deficit = Math.max(0, chem.minimumStock - chem.quantity);
    const supplierObj = suppliers.find(s => s.id === chem.supplierId);
    const supplierName = supplierObj ? `${supplierObj.name} (${supplierObj.contact})` : "General Lab Supplier";

    const badge = status === "CRITICAL" ? 
      `<span class="badge badge-critical">🚨 CRITICAL</span>` : 
      `<span class="badge badge-low">⚠️ LOW</span>`;

    return `
      <tr>
        <td style="font-weight: 600;">${escapeHtml(chem.name)}</td>
        <td>${badge}</td>
        <td style="font-family: monospace;">${chem.quantity} ${chem.unit}</td>
        <td style="color: var(--status-low);">${chem.minimumStock} ${chem.unit}</td>
        <td style="color: var(--text-muted);">${chem.maximumStock} ${chem.unit}</td>
        <td style="color: #f87171; font-weight: 600;">-${deficit} ${chem.unit}</td>
        <td style="font-weight: 700; color: var(--accent-primary); font-size: 0.95rem;">
          +${reorderQty} ${chem.unit}
        </td>
        <td style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(supplierName)}</td>
        <td>
          <button class="btn btn-success btn-sm" onclick="window.executeSimulatedOrder('${chem.id}', ${reorderQty})">
            🚀 Restock ${reorderQty} ${chem.unit}
          </button>
        </td>
      </tr>
    `;
  }).join("");

  // Overview snapshot (first 4 items)
  if (overviewTbody) {
    overviewTbody.innerHTML = itemsNeedingReorder.slice(0, 4).map(chem => {
      const reorderQty = calculateRecommendedOrder(chem.quantity, chem.maximumStock);
      return `
        <tr>
          <td style="font-weight: 600;">${escapeHtml(chem.name)}</td>
          <td style="font-family: monospace;">${chem.quantity} ${chem.unit}</td>
          <td>${chem.minimumStock} / ${chem.maximumStock} ${chem.unit}</td>
          <td style="font-weight: 700; color: var(--accent-primary);">+${reorderQty} ${chem.unit}</td>
          <td>
            <button class="btn btn-success btn-sm" onclick="window.executeSimulatedOrder('${chem.id}', ${reorderQty})">
              Restock
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }
}

/**
 * Render Alerts Feed
 */
function renderAlertsFeed() {
  const container = document.getElementById("alerts-full-list");
  const overviewList = document.getElementById("overview-alerts-list");
  if (!container) return;

  const severityFilter = document.getElementById("filter-alert-severity")?.value || "ALL";

  // Re-generate real-time alerts from chemicals
  const liveAlerts = [];

  chemicals.forEach(chem => {
    const status = calculateStockStatus(chem.quantity, chem.minimumStock);
    const daysLeft = getDaysUntilExpiry(chem.expiryDate);

    if (status === "CRITICAL") {
      liveAlerts.push({
        id: `alt_crit_${chem.id}`,
        chemicalId: chem.id,
        chemicalName: chem.name,
        type: "CRITICAL_STOCK",
        severity: "critical",
        message: `CRITICAL STOCK: ${chem.name} has fallen to ${chem.quantity} ${chem.unit} (under 50% of threshold ${chem.minimumStock} ${chem.unit})`,
        timestamp: new Date().toISOString()
      });
    } else if (status === "LOW") {
      liveAlerts.push({
        id: `alt_low_${chem.id}`,
        chemicalId: chem.id,
        chemicalName: chem.name,
        type: "LOW_STOCK",
        severity: "warning",
        message: `LOW STOCK: ${chem.name} is at ${chem.quantity} ${chem.unit} (Minimum threshold: ${chem.minimumStock} ${chem.unit})`,
        timestamp: new Date().toISOString()
      });
    }

    if (daysLeft < 0) {
      liveAlerts.push({
        id: `alt_exp_${chem.id}`,
        chemicalId: chem.id,
        chemicalName: chem.name,
        type: "EXPIRING_SOON",
        severity: "critical",
        message: `EXPIRED: ${chem.name} reached simulated expiry on ${chem.expiryDate}! Safely quarantine bottle.`,
        timestamp: new Date().toISOString()
      });
    } else if (daysLeft <= 30) {
      liveAlerts.push({
        id: `alt_exp_${chem.id}`,
        chemicalId: chem.id,
        chemicalName: chem.name,
        type: "EXPIRING_SOON",
        severity: "expiring",
        message: `EXPIRY WARNING: ${chem.name} expires in ${daysLeft} days (Simulated Expiry: ${chem.expiryDate})`,
        timestamp: new Date().toISOString()
      });
    }
  });

  alerts = liveAlerts;

  const filtered = alerts.filter(alt => {
    if (severityFilter === "ALL") return true;
    return alt.severity === severityFilter;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<p style="color: var(--status-normal); text-align: center; padding: 2rem;">✨ No active alerts at this time. All chemical parameters are optimal.</p>`;
    if (overviewList) {
      overviewList.innerHTML = `
        <div class="alert-item" style="border-left-color: var(--status-normal);">
          <div class="alert-main">
            <span class="alert-icon">✨</span>
            <div>
              <div class="alert-message">All simulated chemical inventory stocks are stable.</div>
              <div class="alert-time">Real-time Cloud Monitor</div>
            </div>
          </div>
        </div>
      `;
    }
    return;
  }

  container.innerHTML = filtered.map(alt => {
    let icon = "⚠️";
    if (alt.severity === "critical") icon = "🚨";
    if (alt.severity === "expiring") icon = "⏳";
    if (alt.severity === "info") icon = "ℹ️";

    return `
      <div class="alert-item ${alt.severity}">
        <div class="alert-main">
          <span class="alert-icon">${icon}</span>
          <div>
            <div class="alert-message">${escapeHtml(alt.message)}</div>
            <div class="alert-time">${new Date(alt.timestamp).toLocaleTimeString()} · Simulated Cloud Event</div>
          </div>
        </div>
        <div>
          <button class="btn btn-secondary btn-sm" onclick="window.quickStockIn('${alt.chemicalId}')">
            Restock Now
          </button>
        </div>
      </div>
    `;
  }).join("");

  if (overviewList) {
    overviewList.innerHTML = filtered.slice(0, 3).map(alt => {
      let icon = alt.severity === "critical" ? "🚨" : (alt.severity === "expiring" ? "⏳" : "⚠️");
      return `
        <div class="alert-item ${alt.severity}">
          <div class="alert-main">
            <span class="alert-icon">${icon}</span>
            <div>
              <div class="alert-message">${escapeHtml(alt.message)}</div>
              <div class="alert-time">${new Date(alt.timestamp).toLocaleTimeString()}</div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }
}

/**
 * Render Transactions History Ledger
 */
function renderTransactionsTable() {
  const tbody = document.getElementById("transactions-table-body");
  if (!tbody) return;

  const typeFilter = document.getElementById("filter-transaction-type")?.value || "ALL";

  const filtered = transactions.filter(t => {
    if (typeFilter === "ALL") return true;
    return t.type === typeFilter;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 2rem;">No transactions recorded yet. Perform a Stock IN or Stock OUT to log transactions.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(t => {
    const chem = chemicals.find(c => c.id === t.chemicalId);
    const chemName = chem ? chem.name : (t.chemicalName || "Unknown Chemical");
    const unit = chem ? chem.unit : "";

    const typeBadge = t.type === "IN" ? 
      `<span class="badge badge-normal">➕ STOCK IN</span>` : 
      `<span class="badge badge-critical">➖ STOCK OUT</span>`;

    const qtyDisplay = t.type === "IN" ? 
      `<span style="color: var(--status-normal); font-weight:700;">+${t.quantity} ${unit}</span>` : 
      `<span style="color: #f87171; font-weight:700;">-${t.quantity} ${unit}</span>`;

    const formattedDate = new Date(t.timestamp || t.createdAt || Date.now()).toLocaleString();

    return `
      <tr>
        <td style="font-size: 0.78rem; color: var(--text-muted);">${formattedDate}</td>
        <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; color: var(--text-dim);">${t.id.slice(0, 10)}...</td>
        <td style="font-weight: 600;">${escapeHtml(chemName)}</td>
        <td>${typeBadge}</td>
        <td>${qtyDisplay}</td>
        <td style="color: var(--text-muted); font-size: 0.8rem;">${escapeHtml(t.notes || '-')}</td>
      </tr>
    `;
  }).join("");
}

/**
 * Render Suppliers Grid
 */
function renderSuppliersGrid() {
  const grid = document.getElementById("suppliers-grid");
  if (!grid) return;

  if (suppliers.length === 0) {
    grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-dim); padding: 2rem;">No suppliers registered yet.</p>`;
    return;
  }

  grid.innerHTML = suppliers.map(supp => {
    const linkedChems = chemicals.filter(c => c.supplierId === supp.id);
    return `
      <div class="supplier-card">
        <div class="supplier-header">
          <div class="supplier-name">${escapeHtml(supp.name)}</div>
          <div class="supplier-rating">★ ${supp.rating || '5.0'}</div>
        </div>
        <div class="supplier-info-line">
          <span>📍</span> ${escapeHtml(supp.location || 'New Mexico, USA')}
        </div>
        <div class="supplier-info-line">
          <span>✉️</span> ${escapeHtml(supp.contact || 'orders@supplier.com')}
        </div>
        <div class="supplier-info-line" style="margin-top: 0.75rem; font-size: 0.75rem; color: var(--accent-primary);">
          <span>🧪</span> ${linkedChems.length} Chemicals Supplied
        </div>
      </div>
    `;
  }).join("");
}

/**
 * Populate Dropdowns for Stock IN / OUT / Chemical Modals
 */
function populateDropdowns() {
  const stockInSelect = document.getElementById("stock-in-chemical");
  const stockOutSelect = document.getElementById("stock-out-chemical");
  const chemSupplierSelect = document.getElementById("chem-supplier");
  const stockInSupplierSelect = document.getElementById("stock-in-supplier");

  if (stockInSelect) {
    const currentVal = stockInSelect.value;
    stockInSelect.innerHTML = `<option value="">-- Choose Chemical --</option>` + 
      chemicals.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (${c.quantity} ${c.unit} available)</option>`).join("");
    if (currentVal) stockInSelect.value = currentVal;
  }

  if (stockOutSelect) {
    const currentVal = stockOutSelect.value;
    stockOutSelect.innerHTML = `<option value="">-- Choose Chemical --</option>` + 
      chemicals.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (${c.quantity} ${c.unit} available)</option>`).join("");
    if (currentVal) stockOutSelect.value = currentVal;
  }

  if (chemSupplierSelect) {
    chemSupplierSelect.innerHTML = `<option value="">-- Select Supplier --</option>` + 
      suppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
  }

  if (stockInSupplierSelect) {
    stockInSupplierSelect.innerHTML = `<option value="">-- Select Supplier --</option>` + 
      suppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
  }
}

/**
 * Render Visual Analytics (Chart.js)
 */
function updateCharts() {
  if (typeof Chart === "undefined") {
    console.warn("Chart.js not loaded, skipping charts");
    return;
  }

  // 1. Categories Chart (Bar)
  const catCanvas = document.getElementById("categoryChart");
  if (catCanvas) {
    const categoryCounts = {};
    chemicals.forEach(c => {
      const cat = c.category || "Other";
      categoryCounts[cat] = (categoryCounts[cat] || 0) + Number(c.quantity);
    });

    const labels = Object.keys(categoryCounts);
    const data = Object.values(categoryCounts);

    if (categoryChartInstance) {
      categoryChartInstance.destroy();
    }

    categoryChartInstance = new Chart(catCanvas, {
      type: "bar",
      data: {
        labels: labels.length ? labels : ["No Data"],
        datasets: [{
          label: "Total Units in Stock",
          data: data.length ? data : [0],
          backgroundColor: [
            "rgba(0, 245, 160, 0.7)",
            "rgba(0, 210, 255, 0.7)",
            "rgba(16, 185, 129, 0.7)",
            "rgba(245, 158, 11, 0.7)",
            "rgba(236, 72, 153, 0.7)",
            "rgba(139, 92, 246, 0.7)"
          ],
          borderRadius: 6,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.1)"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#9ca3af", font: { size: 11 } }
          },
          y: {
            grid: { color: "rgba(255,255,255,0.06)" },
            ticks: { color: "#9ca3af", font: { size: 11 } }
          }
        }
      }
    });
  }

  // 2. Health Distribution (Doughnut)
  const healthCanvas = document.getElementById("healthChart");
  if (healthCanvas) {
    let normal = 0, low = 0, critical = 0;
    chemicals.forEach(c => {
      const status = calculateStockStatus(c.quantity, c.minimumStock);
      if (status === "CRITICAL") critical++;
      else if (status === "LOW") low++;
      else normal++;
    });

    if (healthChartInstance) {
      healthChartInstance.destroy();
    }

    healthChartInstance = new Chart(healthCanvas, {
      type: "doughnut",
      data: {
        labels: ["Normal Stock", "Low Stock", "Critical Stock"],
        datasets: [{
          data: [normal, low, critical],
          backgroundColor: [
            "#10b981", // normal green
            "#f59e0b", // low amber
            "#ef4444"  // critical red
          ],
          borderWidth: 2,
          borderColor: "#111827"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: "#9ca3af", font: { size: 11 }, padding: 12 }
          }
        },
        cutout: "68%"
      }
    });
  }
}

/**
 * Re-render All Components
 */
function renderAll() {
  updateDashboardStats();
  renderInventoryTable();
  renderReorderIntelligence();
  renderAlertsFeed();
  renderTransactionsTable();
  renderSuppliersGrid();
  populateDropdowns();
  updateCharts();
}

// ============================================================================
// SIMULATION / TRANSACTION WORKFLOW ACTIONS
// ============================================================================

/**
 * Execute Stock IN Transaction
 */
export async function executeStockIn(chemicalId, quantityToAdd, notes = "", supplierId = "") {
  const chem = chemicals.find(c => c.id === chemicalId);
  if (!chem) {
    showToast("Chemical not found.", "error");
    return;
  }

  const delta = Number(quantityToAdd);
  if (isNaN(delta) || delta <= 0) {
    showToast("Please enter a valid positive quantity for Stock IN.", "error");
    return;
  }

  const newQty = parseFloat((Number(chem.quantity) + delta).toFixed(2));
  const newStatus = calculateStockStatus(newQty, chem.minimumStock);

  try {
    // 1. Record Transaction Document
    const txPayload = {
      chemicalId: chem.id,
      chemicalName: chem.name,
      type: "IN",
      quantity: delta,
      timestamp: new Date().toISOString(),
      notes: notes || `Stock IN refill (+${delta} ${chem.unit})`
    };
    const effectiveSupplier = supplierId || chem.supplierId;
    if (effectiveSupplier) {
      txPayload.supplierId = effectiveSupplier;
    }
    await CloudService.addDocument("transactions", txPayload);

    // 2. Update Chemical Quantity & Status Document
    await CloudService.updateDocument("chemicals", chem.id, {
      quantity: newQty,
      status: newStatus
    });

    showToast(`Stock IN Recorded: Added +${delta} ${chem.unit} to ${chem.name}. New Stock: ${newQty} ${chem.unit}`, "success");
  } catch (err) {
    console.error("Stock IN error:", err);
    showToast("Failed to record Stock IN transaction.", "error");
  }
}

/**
 * Execute Stock OUT Transaction (With Safety & Overdraw Prevention)
 */
export async function executeStockOut(chemicalId, quantityToConsume, notes = "") {
  const chem = chemicals.find(c => c.id === chemicalId);
  if (!chem) {
    showToast("Chemical not found.", "error");
    return;
  }

  const delta = Number(quantityToConsume);
  if (isNaN(delta) || delta <= 0) {
    showToast("Please enter a valid positive quantity for Stock OUT.", "error");
    return;
  }

  if (delta > Number(chem.quantity)) {
    showToast(`Insufficient Stock! Available: ${chem.quantity} ${chem.unit}, Requested: ${delta} ${chem.unit}`, "error");
    return;
  }

  const newQty = parseFloat((Number(chem.quantity) - delta).toFixed(2));
  const newStatus = calculateStockStatus(newQty, chem.minimumStock);

  try {
    // 1. Record Transaction Document
    await CloudService.addDocument("transactions", {
      chemicalId: chem.id,
      chemicalName: chem.name,
      type: "OUT",
      quantity: delta,
      timestamp: new Date().toISOString(),
      notes: notes || `Lab Consumption (-${delta} ${chem.unit})`
    });

    // 2. Update Chemical Quantity & Status Document
    await CloudService.updateDocument("chemicals", chem.id, {
      quantity: newQty,
      status: newStatus
    });

    showToast(`Stock OUT Recorded: Consumed -${delta} ${chem.unit} of ${chem.name}. Remaining: ${newQty} ${chem.unit}`, "success");
  } catch (err) {
    console.error("Stock OUT error:", err);
    showToast("Failed to record Stock OUT transaction.", "error");
  }
}

// Window globally exposed helper functions for inline onclick handlers
window.quickStockIn = (chemId) => {
  const select = document.getElementById("stock-in-chemical");
  if (select) {
    select.value = chemId;
    const chem = chemicals.find(c => c.id === chemId);
    if (chem) document.getElementById("stock-in-unit").value = chem.unit;
  }
  openModal("modal-stock-in");
};

window.quickStockOut = (chemId) => {
  const select = document.getElementById("stock-out-chemical");
  if (select) {
    select.value = chemId;
    const chem = chemicals.find(c => c.id === chemId);
    if (chem) document.getElementById("stock-out-current").value = `${chem.quantity} ${chem.unit}`;
  }
  openModal("modal-stock-out");
};

window.executeSimulatedOrder = (chemId, qty) => {
  const chem = chemicals.find(c => c.id === chemId);
  if (!chem) return;
  executeStockIn(chemId, qty, `Automated Reorder PO Fulfillment from Supplier`);
};

window.editChemical = (chemId) => {
  const chem = chemicals.find(c => c.id === chemId);
  if (!chem) return;

  document.getElementById("chemical-modal-title").innerHTML = `<span>✏️</span> Edit Simulated Chemical`;
  document.getElementById("chem-edit-id").value = chem.id;
  document.getElementById("chem-name").value = chem.name;
  document.getElementById("chem-category").value = chem.category;
  document.getElementById("chem-unit").value = chem.unit;
  document.getElementById("chem-qty").value = chem.quantity;
  document.getElementById("chem-min").value = chem.minimumStock;
  document.getElementById("chem-max").value = chem.maximumStock;
  document.getElementById("chem-expiry").value = chem.expiryDate || "";
  document.getElementById("chem-storage").value = chem.storageLocation || "";
  document.getElementById("chem-supplier").value = chem.supplierId || "";

  openModal("modal-add-chemical");
};

window.deleteChemical = async (chemId) => {
  const chem = chemicals.find(c => c.id === chemId);
  if (!chem) return;
  if (confirm(`Are you sure you want to remove ${chem.name} from simulated inventory?`)) {
    await CloudService.deleteDocument("chemicals", chemId);
    showToast(`Deleted ${chem.name} from database.`, "info");
  }
};

// ============================================================================
// SAMPLE DATA SEEDING MECHANISM
// ============================================================================
export async function seedSampleLabData() {
  showToast("Seeding realistic laboratory inventory records...", "info");

  // 1. Seed Suppliers
  const sampleSuppliers = [
    {
      id: "supp_abq",
      name: "Albuquerque Scientific Reagents",
      contact: "orders@abqscientific.com",
      location: "Albuquerque, New Mexico",
      rating: "5.0"
    },
    {
      id: "supp_vamonos",
      name: "Vamonos Lab Logistics",
      contact: "logistics@vamonoschem.com",
      location: "Phoenix, Arizona",
      rating: "4.5"
    },
    {
      id: "supp_graymatter",
      name: "Gray Matter Chemical Solutions",
      contact: "research@graymatterchem.com",
      location: "Santa Fe, New Mexico",
      rating: "5.0"
    },
    {
      id: "supp_pollos",
      name: "Pollos Precision Reagents",
      contact: "supply@pollosreagents.com",
      location: "Albuquerque, New Mexico",
      rating: "4.0"
    }
  ];

  for (const s of sampleSuppliers) {
    await CloudService.setDocument("suppliers", s.id, s);
  }

  // Calculate simulated expiry dates relative to today
  const today = new Date();
  const formatOffsetDate = (daysAhead) => {
    const d = new Date(today);
    d.setDate(d.getDate() + daysAhead);
    return d.toISOString().split("T")[0];
  };

  // 2. Seed Chemicals (Fictional educational laboratory items showcasing all conditions)
  const sampleChemicals = [
    {
      id: "chem_acetone",
      name: "Acetone (High Purity ACS)",
      category: "Solvent",
      quantity: 45.0,
      unit: "L",
      minimumStock: 20.0,
      maximumStock: 100.0,
      expiryDate: formatOffsetDate(365),
      storageLocation: "Flammables Cabinet F-1",
      supplierId: "supp_abq",
      status: "NORMAL"
    },
    {
      id: "chem_ethanol",
      name: "Ethanol 95% (Laboratory Grade)",
      category: "Solvent",
      quantity: 12.0, // Low Stock (Min: 25)
      unit: "L",
      minimumStock: 25.0,
      maximumStock: 80.0,
      expiryDate: formatOffsetDate(240),
      storageLocation: "Flammables Cabinet F-2",
      supplierId: "supp_abq",
      status: "LOW"
    },
    {
      id: "chem_hcl",
      name: "Hydrochloric Acid 37% (ACS Grade)",
      category: "Acid",
      quantity: 3.0, // Critical Stock (< 50% of 10)
      unit: "L",
      minimumStock: 10.0,
      maximumStock: 40.0,
      expiryDate: formatOffsetDate(400),
      storageLocation: "Acid Storage Cabinet A-1",
      supplierId: "supp_graymatter",
      status: "CRITICAL"
    },
    {
      id: "chem_nacl",
      name: "Sodium Chloride (Analytical Reagent)",
      category: "Salt",
      quantity: 18.5,
      unit: "kg",
      minimumStock: 5.0,
      maximumStock: 30.0,
      expiryDate: formatOffsetDate(720),
      storageLocation: "Salt Shelf S-3",
      supplierId: "supp_vamonos",
      status: "NORMAL"
    },
    {
      id: "chem_h2o",
      name: "Distilled Water (Type II Laboratory)",
      category: "Reagent",
      quantity: 140.0,
      unit: "L",
      minimumStock: 50.0,
      maximumStock: 200.0,
      expiryDate: formatOffsetDate(500),
      storageLocation: "Central Bulk Tank",
      supplierId: "supp_pollos",
      status: "NORMAL"
    },
    {
      id: "chem_cuso4",
      name: "Copper(II) Sulfate Pentahydrate",
      category: "Salt",
      quantity: 1.8, // Low Stock (Min: 2.5)
      unit: "kg",
      minimumStock: 2.5,
      maximumStock: 10.0,
      expiryDate: formatOffsetDate(180),
      storageLocation: "Reagent Rack R-4",
      supplierId: "supp_vamonos",
      status: "LOW"
    },
    {
      id: "chem_iodine",
      name: "Iodine Solution 0.1 N",
      category: "Indicator",
      quantity: 0.4, // Critical (<0.5) and Expiring in 12 days
      unit: "L",
      minimumStock: 1.0,
      maximumStock: 5.0,
      expiryDate: formatOffsetDate(12),
      storageLocation: "Amber Bottle Cabinet I-1",
      supplierId: "supp_graymatter",
      status: "CRITICAL"
    },
    {
      id: "chem_naoh",
      name: "Sodium Hydroxide Pellets",
      category: "Base",
      quantity: 12.0,
      unit: "kg",
      minimumStock: 4.0,
      maximumStock: 20.0,
      expiryDate: formatOffsetDate(300),
      storageLocation: "Base Cabinet B-1",
      supplierId: "supp_abq",
      status: "NORMAL"
    },
    {
      id: "chem_phenolphthalein",
      name: "Phenolphthalein 1% Indicator",
      category: "Indicator",
      quantity: 0.8,
      unit: "L",
      minimumStock: 0.5,
      maximumStock: 2.0,
      expiryDate: formatOffsetDate(18), // Expiring in 18 days
      storageLocation: "Indicator Shelf IND-2",
      supplierId: "supp_graymatter",
      status: "NORMAL"
    },
    {
      id: "chem_sulfuric",
      name: "Sulfuric Acid 98%",
      category: "Acid",
      quantity: 8.0, // Low Stock (Min: 12)
      unit: "L",
      minimumStock: 12.0,
      maximumStock: 50.0,
      expiryDate: formatOffsetDate(350),
      storageLocation: "Acid Storage Cabinet A-2",
      supplierId: "supp_graymatter",
      status: "LOW"
    }
  ];

  for (const c of sampleChemicals) {
    const chemicalRecord = {
      ...c,
      createdAt: c.createdAt || today.toISOString()
    };
    await CloudService.setDocument("chemicals", c.id, chemicalRecord);
  }

  // 3. Seed Sample Transactions History
  const sampleTransactions = [
    {
      id: "tx_init_1",
      chemicalId: "chem_acetone",
      chemicalName: "Acetone (High Purity ACS)",
      type: "IN",
      quantity: 45.0,
      timestamp: new Date(Date.now() - 3600000 * 24 * 3).toISOString(),
      notes: "Initial laboratory bulk delivery",
      supplierId: "supp_abq"
    },
    {
      id: "tx_init_2",
      chemicalId: "chem_hcl",
      chemicalName: "Hydrochloric Acid 37% (ACS Grade)",
      type: "OUT",
      quantity: 7.0,
      timestamp: new Date(Date.now() - 3600000 * 12).toISOString(),
      notes: "Advanced Chemical Analysis Practical Demo"
    },
    {
      id: "tx_init_3",
      chemicalId: "chem_ethanol",
      chemicalName: "Ethanol 95% (Laboratory Grade)",
      type: "OUT",
      quantity: 13.0,
      timestamp: new Date(Date.now() - 3600000 * 6).toISOString(),
      notes: "Solvent extraction lab session"
    }
  ];

  for (const t of sampleTransactions) {
    try {
      await CloudService.setDocument("transactions", t.id, t);
    } catch (err) {
      console.warn(`[Seed] Transaction ${t.id} already exists or is locked by immutability rules:`, err);
    }
  }

  showToast("Sample laboratory dataset successfully seeded!", "success");
}

// ============================================================================
// MODAL MANAGEMENT
// ============================================================================
export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add("active");
  }
}

export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove("active");
  }
}

// ============================================================================
// EVENT LISTENERS & INITIALIZATION
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
  // 1. Navigation Tabs Switcher
  const tabs = document.querySelectorAll(".nav-tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      const targetId = tab.getAttribute("data-target");
      document.querySelectorAll(".tab-pane").forEach(pane => {
        pane.classList.remove("active");
      });
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add("active");

      // Trigger chart resize if entering overview
      if (targetId === "tab-overview") {
        setTimeout(updateCharts, 100);
      }
    });
  });

  // 2. Modal Close Buttons
  document.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const modalId = btn.getAttribute("data-close");
      closeModal(modalId);
    });
  });

  // Close modals on clicking backdrop
  document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        backdrop.classList.remove("active");
      }
    });
  });

  // 3. Header Action Buttons
  document.getElementById("btn-seed-data")?.addEventListener("click", () => seedSampleLabData());
  document.getElementById("btn-open-stock-in")?.addEventListener("click", () => openModal("modal-stock-in"));
  document.getElementById("btn-open-stock-out")?.addEventListener("click", () => openModal("modal-stock-out"));
  document.getElementById("btn-open-add-chemical")?.addEventListener("click", () => {
    document.getElementById("chemical-modal-title").innerHTML = `<span>🧪</span> Add Simulated Chemical`;
    document.getElementById("form-add-chemical").reset();
    document.getElementById("chem-edit-id").value = "";
    openModal("modal-add-chemical");
  });
  document.getElementById("btn-add-chem-tab")?.addEventListener("click", () => {
    document.getElementById("chemical-modal-title").innerHTML = `<span>🧪</span> Add Simulated Chemical`;
    document.getElementById("form-add-chemical").reset();
    document.getElementById("chem-edit-id").value = "";
    openModal("modal-add-chemical");
  });
  document.getElementById("btn-add-supplier")?.addEventListener("click", () => openModal("modal-add-supplier"));
  document.getElementById("btn-print-report")?.addEventListener("click", () => window.print());

  // Cloud status button
  document.getElementById("cloud-status-btn")?.addEventListener("click", () => {
    const isLive = CloudService.isLive();
    const statusText = isLive ? "Connected to Google Cloud Firestore" : "Running in Local Simulation Store (Spark ₹0 Mode)";
    const elem = document.getElementById("modal-cloud-status-text");
    if (elem) elem.textContent = statusText;
    openModal("modal-cloud-config");
  });

  // Reset local demo data
  document.getElementById("btn-reset-data")?.addEventListener("click", () => {
    if (confirm("Reset local demo inventory store?")) {
      CloudService.resetLocalData();
      closeModal("modal-cloud-config");
      showToast("Local data reset. Click 'Seed Sample Lab Data' to repopulate.", "info");
    }
  });

  // Restock All Critical PO action
  document.getElementById("btn-reorder-all-critical")?.addEventListener("click", async () => {
    const criticalItems = chemicals.filter(c => calculateStockStatus(c.quantity, c.minimumStock) === "CRITICAL");
    if (criticalItems.length === 0) {
      showToast("No critical chemicals requiring immediate bulk restock.", "info");
      return;
    }
    for (const item of criticalItems) {
      const needed = calculateRecommendedOrder(item.quantity, item.maximumStock);
      await executeStockIn(item.id, needed, "Bulk Critical PO Restock");
    }
    showToast(`Bulk restocked ${criticalItems.length} critical chemicals!`, "success");
  });

  // 4. Form Submissions
  // Stock IN Form
  document.getElementById("form-stock-in")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const chemId = document.getElementById("stock-in-chemical").value;
    const qty = document.getElementById("stock-in-qty").value;
    const supplier = document.getElementById("stock-in-supplier").value;
    const notes = document.getElementById("stock-in-notes").value;

    await executeStockIn(chemId, qty, notes, supplier);
    closeModal("modal-stock-in");
    document.getElementById("form-stock-in").reset();
  });

  // Update Stock-IN Unit when Chemical changes
  document.getElementById("stock-in-chemical")?.addEventListener("change", (e) => {
    const chem = chemicals.find(c => c.id === e.target.value);
    document.getElementById("stock-in-unit").value = chem ? chem.unit : "";
  });

  // Stock OUT Form
  document.getElementById("form-stock-out")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const chemId = document.getElementById("stock-out-chemical").value;
    const qty = document.getElementById("stock-out-qty").value;
    const notes = document.getElementById("stock-out-notes").value;

    await executeStockOut(chemId, qty, notes);
    closeModal("modal-stock-out");
    document.getElementById("form-stock-out").reset();
  });

  // Update Stock-OUT Current Stock display when Chemical changes
  document.getElementById("stock-out-chemical")?.addEventListener("change", (e) => {
    const chem = chemicals.find(c => c.id === e.target.value);
    document.getElementById("stock-out-current").value = chem ? `${chem.quantity} ${chem.unit}` : "0";
  });

  // Add / Edit Chemical Form
  document.getElementById("form-add-chemical")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("chem-edit-id").value;
    const name = document.getElementById("chem-name").value.trim();
    const category = document.getElementById("chem-category").value;
    const unit = document.getElementById("chem-unit").value;
    const quantity = Number(document.getElementById("chem-qty").value);
    const minimumStock = Number(document.getElementById("chem-min").value);
    const maximumStock = Number(document.getElementById("chem-max").value);
    const expiryDate = document.getElementById("chem-expiry").value;
    const storageLocation = document.getElementById("chem-storage").value.trim();
    const supplierId = document.getElementById("chem-supplier").value;

    if (minimumStock >= maximumStock) {
      showToast("Maximum stock target must be strictly greater than Minimum stock threshold.", "error");
      return;
    }

    const status = calculateStockStatus(quantity, minimumStock);

    const payload = {
      name,
      category,
      unit,
      quantity,
      minimumStock,
      maximumStock,
      expiryDate,
      storageLocation,
      supplierId,
      status
    };

    try {
      if (editId) {
        await CloudService.updateDocument("chemicals", editId, payload);
        showToast(`Updated chemical: ${name}`, "success");
      } else {
        let created = false;
        let attempts = 0;
        let assignedId = "";
        while (!created && attempts < 5) {
          attempts++;
          assignedId = generateChemicalId(name, attempts);
          const newChemical = {
            id: assignedId,
            ...payload,
            createdAt: new Date().toISOString()
          };
          try {
            await CloudService.createDocument("chemicals", assignedId, newChemical);
            created = true;
          } catch (err) {
            if (err.code === "already-exists") {
              console.warn(`[Chemical ID Collision] ${assignedId} already exists, retrying with incremented candidate...`);
              continue;
            }
            throw err;
          }
        }
        if (!created) {
          showToast(`Failed to register chemical due to ID conflict. Please try again.`, "error");
          return;
        }
        showToast(`Added new chemical: ${name} (${assignedId})`, "success");
      }

      closeModal("modal-add-chemical");
      document.getElementById("form-add-chemical").reset();
    } catch (err) {
      console.error("Chemical creation error:", err);
      showToast(err.message || "Failed to save chemical record.", "error");
    }
  });

  // Add Supplier Form
  document.getElementById("form-add-supplier")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("supp-name").value.trim();
    const contact = document.getElementById("supp-contact").value.trim();
    const location = document.getElementById("supp-location").value.trim();
    const rating = document.getElementById("supp-rating").value;

    try {
      let created = false;
      let attempts = 0;
      let assignedId = "";
      while (!created && attempts < 3) {
        attempts++;
        assignedId = generateSupplierId(name);
        const newSupplier = {
          id: assignedId,
          name,
          contact,
          location,
          rating,
          createdAt: new Date().toISOString()
        };
        try {
          await CloudService.createDocument("suppliers", assignedId, newSupplier);
          created = true;
        } catch (err) {
          if (err.code === "already-exists") {
            console.warn(`[Supplier ID Collision] ${assignedId} already exists, retrying with new suffix...`);
            continue;
          }
          throw err;
        }
      }
      if (!created) {
        showToast(`Failed to register supplier due to ID conflict. Please try again.`, "error");
        return;
      }

      showToast(`Registered Supplier: ${name} (${assignedId})`, "success");
      closeModal("modal-add-supplier");
      document.getElementById("form-add-supplier").reset();
    } catch (err) {
      console.error("Supplier creation error:", err);
      showToast(err.message || "Failed to register supplier.", "error");
    }
  });

  // 5. Search & Filters
  document.getElementById("inventory-search")?.addEventListener("input", renderInventoryTable);
  document.getElementById("filter-category")?.addEventListener("change", renderInventoryTable);
  document.getElementById("filter-status")?.addEventListener("change", renderInventoryTable);
  document.getElementById("filter-alert-severity")?.addEventListener("change", renderAlertsFeed);
  document.getElementById("filter-transaction-type")?.addEventListener("change", renderTransactionsTable);

  // 6. Cloud Status Indicator UI update
  const isLive = CloudService.isLive();
  const cloudDot = document.getElementById("cloud-status-dot");
  const cloudText = document.getElementById("cloud-status-text");
  if (isLive) {
    cloudDot?.classList.remove("local-mode");
    if (cloudText) cloudText.textContent = "Cloud Firestore Live";
  } else {
    cloudDot?.classList.add("local-mode");
    if (cloudText) cloudText.textContent = "Simulation Mode (Local)";
  }

  // 7. Subscribe to Real-Time Data Streams from CloudService
  CloudService.subscribe("chemicals", (items) => {
    chemicals = items;
    renderAll();
  });

  CloudService.subscribe("suppliers", (items) => {
    suppliers = items;
    renderAll();
  });

  CloudService.subscribe("transactions", (items) => {
    transactions = items;
    renderAll();
  });

  // Note: Educational inventory seeding is exclusively user-initiated via the 'Seed Sample Lab Data' button,
  // preventing startup race conditions and unintended writes on cold-start connections.
});

// Helper: Escape HTML to prevent XSS
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
