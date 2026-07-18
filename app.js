(function () {
  const config = window.GRN_DASHBOARD_CONFIG || {};
  const sampleData = window.GRN_SAMPLE_DATA || {};
  const state = {
    data: sampleData,
    activeTab: 'overall',
    currentRows: [],
    loading: false
  };
  const dateTimeKeyPattern = /(date|time|timestamp|fetched_at|last_refresh|pending_since|generated_at)/i;

  const views = {
    overall: {
      title: 'Overall Dock to Stock TAT',
      rows: function () { return applyOverallFilters(state.data.overall_tat || []); },
      columns: [
        ['vehicle_number', 'Vehicle'],
        ['invoice_number', 'Invoice'],
        ['sku_code', 'SKU code'],
        ['sku_name', 'SKU name'],
        ['supplier_vendor', 'Vendor'],
        ['supplier_vendor_group', 'Vendor group'],
        ['warehouse', 'Warehouse'],
        ['reporting_time_ist', 'Reporting time'],
        ['unloading_start_time_ist', 'Unloading start'],
        ['grn_time_ist', 'GRN time'],
        ['putaway_time_ist', 'Putaway time'],
        ['reporting_to_unloading_days', 'Report to unload days'],
        ['unloading_to_grn_days', 'Unload to GRN days'],
        ['grn_to_putaway_days', 'GRN to putaway days'],
        ['dock_to_stock_days', 'Dock to stock days'],
        ['status', 'Status'],
        ['sla_breach', 'SLA breach'],
        ['match_status', 'Match']
      ]
    },
    pending: {
      title: 'Pending Action View',
      rows: function () { return applyPendingFilters(state.data.pending_actions || []); },
      columns: [
        ['vehicle_number', 'Vehicle'],
        ['invoice_number', 'Invoice'],
        ['sku_code', 'SKU code'],
        ['sku_name', 'SKU name'],
        ['pending_stage', 'Pending stage'],
        ['pending_since_ist', 'Pending since'],
        ['age_hours', 'Age hours'],
        ['ageing_bucket', 'Ageing bucket'],
        ['expected_quantity', 'Expected qty'],
        ['grn_number', 'GRN'],
        ['grn_quantity', 'GRN qty'],
        ['action_required', 'Action'],
        ['match_status', 'Match']
      ]
    },
    priority: {
      title: 'Priority GRN Queue',
      rows: function () { return applyPriorityFilters(state.data.priority_grn_queue || []); },
      columns: [
        ['sku_code', 'SKU code'],
        ['sku_name', 'SKU name'],
        ['doi_days', 'DOI days'],
        ['priority', 'Priority'],
        ['mother_stock_in_hand', 'Mother stock'],
        ['sales_7d', '7-day sales'],
        ['average_daily_sales', 'Avg daily sales'],
        ['zero_stock', 'Zero stock'],
        ['high_velocity', 'High velocity'],
        ['pending_grn_quantity', 'Pending GRN qty'],
        ['invoice_number', 'Invoice'],
        ['vehicle_number', 'Vehicle'],
        ['recommended_action', 'Recommended action'],
        ['match_status', 'Match']
      ]
    },
    sla: {
      title: 'SLA Summary',
      rows: function () { return objectToMetricRows(state.data.sla_summary || {}); },
      columns: [
        ['metric', 'Metric'],
        ['value', 'Value']
      ]
    },
    sources: {
      title: 'Source Health',
      rows: function () {
        return (state.data.source_status || [])
          .concat(state.data.error_log || [])
          .concat(state.data.row_audit || []);
      },
      columns: [
        ['report_type', 'Report type'],
        ['subject', 'Subject'],
        ['status', 'Status'],
        ['message_id', 'Message ID'],
        ['report_timestamp_ist', 'Report timestamp'],
        ['row_count', 'Rows'],
        ['fetched_at_ist', 'Fetched at'],
        ['level', 'Level'],
        ['stage', 'Stage'],
        ['message', 'Message'],
        ['error', 'Error'],
        ['source', 'Source'],
        ['row_number', 'Row'],
        ['action', 'Action'],
        ['reason', 'Reason'],
        ['facility', 'Facility'],
        ['invoice_number', 'Invoice'],
        ['sku_code', 'SKU'],
        ['grn_number', 'GRN'],
        ['putaway_number', 'Putaway'],
        ['details', 'Details']
      ]
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    bindEvents();
    loadData();
    const refreshMs = Number(config.refreshMinutes || 30) * 60 * 1000;
    window.setInterval(loadData, refreshMs);
  });

  function bindEvents() {
    document.getElementById('refreshButton').addEventListener('click', loadData);
    document.getElementById('exportButton').addEventListener('click', exportCurrentRows);

    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        state.activeTab = tab.getAttribute('data-tab');
        document.querySelectorAll('.tab').forEach(function (item) {
          item.classList.toggle('is-active', item === tab);
        });
        render();
      });
    });

    ['priorityFilter', 'statusFilter', 'ageingFilter', 'warehouseFilter', 'vendorFilter',
      'fromDateFilter', 'toDateFilter'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', render);
    });
  }

  async function loadData() {
    if (state.loading) {
      return;
    }
    state.loading = true;
    setConnectionStatus('Loading', 'status-neutral');

    try {
      if (!config.apiUrl) {
        if (config.useSampleDataWhenApiMissing) {
          state.data = sampleData;
          setConnectionStatus('Sample data', 'status-neutral');
        } else {
          throw new Error('Missing Apps Script API URL');
        }
      } else {
        state.data = await loadApiData();
        setConnectionStatus('Live data', 'status-ok');
      }
      populateFilters();
      render();
    } catch (error) {
      console.error(error);
      if (config.useSampleDataWhenApiMissing) {
        state.data = sampleData;
        populateFilters();
        render();
      }
      setConnectionStatus('API error', 'status-error');
    } finally {
      state.loading = false;
    }
  }

  async function loadApiData() {
    const url = buildApiUrl();
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('API returned HTTP ' + response.status);
      }
      const payload = await response.json();
      if (!payload.ok) {
        throw new Error(payload.error || 'API returned an error');
      }
      return payload;
    } catch (error) {
      return fetchJsonp();
    }
  }

  function buildApiUrl(callbackName) {
    const url = new URL(config.apiUrl);
    if (config.readToken) {
      url.searchParams.set('token', config.readToken);
    }
    if (callbackName) {
      url.searchParams.set('callback', callbackName);
    }
    url.searchParams.set('_', String(Date.now()));
    return url.toString();
  }

  function fetchJsonp() {
    return new Promise(function (resolve, reject) {
      const callbackName = 'grnDashboardCallback_' + Date.now();
      const script = document.createElement('script');
      const timeout = window.setTimeout(function () {
        cleanup();
        reject(new Error('JSONP request timed out'));
      }, 15000);

      window[callbackName] = function (payload) {
        cleanup();
        if (!payload.ok) {
          reject(new Error(payload.error || 'API returned an error'));
        } else {
          resolve(payload);
        }
      };

      script.onerror = function () {
        cleanup();
        reject(new Error('JSONP request failed'));
      };

      function cleanup() {
        window.clearTimeout(timeout);
        delete window[callbackName];
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      }

      script.src = buildApiUrl(callbackName);
      document.body.appendChild(script);
    });
  }

  function populateFilters() {
    setOptions('priorityFilter', uniqueValues(state.data.priority_grn_queue || [], 'priority', priorityLabel));
    setOptions('statusFilter', uniqueValues(state.data.overall_tat || [], 'status'));
    setOptions('ageingFilter', uniqueValues(state.data.pending_actions || [], 'ageing_bucket'));
    setOptions('warehouseFilter', uniqueValues(state.data.overall_tat || [], 'warehouse'));
    setOptions('vendorFilter', uniqueValues(state.data.overall_tat || [], 'supplier_vendor_group', function (value, row) {
      return value || normalizeVendorName(row.supplier_vendor);
    }));
  }

  function setOptions(id, values) {
    const select = document.getElementById(id);
    const selected = select.value;
    select.innerHTML = '<option value="">All</option>';
    values.forEach(function (value) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    if (values.indexOf(selected) !== -1) {
      select.value = selected;
    }
  }

  function uniqueValues(rows, key, formatter) {
    const seen = {};
    rows.forEach(function (row) {
      const rawValue = row[key];
      const value = String(formatter ? formatter(rawValue, row) : rawValue || '').trim();
      if (value) {
        seen[value] = true;
      }
    });
    return Object.keys(seen).sort();
  }

  function render() {
    renderMetrics();
    renderMeta();
    renderTable();
  }

  function renderMetrics() {
    const summary = state.data.sla_summary || {};
    setText('metricUnloadGrn', formatDays(summary.avg_unloading_to_grn_days));
    setText('metricUnloadGrnHours', formatHoursMinutes(summary.avg_unloading_to_grn_days));
    setText('metricGrnPutaway', formatDays(summary.avg_grn_to_putaway_days));
    setText('metricGrnPutawayHours', formatHoursMinutes(summary.avg_grn_to_putaway_days));
    setText('metricDockStock', formatDays(summary.avg_dock_to_stock_days));
    setText('metricDockStockHours', formatHoursMinutes(summary.avg_dock_to_stock_days));
    setText('metricBreaches', valueOrDash(summary.sla_breach_count));
    setText('metricP0', valueOrDash(summary.p0_pending_count));
    setText('metricP1', valueOrDash(summary.p1_pending_count));
    setText('metricPendingGrn', valueOrDash(summary.pending_grn_count));
    setText('metricPendingPutaway', valueOrDash(summary.pending_putaway_count));
  }

  function renderMeta() {
    const meta = state.data.meta || {};
    const lastRefresh = meta.last_refresh_ist || (state.data.sla_summary || {}).last_refresh_ist || '-';
    setText('lastRefresh', 'Last refresh: ' + displayValue('last_refresh_ist', lastRefresh));
  }

  function renderTable() {
    const view = views[state.activeTab];
    const rows = view.rows();
    state.currentRows = rows;
    document.getElementById('viewTitle').textContent = view.title;

    const host = document.getElementById('tableHost');
    host.innerHTML = '';
    if (state.activeTab === 'sla') {
      renderSlaView(host);
      return;
    }
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No rows available';
      host.appendChild(empty);
      return;
    }

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    view.columns.forEach(function (column) {
      const th = document.createElement('th');
      th.textContent = column[1];
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach(function (row) {
      const tr = document.createElement('tr');
      const rowClass = rowClassName(row);
      if (rowClass) {
        tr.className = rowClass;
      }
      view.columns.forEach(function (column) {
        appendCell(tr, column[0], row);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    host.appendChild(table);
  }

  function renderSlaView(host) {
    const summary = state.data.sla_summary || {};
    const urgent = Number(summary.p0_pending_count || 0) + Number(summary.p1_pending_count || 0);
    const cards = [
      ['Avg unload to GRN', formatDays(summary.avg_unloading_to_grn_days), 'Clean average, excluding negative source-date errors'],
      ['Avg GRN to putaway', formatDays(summary.avg_grn_to_putaway_days), 'From matched or approved tracker fallback rows'],
      ['Avg dock to stock', formatDays(summary.avg_dock_to_stock_days), 'Completed lines only'],
      ['SLA breaches', valueOrDash(summary.sla_breach_count), 'Open or completed lines crossing configured SLA'],
      ['Urgent GRN pending', valueOrDash(urgent), 'P0 plus P1 pending GRN lines'],
      ['Inventory missing', valueOrDash(summary.inventory_missing_priority_count), 'Pending SKUs not found in active FG inventory'],
      ['Completed', valueOrDash(summary.completed_count), 'Lines fully docked to stock'],
      ['Pending GRN / Putaway', valueOrDash(summary.pending_grn_count) + ' / ' + valueOrDash(summary.pending_putaway_count), 'Open operational handoffs']
    ];

    const panel = document.createElement('div');
    panel.className = 'sla-panel';
    cards.forEach(function (card) {
      const item = document.createElement('article');
      item.className = 'sla-card';
      const label = document.createElement('span');
      label.textContent = card[0];
      const value = document.createElement('strong');
      value.textContent = card[1];
      const note = document.createElement('small');
      note.textContent = card[2];
      item.appendChild(label);
      item.appendChild(value);
      item.appendChild(note);
      panel.appendChild(item);
    });
    host.appendChild(panel);

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['Metric', 'Value'].forEach(function (label) {
      const th = document.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    state.currentRows.forEach(function (row) {
      const tr = document.createElement('tr');
      ['metric', 'value'].forEach(function (key) {
        appendCell(tr, key, row);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    const details = document.createElement('div');
    details.className = 'sla-details';
    details.appendChild(table);
    host.appendChild(details);
  }

  function appendCell(tr, key, row) {
    const td = document.createElement('td');
    const value = row[key];
    if (key === 'priority') {
      td.appendChild(badge(priorityLabel(value), 'badge-' + cssToken(priorityLabel(value) || 'unknown')));
    } else if (key === 'status') {
      td.appendChild(statusBadge(value));
    } else if (key === 'sla_breach' && value === 'Yes') {
      td.appendChild(badge('Delayed', 'badge-delayed'));
    } else {
      td.textContent = displayValue(key, value);
    }
    tr.appendChild(td);
  }

  function badge(text, className) {
    const span = document.createElement('span');
    span.className = 'badge ' + className;
    span.textContent = valueOrDash(text);
    return span;
  }

  function statusBadge(status) {
    const text = String(status || '');
    if (text === 'Completed') {
      return badge(text, 'badge-completed');
    }
    if (text.indexOf('Pending') !== -1) {
      return badge(text, 'badge-pending');
    }
    return badge(text || '-', 'badge-overstock');
  }

  function rowClassName(row) {
    if (row.sla_breach === 'Yes') {
      return 'row-delayed';
    }
    if (row.priority) {
      return 'row-' + cssToken(priorityLabel(row.priority));
    }
    return '';
  }

  function applyOverallFilters(rows) {
    return rows.filter(function (row) {
      return matchesSelect('statusFilter', row.status) &&
        matchesSelect('warehouseFilter', row.warehouse) &&
        matchesSelect('vendorFilter', row.supplier_vendor_group || normalizeVendorName(row.supplier_vendor)) &&
        matchesDateRange(row.reporting_time_ist);
    });
  }

  function applyPendingFilters(rows) {
    return rows.filter(function (row) {
      return matchesSelect('ageingFilter', row.ageing_bucket);
    });
  }

  function applyPriorityFilters(rows) {
    return rows.filter(function (row) {
      return matchesSelect('priorityFilter', priorityLabel(row.priority));
    });
  }

  function matchesSelect(id, value) {
    const selected = document.getElementById(id).value;
    return !selected || String(value || '') === selected;
  }

  function matchesDateRange(value) {
    const from = document.getElementById('fromDateFilter').value;
    const to = document.getElementById('toDateFilter').value;
    const date = comparableDate(value);
    if (from && (!date || date < from)) {
      return false;
    }
    if (to && (!date || date > to)) {
      return false;
    }
    return true;
  }

  function objectToMetricRows(object) {
    return Object.keys(object).map(function (key) {
      return {
        metric: metricLabel(key),
        value: metricValue(key, object[key])
      };
    });
  }

  function exportCurrentRows() {
    const view = views[state.activeTab];
    const headers = view.columns.map(function (column) { return column[0]; });
    const labels = view.columns.map(function (column) { return column[1]; });
    const csvRows = [labels].concat(state.currentRows.map(function (row) {
      return headers.map(function (key) { return row[key] === undefined ? '' : displayValue(key, row[key]); });
    }));
    const csv = csvRows.map(function (row) {
      return row.map(csvEscape).join(',');
    }).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'grn-' + state.activeTab + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  function csvEscape(value) {
    const text = String(value === null || value === undefined ? '' : value);
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function formatDays(value) {
    if (value === '' || value === null || value === undefined || isNaN(Number(value))) {
      return '-';
    }
    return Number(value).toFixed(2) + ' d';
  }

  function formatHoursMinutes(value) {
    if (value === '' || value === null || value === undefined || isNaN(Number(value))) {
      return '-';
    }
    const totalMinutes = Math.round(Number(value) * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return String(hours).padStart(2, '0') + ':' + pad2(minutes) + ' hh:mm';
  }

  function valueOrDash(value) {
    if (value === '' || value === null || value === undefined) {
      return '-';
    }
    return String(value);
  }

  function displayValue(key, value) {
    if (value === '' || value === null || value === undefined) {
      return '-';
    }
    if (/_days$/i.test(key)) {
      return formatDecimal(value);
    }
    if (key === 'priority') {
      return priorityLabel(value);
    }
    if (dateTimeKeyPattern.test(key) || looksLikeDateTime(value)) {
      return formatDateTime(value) || valueOrDash(value);
    }
    return String(value);
  }

  function formatDateTime(value) {
    const text = String(value || '').trim();
    if (!text) {
      return '';
    }

    let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2}))?/);
    if (match) {
      return [
        pad2(match[3]),
        pad2(match[2]),
        normalizeYear(match[1])
      ].join('-') + (match[4] ? ' ' + pad2(match[4]) + ':' + pad2(match[5]) : '');
    }

    match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})(?:[, T]+(\d{1,2}):(\d{2}))?/);
    if (match) {
      return [
        pad2(match[1]),
        pad2(match[2]),
        normalizeYear(match[3])
      ].join('-') + (match[4] ? ' ' + pad2(match[4]) + ':' + pad2(match[5]) : '');
    }
    return '';
  }

  function comparableDate(value) {
    const text = String(value || '').trim();
    let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
      return [match[1], pad2(match[2]), pad2(match[3])].join('-');
    }
    match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
    if (match) {
      const year = String(match[3]).length === 2 ? '20' + match[3] : match[3];
      return [year, pad2(match[2]), pad2(match[1])].join('-');
    }
    return '';
  }

  function looksLikeDateTime(value) {
    const text = String(value || '').trim();
    return /^\d{4}-\d{1,2}-\d{1,2}[T\s]\d{1,2}:\d{2}/.test(text) ||
      /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}(?:[, T]+\d{1,2}:\d{2})?/.test(text);
  }

  function formatDecimal(value) {
    if (value === '' || value === null || value === undefined || isNaN(Number(value))) {
      return '-';
    }
    return Number(value).toFixed(2);
  }

  function priorityLabel(value) {
    return String(value || '').trim() === 'Unknown' ? 'Inventory missing' : String(value || '').trim();
  }

  function normalizeVendorName(value) {
    const text = String(value || '').trim();
    if (!text) {
      return '';
    }
    const cleaned = text
      .replace(/&/g, ' and ')
      .replace(/[^A-Za-z0-9]+/g, ' ')
      .replace(/\b(PVT|PRIVATE|LTD|LIMITED|LLP|LLC|INC|CO|COMPANY)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) {
      return '';
    }
    return cleaned.toLowerCase().replace(/\b[a-z0-9]/g, function (char) {
      return char.toUpperCase();
    });
  }

  function metricLabel(key) {
    const labels = {
      avg_unloading_to_grn_days: 'Avg unload to GRN',
      avg_grn_to_putaway_days: 'Avg GRN to putaway',
      avg_dock_to_stock_days: 'Avg dock to stock',
      sla_breach_count: 'SLA breaches',
      p0_pending_count: 'P0 pending',
      p1_pending_count: 'P1 pending',
      inventory_missing_priority_count: 'Inventory missing',
      completed_count: 'Completed',
      pending_grn_count: 'Pending GRN',
      pending_putaway_count: 'Pending putaway',
      last_refresh_ist: 'Last refresh'
    };
    return labels[key] || key.replace(/_/g, ' ');
  }

  function metricValue(key, value) {
    if (/_days$/i.test(key)) {
      return formatDays(value);
    }
    return displayValue(key, value);
  }

  function cssToken(value) {
    return String(value || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
  }

  function normalizeYear(value) {
    const text = String(value || '');
    return text.length === 2 ? '20' + text : text;
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function setText(id, value) {
    document.getElementById(id).textContent = value;
  }

  function setConnectionStatus(text, className) {
    const status = document.getElementById('connectionStatus');
    status.className = 'status-pill ' + className;
    status.textContent = text;
  }
})();
