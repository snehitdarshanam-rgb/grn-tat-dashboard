(function () {
  const config = window.GRN_DASHBOARD_CONFIG || {};
  const sampleData = window.GRN_SAMPLE_DATA || {};
  const state = {
    data: sampleData,
    activeTab: 'overall',
    currentRows: [],
    loading: false,
    detailsLoaded: false,
    filtersInitialized: false,
    sidebarPinned: true,
    sidebarHidden: false
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
        ['arrival_to_grn_minutes', 'Arrival to GRN'],
        ['grn_to_putaway_minutes', 'GRN to putaway'],
        ['arrival_to_putaway_minutes', 'Arrival to putaway'],
        ['boxes_received', 'Boxes'],
        ['received_quantity', 'Received qty'],
        ['vehicle_type', 'Vehicle type'],
        ['priority', 'Priority'],
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
        ['priority', 'Priority'],
        ['warehouse', 'Warehouse'],
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
        ['vehicle_type', 'Vehicle type'],
        ['warehouse', 'Warehouse'],
        ['recommended_action', 'Recommended action'],
        ['match_status', 'Match']
      ]
    },
    sla: {
      title: 'SLA Summary',
      rows: function () { return objectToMetricRows(currentSummary()); },
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
    restoreSidebarState();
    bindEvents();
    applySidebarState();
    loadData();
    const refreshMs = Number(config.refreshMinutes || 30) * 60 * 1000;
    window.setInterval(loadData, refreshMs);
  });

  function bindEvents() {
    document.getElementById('refreshButton').addEventListener('click', loadData);
    document.getElementById('exportButton').addEventListener('click', exportCurrentRows);
    document.getElementById('filterToggle').addEventListener('click', toggleFilterPanel);
    document.getElementById('pinSidebarButton').addEventListener('click', toggleSidebarPin);
    document.getElementById('hideSidebarButton').addEventListener('click', hideSidebar);
    document.getElementById('showSidebarButton').addEventListener('click', showSidebar);

    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        state.activeTab = tab.getAttribute('data-tab');
        document.querySelectorAll('.tab').forEach(function (item) {
          item.classList.toggle('is-active', item === tab);
        });
        render();
      });
    });

    ['monthFilter', 'priorityFilter', 'statusFilter', 'ageingFilter', 'warehouseFilter', 'vendorFilter'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', function () {
        normalizeAllSelection(id);
        updateFilterSummary();
        render();
      });
    });
  }

  function restoreSidebarState() {
    try {
      state.sidebarPinned = window.localStorage.getItem('grn_sidebar_pinned') !== 'no';
    } catch (error) {
      state.sidebarPinned = true;
    }
  }

  function toggleFilterPanel() {
    const panel = document.getElementById('filterPanel');
    const toggle = document.getElementById('filterToggle');
    const shouldOpen = panel.hasAttribute('hidden');
    panel.toggleAttribute('hidden', !shouldOpen);
    toggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  }

  function toggleSidebarPin() {
    state.sidebarPinned = !state.sidebarPinned;
    state.sidebarHidden = false;
    try {
      window.localStorage.setItem('grn_sidebar_pinned', state.sidebarPinned ? 'yes' : 'no');
    } catch (error) {}
    applySidebarState();
  }

  function hideSidebar() {
    state.sidebarHidden = true;
    applySidebarState();
  }

  function showSidebar() {
    state.sidebarHidden = false;
    applySidebarState();
  }

  function applySidebarState() {
    const shell = document.getElementById('dashboardShell');
    const pinButton = document.getElementById('pinSidebarButton');
    shell.classList.toggle('is-sidebar-hidden', state.sidebarHidden);
    shell.classList.toggle('is-sidebar-floating', !state.sidebarPinned);
    pinButton.setAttribute('aria-pressed', state.sidebarPinned ? 'true' : 'false');
    pinButton.textContent = state.sidebarPinned ? 'Pinned' : 'Pin';
  }

  async function loadData() {
    if (state.loading) {
      return;
    }
    state.loading = true;
    state.detailsLoaded = false;
    setConnectionStatus('Loading', 'status-neutral');

    try {
      if (!config.apiUrl) {
        if (config.useSampleDataWhenApiMissing) {
          state.data = sampleData;
          state.detailsLoaded = true;
          setConnectionStatus('Sample data', 'status-neutral');
        } else {
          throw new Error('Missing Apps Script API URL');
        }
      } else {
        const summary = await loadApiData('summary');
        state.data = Object.assign({}, summary, {
          overall_tat: [],
          pending_actions: [],
          priority_grn_queue: [],
          source_status: [],
          error_log: [],
          row_audit: []
        });
        populateFilters();
        setConnectionStatus('Loading details', 'status-neutral');
        render();
        const details = await loadApiData('details');
        state.data = details;
        state.detailsLoaded = true;
        setConnectionStatus('Live data', 'status-ok');
      }
      populateFilters();
      render();
    } catch (error) {
      console.error(error);
      if (config.useSampleDataWhenApiMissing) {
        state.data = sampleData;
        state.detailsLoaded = true;
        populateFilters();
        render();
      }
      setConnectionStatus('API error', 'status-error');
    } finally {
      state.loading = false;
    }
  }

  async function loadApiData(view) {
    const url = buildApiUrl(null, view);
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
      return fetchJsonp(view);
    }
  }

  function buildApiUrl(callbackName, view) {
    const url = new URL(config.apiUrl);
    if (config.readToken) {
      url.searchParams.set('token', config.readToken);
    }
    if (callbackName) {
      url.searchParams.set('callback', callbackName);
    }
    if (view) {
      url.searchParams.set('view', view);
    }
    url.searchParams.set('_', String(Date.now()));
    return url.toString();
  }

  function fetchJsonp(view) {
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

      script.src = buildApiUrl(callbackName, view);
      document.body.appendChild(script);
    });
  }

  function populateFilters() {
    const rows = filterSourceRows();
    setOptions('monthFilter', monthValues(rows), {
      labels: monthLabels(rows),
      defaultValue: currentMonthValue()
    });
    setOptions('priorityFilter', uniqueValues(rows, 'priority', priorityLabel));
    setOptions('statusFilter', uniqueValues(rows, 'status'));
    setOptions('ageingFilter', uniqueValues(rows, 'ageing_bucket'));
    setOptions('warehouseFilter', uniqueValues(rows, 'warehouse'));
    setOptions('vendorFilter', uniqueValues(rows, 'supplier_vendor_group', function (value, row) {
      return value || normalizeVendorName(row.supplier_vendor);
    }));
  }

  function filterSourceRows() {
    const summaryRows = state.data.overall_tat_summary || [];
    const detailRows = state.data.overall_tat || [];
    if (detailRows.length) {
      return detailRows
        .concat(state.data.pending_actions || [])
        .concat(state.data.priority_grn_queue || []);
    }
    return summaryRows;
  }

  function setOptions(id, values, options) {
    options = options || {};
    const select = document.getElementById(id);
    const selected = selectedValues(id);
    select.innerHTML = '<option value="">All</option>';
    values.forEach(function (value) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = options.labels && options.labels[value] ? options.labels[value] : value;
      select.appendChild(option);
    });
    const validSelected = selected.filter(function (value) { return values.indexOf(value) !== -1; });
    if (validSelected.length) {
      Array.prototype.forEach.call(select.options, function (option) {
        option.selected = validSelected.indexOf(option.value) !== -1;
      });
    } else if (!state.filtersInitialized && options.defaultValue && values.indexOf(options.defaultValue) !== -1) {
      select.value = options.defaultValue;
    } else {
      select.value = '';
    }
    normalizeAllSelection(id);
    if (id === 'vendorFilter') {
      state.filtersInitialized = true;
      updateFilterSummary();
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

  function monthValues(rows) {
    const seen = {};
    rows.forEach(function (row) {
      const month = monthValue(row.reporting_time_ist);
      if (month) {
        seen[month] = true;
      }
    });
    return Object.keys(seen).sort().reverse();
  }

  function monthLabels(rows) {
    const labels = {};
    monthValues(rows).forEach(function (value) {
      const parts = value.split('-');
      const date = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
      labels[value] = date.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
    });
    return labels;
  }

  function currentMonthValue() {
    const now = new Date();
    return now.getFullYear() + '-' + pad2(now.getMonth() + 1);
  }

  function monthValue(value) {
    const date = comparableDate(value);
    return date ? date.slice(0, 7) : '';
  }

  function selectedValues(id) {
    const select = document.getElementById(id);
    if (!select) {
      return [];
    }
    return Array.prototype.slice.call(select.selectedOptions || [])
      .map(function (option) { return option.value; })
      .filter(function (value) { return value !== ''; });
  }

  function normalizeAllSelection(id) {
    const select = document.getElementById(id);
    if (!select || !select.multiple) {
      return;
    }
    const chosen = selectedValues(id);
    Array.prototype.forEach.call(select.options, function (option) {
      if (option.value === '') {
        option.selected = chosen.length === 0;
      }
    });
  }

  function render() {
    renderMetrics();
    renderMeta();
    updateFilterSummary();
    renderTable();
  }

  function updateFilterSummary() {
    const summary = [];
    const month = document.getElementById('monthFilter');
    if (month && month.value) {
      summary.push(month.options[month.selectedIndex] ? month.options[month.selectedIndex].textContent : month.value);
    } else {
      summary.push('All months');
    }
    [
      ['priorityFilter', 'priority'],
      ['statusFilter', 'status'],
      ['ageingFilter', 'ageing'],
      ['warehouseFilter', 'warehouse'],
      ['vendorFilter', 'vendor']
    ].forEach(function (item) {
      const count = selectedValues(item[0]).length;
      if (count) {
        summary.push(count + ' ' + item[1]);
      }
    });
    setText('filterSummary', summary.join(' | '));
  }

  function renderMetrics() {
    const summary = currentSummary();
    setText('metricUnloadPutaway', formatMinutes(summary.avg_arrival_to_putaway_minutes));
    setText('metricUnloadGrn', formatMinutes(summary.avg_arrival_to_grn_minutes));
    setText('metricGrnPutaway', formatMinutes(summary.avg_grn_to_putaway_minutes));
    setText('metricBoxes', formatNumber(summary.total_inward_boxes));
    setText('metricQty', formatNumber(summary.total_qty_received));
    setText('metricVehicles', formatCount(summary.vehicle_unloaded_count));
    setText('metricVehicleTypes', summary.vehicle_type_breakup || '-');
    setText('currentRowsCount', formatCount(summary.line_count));
    setText('currentCompleted', formatCount(summary.completed_count));
    setText('currentPendingGrn', formatCount(summary.pending_grn_count));
    setText('currentPendingPutaway', formatCount(summary.pending_putaway_count));
    setText('currentBreaches', formatCount(summary.sla_breach_count));
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
    setText('currentViewTitle', view.title);

    const host = document.getElementById('tableHost');
    host.innerHTML = '';
    if (state.activeTab === 'sla') {
      renderSlaView(host);
      return;
    }
    if (!state.detailsLoaded) {
      const loading = document.createElement('div');
      loading.className = 'empty-state';
      loading.textContent = 'Detailed rows are loading. KPI summary is ready.';
      host.appendChild(loading);
      return;
    }
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No rows match the selected filters';
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
    const summary = currentSummary();
    const urgent = Number(summary.p0_pending_count || 0) + Number(summary.p1_pending_count || 0);
    const cards = [
      ['Avg Arrival to Putaway', formatMinutes(summary.avg_arrival_to_putaway_minutes), 'Avg Arrival to GRN plus Avg GRN to Putaway'],
      ['Avg Arrival to GRN', formatMinutes(summary.avg_arrival_to_grn_minutes), 'Reporting or arrival timestamp to Uniware GRN received timestamp'],
      ['Avg GRN to putaway', formatMinutes(summary.avg_grn_to_putaway_minutes), 'Filtered matched putaway rows'],
      ['SLA breaches', formatCount(summary.sla_breach_count), 'Open or completed lines crossing configured SLA'],
      ['Urgent GRN pending', formatCount(urgent), 'P0 plus P1 pending GRN lines'],
      ['Vehicles unloaded', formatCount(summary.vehicle_unloaded_count), 'Distinct reporting date plus vehicle number'],
      ['Completed', formatCount(summary.completed_count), 'Lines fully docked to stock'],
      ['Pending GRN / Putaway', formatCount(summary.pending_grn_count) + ' / ' + formatCount(summary.pending_putaway_count), 'Open operational handoffs']
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
    return rows.filter(matchesGlobalFilters);
  }

  function applyPendingFilters(rows) {
    return rows.filter(matchesGlobalFilters);
  }

  function applyPriorityFilters(rows) {
    return rows.filter(matchesGlobalFilters);
  }

  function matchesGlobalFilters(row) {
    return matchesMonth(row) &&
      matchesMultiSelect('priorityFilter', priorityLabel(row.priority)) &&
      matchesMultiSelect('statusFilter', row.status) &&
      matchesMultiSelect('ageingFilter', row.ageing_bucket) &&
      matchesMultiSelect('warehouseFilter', row.warehouse) &&
      matchesMultiSelect('vendorFilter', row.supplier_vendor_group || normalizeVendorName(row.supplier_vendor));
  }

  function matchesMonth(row) {
    const selected = document.getElementById('monthFilter').value;
    return !selected || monthValue(row.reporting_time_ist) === selected;
  }

  function matchesMultiSelect(id, value) {
    const selected = selectedValues(id);
    if (!selected.length) {
      return true;
    }
    return selected.indexOf(String(value || '').trim()) !== -1;
  }

  function filteredOverallRows() {
    const rows = state.detailsLoaded && (state.data.overall_tat || []).length ?
      state.data.overall_tat :
      (state.data.overall_tat_summary || state.data.overall_tat || []);
    return applyOverallFilters(rows);
  }

  function currentSummary() {
    const rows = filteredOverallRows();
    if (rows.length || state.filtersInitialized) {
      return summarizeRows(rows);
    }
    return normalizeBackendSummary(state.data.sla_summary || {});
  }

  function summarizeRows(rows) {
    const completed = rows.filter(function (row) { return row.status === 'Completed'; });
    const pendingGrn = rows.filter(function (row) { return row.status === 'Pending GRN'; });
    const pendingPutaway = rows.filter(function (row) { return row.status === 'Pending putaway'; });
    const p0Pending = pendingGrn.filter(function (row) { return priorityLabel(row.priority) === 'P0'; });
    const p1Pending = pendingGrn.filter(function (row) { return priorityLabel(row.priority) === 'P1'; });
    const inventoryMissing = pendingGrn.filter(function (row) { return priorityLabel(row.priority) === 'Inventory missing'; });
    return {
      line_count: rows.length,
      avg_arrival_to_grn_minutes: averageMinutes(rows, 'arrival_to_grn_minutes'),
      avg_unloading_to_grn_minutes: averageMinutes(rows, 'unloading_to_grn_minutes'),
      avg_grn_to_putaway_minutes: averageMinutes(rows, 'grn_to_putaway_minutes'),
      avg_arrival_to_putaway_minutes: sumMinuteValues(
        averageMinutes(rows, 'arrival_to_grn_minutes'),
        averageMinutes(rows, 'grn_to_putaway_minutes')
      ),
      avg_unloading_to_putaway_minutes: averageMinutes(rows, 'unloading_to_putaway_minutes'),
      avg_dock_to_stock_minutes: averageMinutes(completed, 'dock_to_stock_minutes'),
      total_inward_boxes: sumField(rows, 'boxes_received'),
      total_qty_received: sumField(rows, 'received_quantity'),
      vehicle_unloaded_count: vehicleCount(rows),
      vehicle_type_breakup: vehicleTypeBreakup(rows),
      sla_breach_count: rows.filter(function (row) { return row.sla_breach === 'Yes'; }).length,
      p0_pending_count: p0Pending.length,
      p1_pending_count: p1Pending.length,
      inventory_missing_priority_count: inventoryMissing.length,
      completed_count: completed.length,
      pending_grn_count: pendingGrn.length,
      pending_putaway_count: pendingPutaway.length,
      last_refresh_ist: (state.data.meta || {}).last_refresh_ist || (state.data.sla_summary || {}).last_refresh_ist || ''
    };
  }

  function normalizeBackendSummary(summary) {
    return {
      line_count: Number(summary.completed_count || 0) + Number(summary.pending_grn_count || 0) + Number(summary.pending_putaway_count || 0),
      avg_arrival_to_grn_minutes: summary.avg_arrival_to_grn_minutes || deriveSummaryArrivalToGrn(summary),
      avg_unloading_to_grn_minutes: summary.avg_unloading_to_grn_minutes || daysToMinutes(summary.avg_unloading_to_grn_days),
      avg_grn_to_putaway_minutes: summary.avg_grn_to_putaway_minutes || daysToMinutes(summary.avg_grn_to_putaway_days),
      avg_arrival_to_putaway_minutes: summary.avg_arrival_to_putaway_minutes || sumMinuteValues(
        summary.avg_arrival_to_grn_minutes || deriveSummaryArrivalToGrn(summary),
        summary.avg_grn_to_putaway_minutes || daysToMinutes(summary.avg_grn_to_putaway_days)
      ),
      avg_unloading_to_putaway_minutes: summary.avg_unloading_to_putaway_minutes || '',
      avg_dock_to_stock_minutes: summary.avg_dock_to_stock_minutes || daysToMinutes(summary.avg_dock_to_stock_days),
      total_inward_boxes: summary.total_inward_boxes || '',
      total_qty_received: summary.total_qty_received || '',
      vehicle_unloaded_count: summary.vehicle_unloaded_count || '',
      vehicle_type_breakup: summary.vehicle_type_breakup || '',
      sla_breach_count: summary.sla_breach_count || '',
      p0_pending_count: summary.p0_pending_count || '',
      p1_pending_count: summary.p1_pending_count || '',
      inventory_missing_priority_count: summary.inventory_missing_priority_count || '',
      completed_count: summary.completed_count || '',
      pending_grn_count: summary.pending_grn_count || '',
      pending_putaway_count: summary.pending_putaway_count || '',
      last_refresh_ist: summary.last_refresh_ist || ''
    };
  }

  function averageMinutes(rows, key) {
    const values = rows
      .map(function (row) { return rowMinutes(row, key); })
      .filter(hasMinuteValue)
      .map(function (value) { return Number(value); })
      .filter(function (value) { return !isNaN(value) && value >= 0; });
    if (!values.length) {
      return '';
    }
    const total = values.reduce(function (sum, value) { return sum + value; }, 0);
    return Math.round(total / values.length);
  }

  function rowMinutes(row, key) {
    const value = row[key];
    if (hasMinuteValue(value)) {
      return value;
    }
    if (key === 'arrival_to_grn_minutes') {
      const dockToStock = hasMinuteValue(row.dock_to_stock_minutes) ? Number(row.dock_to_stock_minutes) : NaN;
      const grnToPutaway = hasMinuteValue(row.grn_to_putaway_minutes) ? Number(row.grn_to_putaway_minutes) : NaN;
      if (!isNaN(dockToStock) && !isNaN(grnToPutaway) && dockToStock >= grnToPutaway) {
        return dockToStock - grnToPutaway;
      }
    }
    if (key === 'arrival_to_putaway_minutes') {
      return hasMinuteValue(row.dock_to_stock_minutes) ? row.dock_to_stock_minutes : '';
    }
    return '';
  }

  function hasMinuteValue(value) {
    return value !== '' && value !== null && value !== undefined &&
      String(value).trim() !== '' && !isNaN(Number(value));
  }

  function sumMinuteValues(left, right) {
    if (left === '' || right === '' || left === null || right === null ||
        left === undefined || right === undefined || isNaN(Number(left)) || isNaN(Number(right))) {
      return '';
    }
    return Math.round(Number(left) + Number(right));
  }

  function deriveSummaryArrivalToGrn(summary) {
    const dockToStock = summary.avg_dock_to_stock_minutes || daysToMinutes(summary.avg_dock_to_stock_days);
    const grnToPutaway = summary.avg_grn_to_putaway_minutes || daysToMinutes(summary.avg_grn_to_putaway_days);
    if (hasMinuteValue(dockToStock) && hasMinuteValue(grnToPutaway) && Number(dockToStock) >= Number(grnToPutaway)) {
      return Number(dockToStock) - Number(grnToPutaway);
    }
    return '';
  }

  function sumField(rows, key) {
    const total = rows.reduce(function (sum, row) {
      const value = Number(String(row[key] || '').replace(/,/g, ''));
      return isNaN(value) ? sum : sum + value;
    }, 0);
    return Math.round(total * 100) / 100;
  }

  function vehicleCount(rows) {
    const seen = {};
    rows.forEach(function (row) {
      const vehicle = cleanVehicle(row.vehicle_number);
      const date = comparableDate(row.reporting_time_ist || row.unloading_start_time_ist);
      if (vehicle && date) {
        seen[date + '|' + vehicle] = true;
      }
    });
    return Object.keys(seen).length;
  }

  function vehicleTypeBreakup(rows) {
    const vehicleTypes = {};
    rows.forEach(function (row) {
      const vehicle = cleanVehicle(row.vehicle_number);
      const date = comparableDate(row.reporting_time_ist || row.unloading_start_time_ist);
      if (!vehicle || !date) {
        return;
      }
      const type = String(row.vehicle_type || 'Unknown').trim() || 'Unknown';
      vehicleTypes[date + '|' + vehicle + '|' + type] = type;
    });
    const counts = {};
    Object.keys(vehicleTypes).forEach(function (key) {
      const type = vehicleTypes[key];
      counts[type] = (counts[type] || 0) + 1;
    });
    return Object.keys(counts).sort().map(function (type) {
      return type + ': ' + counts[type];
    }).join(' | ');
  }

  function cleanVehicle(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function daysToMinutes(value) {
    if (value === '' || value === null || value === undefined || isNaN(Number(value))) {
      return '';
    }
    return Math.round(Number(value) * 24 * 60);
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

  function formatMinutes(value) {
    if (value === '' || value === null || value === undefined || isNaN(Number(value))) {
      return '-';
    }
    const totalMinutes = Math.round(Number(value));
    const sign = totalMinutes < 0 ? '-' : '';
    const absoluteMinutes = Math.abs(totalMinutes);
    const hours = Math.floor(absoluteMinutes / 60);
    const minutes = absoluteMinutes % 60;
    return sign + String(hours).padStart(2, '0') + ':' + pad2(minutes);
  }

  function formatNumber(value) {
    if (value === '' || value === null || value === undefined) {
      return '-';
    }
    const number = Number(String(value).replace(/,/g, '').trim());
    if (isNaN(number)) {
      return String(value);
    }
    return number.toLocaleString('en-IN', {
      maximumFractionDigits: 2
    });
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
    if (/_minutes$/i.test(key)) {
      return formatMinutes(value);
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

  function formatCount(value) {
    if (value === '' || value === null || value === undefined) {
      return '-';
    }
    if (!isNaN(Number(value))) {
      return String(Math.round(Number(value)));
    }
    const text = String(value).trim();
    const accidentalDate = text.match(/^(\d{1,2})[-/](\d{1,2})[-/]1900(?:[ T,]+\d{1,2}:\d{2})?$/);
    if (accidentalDate && Number(accidentalDate[2]) === 1) {
      return String(Number(accidentalDate[1]));
    }
    return text;
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
      avg_arrival_to_grn_minutes: 'Avg Arrival to GRN',
      avg_unloading_to_grn_minutes: 'Avg unload to GRN',
      avg_grn_to_putaway_minutes: 'Avg GRN to putaway',
      avg_arrival_to_putaway_minutes: 'Avg Arrival to Putaway',
      avg_unloading_to_putaway_minutes: 'Avg unload to putaway',
      avg_dock_to_stock_minutes: 'Avg dock to stock',
      total_inward_boxes: 'Total inward boxes',
      total_qty_received: 'Total Qty received',
      vehicle_unloaded_count: 'Vehicles unloaded',
      vehicle_type_breakup: 'Vehicle type breakup',
      line_count: 'Rows',
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
    if (/_minutes$/i.test(key)) {
      return formatMinutes(value);
    }
    if (/_days$/i.test(key)) {
      return formatDays(value);
    }
    if (key === 'total_inward_boxes' || key === 'total_qty_received') {
      return formatNumber(value);
    }
    if (/_count$/i.test(key)) {
      return formatCount(value);
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
