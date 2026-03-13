(function () {
  var content = document.getElementById("content");
  var buttons = document.querySelectorAll(".segmented-control button");
  var currentDuration = 30;

  // --- Time formatting ---
  var timeFormat = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: undefined, // let locale decide
  });

  var dateFormat = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  function formatTimeRange(startISO, endISO) {
    var start = new Date(startISO);
    var end = new Date(endISO);
    return timeFormat.format(start) + " \u2013 " + timeFormat.format(end);
  }

  function formatDuration(mins) {
    if (mins < 60) return mins + " min";
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    if (m === 0) return h + " hr";
    return h + " hr " + m + " min";
  }

  function formatDate(dateStr) {
    // Parse YYYY-MM-DD as local date
    var parts = dateStr.split("-");
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    return dateFormat.format(d);
  }

  // --- Rendering ---
  function renderLoading() {
    var html = "";
    for (var g = 0; g < 3; g++) {
      html += '<div class="skeleton-group">';
      html += '<div class="skeleton-line"></div>';
      var count = 2 + g;
      for (var s = 0; s < count; s++) {
        html += '<div class="skeleton-slot"></div>';
      }
      html += "</div>";
    }
    content.innerHTML = html;
  }

  function renderError() {
    content.innerHTML =
      '<div class="state-message">' +
      '<span class="icon" aria-hidden="true">\uD83D\uDE15</span>' +
      "<h2>Something went wrong</h2>" +
      "<p>Couldn\u2019t load availability right now. Give it another try?</p>" +
      '<button type="button" onclick="window.__calmanRetry()">Try again</button>' +
      "</div>";
  }

  function renderEmpty() {
    content.innerHTML =
      '<div class="state-message">' +
      '<span class="icon" aria-hidden="true">\uD83D\uDCED</span>' +
      "<h2>No availability</h2>" +
      "<p>I don\u2019t have any free slots for " +
      formatDuration(currentDuration) +
      "+ meetings right now. Try a shorter duration or check back soon.</p>" +
      "</div>";
  }

  function renderSlots(days) {
    if (!days || days.length === 0) {
      renderEmpty();
      return;
    }

    // Filter out days with no slots
    var nonEmpty = days.filter(function (d) { return d.slots && d.slots.length > 0; });
    if (nonEmpty.length === 0) {
      renderEmpty();
      return;
    }

    var html = "";
    for (var i = 0; i < nonEmpty.length; i++) {
      var day = nonEmpty[i];
      html += '<section class="day-group">';
      html +=
        '<h2 class="day-header">' +
        escapeHtml(day.dayLabel) +
        "</h2>";
      html += '<div class="slots">';

      for (var j = 0; j < day.slots.length; j++) {
        var slot = day.slots[j];
        html +=
          '<div class="slot">' +
          '<span class="slot-time">' +
          escapeHtml(formatTimeRange(slot.start, slot.end)) +
          "</span>" +
          '<span class="slot-duration">' +
          escapeHtml(formatDuration(slot.duration)) +
          "</span></div>";
      }

      html += "</div></section>";
    }

    content.innerHTML = html;
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // --- API ---
  function fetchAvailability(duration) {
    renderLoading();

    fetch("/api/availability?duration=" + encodeURIComponent(duration))
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        renderSlots(data.availability);
      })
      .catch(function () {
        renderError();
      });
  }

  // Public retry hook
  window.__calmanRetry = function () {
    fetchAvailability(currentDuration);
  };

  // --- Toggle ---
  function setActiveDuration(duration) {
    currentDuration = duration;

    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var isActive = parseInt(btn.getAttribute("data-duration"), 10) === duration;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-checked", isActive ? "true" : "false");
    }

    fetchAvailability(duration);
  }

  for (var i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener("click", function () {
      var dur = parseInt(this.getAttribute("data-duration"), 10);
      if (dur !== currentDuration) {
        setActiveDuration(dur);
      }
    });
  }

  // Keyboard navigation for radiogroup
  var controlGroup = document.querySelector(".segmented-control");
  controlGroup.addEventListener("keydown", function (e) {
    var durations = [30, 60, 90];
    var idx = durations.indexOf(currentDuration);

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      var next = durations[(idx + 1) % durations.length];
      setActiveDuration(next);
      document.querySelector('[data-duration="' + next + '"]').focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      var prev = durations[(idx - 1 + durations.length) % durations.length];
      setActiveDuration(prev);
      document.querySelector('[data-duration="' + prev + '"]').focus();
    }
  });

  // --- Personalisation ---
  fetch("/api/config")
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.displayName) {
        var name = data.displayName;
        var possessive = name.endsWith("s") ? name + "'" : name + "'s";
        document.title = "Look up " + possessive + " availability";
        document.querySelector("header h1").textContent = "Look up " + possessive + " availability";
      }
    })
    .catch(function () {}); // non-critical, keep defaults

  // --- Theme toggle ---
  var toggle = document.getElementById("theme-toggle");
  function getPreferredTheme() {
    var stored = localStorage.getItem("calman-theme");
    if (stored) return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("calman-theme", theme);
  }
  applyTheme(getPreferredTheme());
  toggle.addEventListener("click", function () {
    var current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  });

  // --- Init ---
  fetchAvailability(currentDuration);
})();
