(function () {
  const config = window.GRN_DASHBOARD_CONFIG || {};
  const sampleData = window.GRN_SAMPLE_DATA || {};
  const state = {
    data: sampleData,
    activeTab: 'overall',
    currentRows: [],
    loading: false
  };

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
        return (state.data.source_status || []).concat(state.data.error_log || []);
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
        ['error', 'Error']
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
    setOptions('priorityFilter', uniqueValues(state.data.priority_grn_queue || [], 'priority'));
    setOptions('statusFilter', uniqueValues(state.data.overall_tat || [], 'status'));
    setOptions('ageingFilter', uniqueValues(state.data.pending_actions || [], 'ageing_bucket'));
    setOptions('warehouseFilter', uniqueValues(state.data.overall_tat || [], 'warehouse'));
    setOptions('vendorFilter', uniqueValues(state.data.overall_tat || [], 'supplier_vendor'));
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

  function uniqueValues(rows, key) {
    const seen = {};
    rows.forEach(function (row) {
      const value = String(row[key] || '').trim();
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
    setText('metricGrnPutaway', formatDays(summary.avg_grn_to_putaway_days));
    setText('metricDockStock', formatDays(summary.avg_dock_to_stock_days));
    setText('metricBreaches', valueOrDash(summary.sla_breach_count));
    setText('metricP0P1', valueOrDash(Number(summary.p0_pending_count || 0) + Number(summary.p1_pending_count || 0)));
  }

  function renderMeta() {
    const meta = state.data.meta || {};
    const lastRefresh = meta.last_refresh_ist || (state.data.sla_summary || {}).last_refresh_ist || '-';
    setText('lastRefresh', 'Last refresh: ' + lastRefresh);
  }

  function renderTable() {
    const view = views[state.activeTab];
    const rows = view.rows();
    state.currentRows = rows;
    document.getElementById('viewTitle').textContent = view.title;

    const host = document.getElementById('tableHost');
    host.innerHTML = '';
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

  function appendCell(tr, key, row) {
    const td = document.createElement('td');
    const value = row[key];
    if (key === 'priority') {
      td.appendChild(badge(value, 'badge-' + String(value || 'unknown').toLowerCase()));
    } else if (key === 'status') {
      td.appendChild(statusBadge(value));
    } else if (key === 'sla_breach' && value === 'Yes') {
      td.appendChild(badge('Delayed', 'badge-delayed'));
    } else {
      td.textContent = valueOrDash(value);
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
      return 'row-' + String(row.priority).toLowerCase();
    }
    return '';
  }

  function applyOverallFilters(rows) {
    return rows.filter(function (row) {
      return matchesSelect('statusFilter', row.status) &&
        matchesSelect('warehouseFilter', row.warehouse) &&
        matchesSelect('vendorFilter', row.supplier_vendor) &&
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
      return matchesSelect('priorityFilter', row.priority);
    });
  }

  function matchesSelect(id, value) {
    const selected = document.getElementById(id).value;
    return !selected || String(value || '') === selected;
  }

  function matchesDateRange(value) {
    const from = document.getElementById('fromDateFilter').value;
    const to = document.getElementById('toDateFilter').value;
    const date = String(value || '').slice(0, 10);
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
        metric: key.replace(/_/g, ' '),
        value: object[key]
      };
    });
  }

  function exportCurrentRows() {
    const view = views[state.activeTab];
    const headers = view.columns.map(function (column) { return column[0]; });
    const labels = view.columns.map(function (column) { return column[1]; });
    const csvRows = [labels].concat(state.currentRows.map(function (row) {
      return headers.map(function (key) { return row[key] === undefined ? '' : row[key]; });
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

  function valueOrDash(value) {
    if (value === '' || value === null || value === undefined) {
      return '-';
    }
    return String(value);
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
