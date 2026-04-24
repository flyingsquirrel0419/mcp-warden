(function () {
  "use strict";

  var WS_RECONNECT_DELAY = 2000;
  var ws = null;
  var reconnectTimer = null;

  var el = {
    wsStatus: document.getElementById("wsStatus"),
    statTotalCalls: document.getElementById("statTotalCalls"),
    statBlocked: document.getElementById("statBlocked"),
    statActiveServers: document.getElementById("statActiveServers"),
    statAvgResponse: document.getElementById("statAvgResponse"),
    serverStatus: document.getElementById("serverStatus"),
    recentLogs: document.getElementById("recentLogs"),
    dailyChart: document.getElementById("dailyChart"),
    topToolsChart: document.getElementById("topToolsChart"),
    serverBreakdown: document.getElementById("serverBreakdown"),
    policyEditor: document.getElementById("policyEditor"),
    savePolicy: document.getElementById("savePolicy"),
    saveStatus: document.getElementById("saveStatus"),
    configDisplay: document.getElementById("configDisplay"),
  };

  var currentAnalyticsDays = 7;

  // ─── Tabs ───

  document.querySelectorAll(".nav-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var tab = btn.getAttribute("data-tab");
      document.querySelectorAll(".nav-btn").forEach(function (b) {
        b.classList.remove("active");
      });
      btn.classList.add("active");
      document.querySelectorAll(".tab-panel").forEach(function (p) {
        p.classList.remove("active");
      });
      document.getElementById("tab-" + tab).classList.add("active");

      if (tab === "analytics") {
        loadAnalytics();
      }
      if (tab === "settings") {
        loadPolicy();
        loadConfig();
      }
    });
  });

  // ─── Analytics range buttons ───

  document.querySelectorAll(".btn-group__btn[data-days]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".btn-group__btn[data-days]").forEach(function (b) {
        b.classList.remove("active");
      });
      btn.classList.add("active");
      currentAnalyticsDays = parseInt(btn.getAttribute("data-days"), 10);
      loadAnalytics();
    });
  });

  // ─── Save Policy ───

  el.savePolicy.addEventListener("click", function () {
    var yaml = el.policyEditor.value;
    el.saveStatus.textContent = "Saving...";
    el.saveStatus.className = "save-status";

    fetch("/api/policy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yaml: yaml }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (result.ok) {
          el.saveStatus.textContent = "Saved ✓";
          el.saveStatus.className = "save-status save-status--success";
        } else {
          el.saveStatus.textContent = result.data.error || "Save failed";
          el.saveStatus.className = "save-status save-status--error";
        }
        setTimeout(function () {
          el.saveStatus.textContent = "";
        }, 4000);
      })
      .catch(function () {
        el.saveStatus.textContent = "Network error";
        el.saveStatus.className = "save-status save-status--error";
      });
  });

  // ─── WebSocket ───

  function connectWS() {
    var proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(proto + "//" + location.host);

    ws.addEventListener("open", function () {
      el.wsStatus.classList.add("connected");
      el.wsStatus.title = "WebSocket connected";
    });

    ws.addEventListener("close", function () {
      el.wsStatus.classList.remove("connected");
      el.wsStatus.title = "WebSocket disconnected";
      scheduleReconnect();
    });

    ws.addEventListener("error", function () {
      ws.close();
    });

    ws.addEventListener("message", function (event) {
      try {
        var msg = JSON.parse(event.data);
        handleWSMessage(msg);
      } catch (e) {
        // ignore malformed
      }
    });
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      connectWS();
    }, WS_RECONNECT_DELAY);
  }

  function handleWSMessage(msg) {
    if (msg.type === "log" && msg.data) {
      prependLogRow(msg.data);
    } else if (msg.type === "alert") {
      loadStatus();
    } else if (msg.type === "status") {
      loadStatus();
    }
  }

  // ─── API Calls ───

  function loadStatus() {
    fetch("/api/status")
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        el.statTotalCalls.textContent = formatNumber(data.totalCalls);
        el.statBlocked.textContent = formatNumber(data.blockedCalls);
        el.statActiveServers.textContent = formatNumber(data.activeServers);
        el.statAvgResponse.textContent = data.avgResponseTime + " ms";
        renderServerStatus(data.serverStatuses);
      })
      .catch(function () {
        // silently ignore
      });
  }

  function loadRecentLogs() {
    fetch("/api/logs/recent?limit=50")
      .then(function (r) {
        return r.json();
      })
      .then(function (entries) {
        var tbody = el.recentLogs.querySelector("tbody");
        tbody.innerHTML = "";
        entries.forEach(function (entry) {
          tbody.appendChild(createLogRow(entry));
        });
      })
      .catch(function () {
        // silently ignore
      });
  }

  function loadAnalytics() {
    fetch("/api/stats/analytics?days=" + currentAnalyticsDays)
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        renderDailyChart(data.daily);
        renderTopTools(data.topTools);
        renderServerBreakdown(data.servers);
      })
      .catch(function () {
        // silently ignore
      });
  }

  function loadPolicy() {
    fetch("/api/policy")
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        el.policyEditor.value = data.yaml || "";
        el.policyEditor.placeholder = data.exists ? "" : "No policy file found. Create one below.";
      })
      .catch(function () {
        // silently ignore
      });
  }

  function loadConfig() {
    fetch("/api/config")
      .then(function (r) {
        return r.json();
      })
      .then(function (config) {
        var html = "";
        Object.keys(config).forEach(function (key) {
          html +=
            '<div class="config-row">' +
            '<span class="config-row__key">' +
            escapeHtml(key) +
            "</span>" +
            '<span class="config-row__value">' +
            escapeHtml(String(config[key])) +
            "</span>" +
            "</div>";
        });
        el.configDisplay.innerHTML = html;
      })
      .catch(function () {
        el.configDisplay.innerHTML = '<p class="empty-state">Failed to load config</p>';
      });
  }

  // ─── Renderers ───

  function renderServerStatus(statuses) {
    if (!statuses || Object.keys(statuses).length === 0) {
      el.serverStatus.innerHTML = '<p class="empty-state">No server data yet</p>';
      return;
    }

    var html = "";
    Object.keys(statuses).forEach(function (name) {
      var s = statuses[name];
      var blocked = s.blocked > 0;
      var badgeClass = blocked ? "badge--blocked" : "badge--active";
      var badgeText = blocked ? "Blocked" : "Active";

      html +=
        '<div class="server-item">' +
        '<span class="server-item__name">' +
        escapeHtml(name) +
        "</span>" +
        '<div class="server-item__stats">' +
        "<span>" +
        formatNumber(s.total) +
        " calls</span>" +
        "<span>" +
        Math.round(s.avgDuration) +
        " ms avg</span>" +
        '<span class="badge ' +
        badgeClass +
        '">' +
        badgeText +
        "</span>" +
        "</div>" +
        "</div>";
    });
    el.serverStatus.innerHTML = html;
  }

  function createLogRow(entry) {
    var tr = document.createElement("tr");
    if (entry.blocked) tr.className = "row-blocked";

    var time = formatTime(entry.timestamp);
    var dotClass = entry.blocked ? "status-dot--blocked" : "status-dot--ok";
    var statusLabel = entry.blocked ? "Blocked" : "OK";

    tr.innerHTML =
      '<td class="mono">' +
      escapeHtml(time) +
      "</td>" +
      "<td>" +
      escapeHtml(entry.server) +
      "</td>" +
      '<td class="mono">' +
      escapeHtml(entry.tool) +
      "</td>" +
      '<td class="mono">' +
      Math.round(entry.duration_ms) +
      " ms</td>" +
      "<td>" +
      '<span class="status-dot ' +
      dotClass +
      '"></span>' +
      statusLabel +
      "</td>";

    return tr;
  }

  function prependLogRow(entry) {
    var tbody = el.recentLogs.querySelector("tbody");
    var tr = createLogRow(entry);
    tbody.insertBefore(tr, tbody.firstChild);

    // Limit rows
    while (tbody.children.length > 50) {
      tbody.removeChild(tbody.lastChild);
    }
  }

  function renderDailyChart(daily) {
    if (!daily || daily.length === 0) {
      el.dailyChart.innerHTML = '<p class="empty-state">No data for this period</p>';
      return;
    }

    var maxTotal = Math.max.apply(
      null,
      daily.map(function (d) {
        return d.total;
      }),
    );
    maxTotal = Math.max(maxTotal, 1);

    var html = "";
    daily.forEach(function (d) {
      var heightPct = (d.total / maxTotal) * 100;
      var label = d.date.slice(5); // MM-DD

      html +=
        '<div class="chart-bar-group">' +
        '<span class="chart-bar-value">' +
        formatNumber(d.total) +
        "</span>" +
        '<div class="chart-bar" style="height: ' +
        heightPct +
        '%"></div>' +
        '<span class="chart-bar-label">' +
        escapeHtml(label) +
        "</span>" +
        "</div>";
    });
    el.dailyChart.innerHTML = html;
  }

  function renderTopTools(tools) {
    if (!tools || tools.length === 0) {
      el.topToolsChart.innerHTML = '<p class="empty-state">No tool data</p>';
      return;
    }

    var maxCount = Math.max.apply(
      null,
      tools.map(function (t) {
        return t.count;
      }),
    );
    maxCount = Math.max(maxCount, 1);

    var html = "";
    tools.forEach(function (t) {
      var pct = (t.count / maxCount) * 100;
      var blockedPct = t.blocked > 0 ? (t.blocked / t.count) * 100 : 0;

      html +=
        '<div class="h-bar-row">' +
        '<span class="h-bar-label" title="' +
        escapeHtml(t.tool) +
        '">' +
        escapeHtml(t.tool) +
        "</span>" +
        '<div class="h-bar-track">' +
        '<div class="h-bar-fill" style="width: ' +
        pct +
        '%"></div>' +
        (blockedPct > 0
          ? '<div class="h-bar-fill h-bar-fill--blocked" style="width: ' +
            blockedPct +
            '%; position: absolute; top: 0; right: 0;"></div>'
          : "") +
        "</div>" +
        '<span class="h-bar-count">' +
        formatNumber(t.count) +
        "</span>" +
        "</div>";
    });
    el.topToolsChart.innerHTML = html;
  }

  function renderServerBreakdown(servers) {
    if (!servers || servers.length === 0) {
      var tbody = el.serverBreakdown.querySelector("tbody");
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No data</td></tr>';
      return;
    }

    var tbody = el.serverBreakdown.querySelector("tbody");
    var html = "";
    servers.forEach(function (s) {
      html +=
        "<tr>" +
        "<td>" +
        escapeHtml(s.server) +
        "</td>" +
        "<td>" +
        formatNumber(s.total) +
        "</td>" +
        "<td>" +
        formatNumber(s.blocked) +
        "</td>" +
        '<td class="mono">' +
        Math.round(s.avg_duration) +
        "</td>" +
        "</tr>";
    });
    tbody.innerHTML = html;
  }

  // ─── Utilities ───

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function formatNumber(n) {
    if (n === undefined || n === null) return "0";
    return Number(n).toLocaleString();
  }

  function formatTime(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    var h = String(d.getHours()).padStart(2, "0");
    var m = String(d.getMinutes()).padStart(2, "0");
    var s = String(d.getSeconds()).padStart(2, "0");
    return h + ":" + m + ":" + s;
  }

  // ─── Init ───

  loadStatus();
  loadRecentLogs();
  connectWS();

  // Refresh status every 30s
  setInterval(loadStatus, 30000);
})();
