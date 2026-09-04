var APP_NAME = "item-gate-pass-management-system";

/**
 * Every report the app exposes. `requests` is the spine — All_Gate_Pass_Requests
 * is unfiltered, so it holds every request at every status. The rest drive their
 * own cards and are optional: a report that errors or comes back empty degrades
 * to a "no data" panel rather than breaking the dashboard.
 */
var SOURCES = [
    { key: "requests", report: "All_Gate_Pass_Requests", label: "Requests" },
    { key: "l1", report: "L1_End_Report", label: "L1 queue" },
    { key: "l2", report: "L2_End_Report", label: "L2 queue" },
    { key: "security", report: "Security_Verification", label: "Security" },
    { key: "returns", report: "Post_Exit_Return_Tracking_Report", label: "Returns" }
];

var MAX_RECORDS = 1000;

var FIELDS = {
    requestId: ["Request_ID", "Request_Id", "RequestID"],
    user: ["User", "Requested_By", "Requester", "Added_User"],
    date: ["Requested_Date", "Request_Date", "Added_Time"],
    type: ["Request_Type", "Type"],
    status: ["Request__Status", "Request_Status"],
    gatePass: ["Gate_Pass_Number", "Gate_Pass_Number1"],
    category: ["Item_Category", "Item_category", "ItemCategory"],
    rejectReason: ["L2_Reject_Remarks", "L1_Reject_Remarks", "Reject_Reason",
        "Rejection_Reason", "Reject_Remarks"]
};

var ITEM_FIELDS = {
    name: ["Item_Name", "Item_name", "ItemName", "Description"],
    qty: ["Quantity", "Qty"],
    uom: ["UoM", "UOM", "Uom", "Unit_of_Measure"],
    serial: ["Serial_No", "Serial_Number", "Serial_no", "SerialNo"],
    category: ["Item_Category", "Item_category", "ItemCategory", "Category"]
};

var AWAITING_L1 = ["Request Initiate", "L1 Review and Resubmit"];
var AWAITING_L2 = ["L1 Approve"];

/**
 * Presets resolve to concrete bounds the moment they are chosen, so filtering
 * only ever deals with a from/to pair — a preset and a hand-picked range are the
 * same thing downstream.
 */
var RANGES = [
    { label: "All time", resolve: function () { return [null, null]; } },
    { label: "Today", resolve: function () { return [startOfDay(0), endOfDay(0)]; } },
    { label: "Last 7 days", resolve: function () { return [startOfDay(6), endOfDay(0)]; } },
    { label: "Last 30 days", resolve: function () { return [startOfDay(29), endOfDay(0)]; } },
    { label: "Last 90 days", resolve: function () { return [startOfDay(89), endOfDay(0)]; } },
    { label: "This month", resolve: function () {
        var d = new Date();
        return [new Date(d.getFullYear(), d.getMonth(), 1), endOfDay(0)];
    } },
    { label: "Last month", resolve: function () {
        var d = new Date();
        return [new Date(d.getFullYear(), d.getMonth() - 1, 1),
            atEnd(new Date(d.getFullYear(), d.getMonth(), 0))];
    } },
    { label: "Last 12 months", resolve: function () {
        var d = startOfDay(0);
        d.setFullYear(d.getFullYear() - 1);
        return [d, endOfDay(0)];
    } }
];

var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* Validated categorical slots — see the note at the top of css/dashboard.css. */
/* The app's theme colour is orange, so the series palette deliberately avoids
   orange: #cc6e11 sits only ΔE 6.4 from the orange slot in normal vision, and a
   chart segment must never be mistakable for chrome. Blue → aqua → violet →
   magenta clears every gate (worst adjacent CVD ΔE 23.1, normal 24.0). */
var C = { s1: "#2a78d6", s2: "#1baf7a", wash: "rgba(42,120,214,.10)", surface: "#ffffff" };
var STACK_COLORS = [C.s1, C.s2, "#4a3aa7", "#e87ba4"];

var el = {};
var data = { requests: [], security: [], returns: [], l1: [], l2: [] };
var state = {
    range: "All time", from: null, to: null,
    status: "All", type: "All", category: "All", search: "", rows: 25
};
var views = {};

document.addEventListener("DOMContentLoaded", function () {
    ["subline", "banner", "kpis", "trend", "trendSub", "status", "type", "category",
        "items", "itemsSub", "users", "sources", "sourcesSub", "security", "securitySub", "returns", "returnsSub",
        "recent", "tableSub", "tableEmpty", "tip",
        "rangeBtn", "rangeText", "rangePop", "presets", "calPrev", "calNext",
        "calTitle", "calMonths", "rangeSum", "rangeCancel", "rangeApply",
        "fStatus", "fType", "fCategory", "fSearch", "fRows",
        "refreshBtn", "exportBtn", "clearBtn", "clearCount"].forEach(function (id) {
            el[id] = document.getElementById(id);
        });

    initPicker();

    [["fStatus", "status"], ["fType", "type"], ["fCategory", "category"]]
        .forEach(function (pair) {
            el[pair[0]].addEventListener("change", function () {
                state[pair[1]] = el[pair[0]].value;
                render();
            });
        });

    el.fSearch.addEventListener("input", function () {
        state.search = el.fSearch.value;
        render();
    });
    el.fRows.addEventListener("change", function () {
        state.rows = parseInt(el.fRows.value, 10);
        renderTable(visible());
    });

    el.clearBtn.addEventListener("click", clearFilters);
    el.refreshBtn.addEventListener("click", load);
    el.exportBtn.addEventListener("click", exportCsv);

    document.querySelectorAll(".toggle").forEach(function (btn) {
        btn.addEventListener("click", function () {
            var key = btn.dataset.view;
            views[key] = !views[key];
            btn.setAttribute("aria-pressed", views[key] ? "true" : "false");
            render();
        });
    });

    var timer = null;
    window.addEventListener("resize", function () {
        clearTimeout(timer);
        timer = setTimeout(render, 160);
    });

    load();
});

/* ---------------- loading ---------------- */

function load() {
    el.subline.textContent = "Loading…";
    el.banner.hidden = true;

    if (typeof ZOHO === "undefined" || !ZOHO.CREATOR) {
        useDemo("The Creator SDK is not available here, so the dashboard is showing sample data.");
        return;
    }

    Promise.all(SOURCES.map(fetchSource)).then(function (results) {
        var byKey = {};
        var counts = [];
        var failed = [];

        results.forEach(function (result, index) {
            var source = SOURCES[index];
            byKey[source.key] = result.rows;
            counts.push(source.label + " " + result.rows.length);
            if (result.error) {
                failed.push(source.report);
            }
        });

        data.requests = (byKey.requests || []).map(normalize);
        data.security = byKey.security || [];
        data.returns = byKey.returns || [];
        data.l1 = byKey.l1 || [];
        data.l2 = byKey.l2 || [];
        applyDecisions();

        if (!data.requests.length) {
            useDemo("No records came back from " + SOURCES[0].report +
                (failed.length ? " (failed: " + failed.join(", ") + ")" : "") +
                " — showing sample data so the layout is reviewable.");
            return;
        }

        el.subline.textContent = counts.join("  ·  ") + "  ·  loaded " + clockNow();
        if (failed.length) {
            banner("Could not read: " + failed.join(", ") + ". Those cards stay empty.");
        }
        buildFilters();
        render();
    });
}

function fetchSource(source) {
    return ZOHO.CREATOR.DATA.getRecords({
        app_name: APP_NAME,
        report_name: source.report,
        max_records: MAX_RECORDS,
        field_config: "all"
    }).then(function (response) {
        return { rows: (response && response.data) || [], error: null };
    }).catch(function (err) {
        // An empty report answers with an error rather than an empty list.
        if (isNoRecords(err)) {
            return { rows: [], error: null };
        }
        console.warn("could not read " + source.report + ":", err);
        return { rows: [], error: err };
    });
}

function isNoRecords(err) {
    if (!err) {
        return false;
    }
    var code = err.code != null ? err.code : (err.responseJSON && err.responseJSON.code);
    if (code === 3100 || code === 9280) {
        return true;
    }
    var text = typeof err === "string" ? err : (err.message || err.responseText || "");
    return /"?code"?\s*:?\s*(9280|3100)|no\s*records?\s*found/i.test(String(text));
}

function useDemo(message) {
    data.requests = demoRequests();
    data.security = demoSimple(["Verified", "Pending", "Held"], [46, 12, 5], "Verification_Status");
    data.returns = demoSimple(["Returned", "Pending", "Overdue"], [31, 14, 6], "Return_Status");
    data.l1 = demoSimple(["Pending"], [9], "Process_Request");
    data.l2 = demoSimple(["Pending"], [6], "Process_Request");
    el.subline.textContent = "Sample data · " + data.requests.length + " requests";
    banner(message);
    buildFilters();
    render();
}

function banner(text) {
    el.banner.textContent = text;
    el.banner.hidden = !text;
}

/* ---------------- shaping ---------------- */

function normalize(row) {
    var items = subformRows(row).map(function (item) {
        return {
            name: loose(item, ITEM_FIELDS.name, /name|product|descrip|title/i) || "Unnamed item",
            qty: number(loose(item, ITEM_FIELDS.qty, /qty|quantity/i)),
            uom: loose(item, ITEM_FIELDS.uom, /uom|unit/i),
            serial: loose(item, ITEM_FIELDS.serial, /serial/i),
            category: text(item, ITEM_FIELDS.category) || text(row, FIELDS.category)
        };
    });

    return {
        id: row.ID || "",
        requestId: text(row, FIELDS.requestId) || row.ID || "",
        user: text(row, FIELDS.user) || "Unknown",
        date: parseDate(text(row, FIELDS.date)),
        type: text(row, FIELDS.type) || "Unspecified",
        status: text(row, FIELDS.status) || "Unknown",
        gatePass: text(row, FIELDS.gatePass),
        category: text(row, FIELDS.category),
        reason: text(row, FIELDS.rejectReason),
        items: items,
        qty: items.reduce(function (sum, item) { return sum + item.qty; }, 0)
    };
}

function subformRows(row) {
    var out = [];
    Object.keys(row).forEach(function (key) {
        var value = row[key];
        if (!Array.isArray(value) || !value.length) {
            return;
        }
        var first = value[0];
        var isSubform = first && typeof first === "object" && Object.keys(first).some(function (k) {
            return k !== "ID" && k !== "display_value" && k !== "zc_display_value";
        });
        if (isSubform) {
            out = out.concat(value);
        }
    });
    return out;
}

function parseDate(value) {
    if (!value) {
        return null;
    }
    var m = String(value).match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
    if (m) {
        return new Date(+m[3], MONTHS.indexOf(cap(m[2])), +m[1]);
    }
    m = String(value).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
        return new Date(+m[1], +m[2] - 1, +m[3]);
    }
    var d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
}

function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/* ---------------- filters ---------------- */

function buildFilters() {
    fill(el.fStatus, ["All"].concat(unique(data.requests.map(function (r) { return r.status; }))));
    fill(el.fType, ["All"].concat(unique(data.requests.map(function (r) { return r.type; }))));

    var cats = [];
    data.requests.forEach(function (r) {
        r.items.forEach(function (i) { if (i.category) { cats.push(i.category); } });
        if (r.category) { cats.push(r.category); }
    });
    fill(el.fCategory, ["All"].concat(unique(cats)));

    state.status = pickIf(state.status, el.fStatus);
    state.type = pickIf(state.type, el.fType);
    state.category = pickIf(state.category, el.fCategory);
    el.fStatus.value = state.status;
    el.fType.value = state.type;
    el.fCategory.value = state.category;
}

function pickIf(value, select) {
    return Array.prototype.some.call(select.options, function (o) { return o.value === value; })
        ? value : "All";
}

function clearFilters() {
    state.range = "All time";
    state.from = null;
    state.to = null;
    syncRangeButton();
    state.status = "All";
    state.type = "All";
    state.category = "All";
    state.search = "";
    el.fStatus.value = "All";
    el.fType.value = "All";
    el.fCategory.value = "All";
    el.fSearch.value = "";
    render();
}

function visible() {
    return data.requests.filter(function (r) { return passes(r, true); });
}

/**
 * Everything the other filters allow, whatever its date. The calendar paints
 * from this: filtering to Returnable Items should recolour the days, but the
 * chosen period must not blank out the calendar you are choosing it with.
 */
function visibleAnyDate() {
    return data.requests.filter(function (r) { return passes(r, false); });
}

function passes(r, useDate) {
    var term = state.search.trim().toLowerCase();

    if (useDate) {
        if (state.from && (!r.date || r.date < state.from)) {
            return false;
        }
        if (state.to && (!r.date || r.date > state.to)) {
            return false;
        }
    }

    return (function () {
        if (state.status !== "All" && r.status !== state.status) {
            return false;
        }
        if (state.type !== "All" && r.type !== state.type) {
            return false;
        }
        if (state.category !== "All") {
            var hit = r.category === state.category ||
                r.items.some(function (i) { return i.category === state.category; });
            if (!hit) {
                return false;
            }
        }
        if (term) {
            var hay = [r.requestId, r.user, r.status, r.type, r.gatePass]
                .concat(r.items.map(function (i) { return i.name + " " + i.serial; }))
                .join(" ").toLowerCase();
            if (hay.indexOf(term) === -1) {
                return false;
            }
        }
        return true;
    })();
}

/* ---------------- render ---------------- */

function render() {
    var rows = visible();

    renderKpis(rows);
    renderTrend(rows);
    renderStatus(rows);
    renderSplit("type", el.type, rows, function (r) { return r.type; });
    renderSplit("category", el.category, rows, null);
    renderItems(rows);
    renderUsers(rows);
    renderSecondary("security", el.security, el.securitySub, inPeriod(data.security), /status|result|verif/i);
    renderSecondary("returns", el.returns, el.returnsSub, inPeriod(data.returns), /status|return|result/i);
    renderSources(rows);
    renderClearState();
    renderTable(rows);
}

function renderKpis(rows) {
    var issued = rows.filter(function (r) { return r.gatePass || /generate/i.test(r.status); }).length;
    var rejected = rows.filter(function (r) { return /reject/i.test(r.status); }).length;
    var l1 = rows.filter(function (r) { return AWAITING_L1.indexOf(r.status) > -1; }).length;
    var l2 = rows.filter(function (r) { return AWAITING_L2.indexOf(r.status) > -1; }).length;
    var qty = rows.reduce(function (sum, r) { return sum + r.qty; }, 0);

    var tiles = [
        { art: "requests", label: "Requests", value: rows.length, note: rangeLabel(), tone: "" },
        { art: "l1", label: "Awaiting L1", value: l1, note: "Dept. head decision", tone: l1 ? "is-warning" : "is-good" },
        { art: "l2", label: "Awaiting L2", value: l2, note: "Admin head decision", tone: l2 ? "is-warning" : "is-good" },
        { art: "issued", label: "Gate passes issued", value: issued, note: pct(issued, rows.length) + " of requests", tone: "is-good" },
        { art: "rejected", label: "Rejected", value: rejected, note: pct(rejected, rows.length) + " of requests", tone: rejected ? "is-critical" : "" },
        { art: "items", label: "Items moved", value: qty, note: num(countItems(rows)) + " line items", tone: "" }
    ];

    el.kpis.textContent = "";
    tiles.forEach(function (tile) {
        el.kpis.appendChild(kpiTile(tile));
    });
}

function countItems(rows) {
    return rows.reduce(function (sum, r) { return sum + r.items.length; }, 0);
}

/* --- trend: one series, so no legend box; area wash + 2px line --- */

function renderTrend(rows) {
    var dated = rows.filter(function (r) { return r.date; });
    var buckets = bucketByTime(dated);
    var series = buckets.map(function (b) { return { label: b.label, value: b.value }; });

    el.trendSub.textContent = buckets.length
        ? buckets.length + " " + (buckets.unit === "day" ? "days" : "months") + " · peak " +
        num(Math.max.apply(null, series.map(function (b) { return b.value; })))
        : "No dated requests";

    if (views.trend) {
        return mini(el.trend, [buckets.unit === "day" ? "Date" : "Month", "Requests"], series);
    }
    if (!buckets.length) {
        return empty(el.trend, "No dated requests in this period.");
    }

    var w = width(el.trend);
    var h = 250;
    var pad = { t: 16, r: 20, b: 30, l: 46 };
    var iw = Math.max(60, w - pad.l - pad.r);
    var ih = h - pad.t - pad.b;
    var max = niceMax(Math.max.apply(null, series.map(function (b) { return b.value; })));
    var step = buckets.length > 1 ? iw / (buckets.length - 1) : 0;

    var svg = newSvg(w, h);

    // One hue, faded to nothing at the baseline — richer than a flat wash, still
    // a single series.
    var gradId = "trendFill";
    var defs = svgEl("defs", {});
    var grad = svgEl("linearGradient", { id: gradId, x1: "0", y1: "0", x2: "0", y2: "1" });
    grad.appendChild(svgEl("stop", { offset: "0%", "stop-color": C.s1, "stop-opacity": "0.28" }));
    grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": C.s1, "stop-opacity": "0.02" }));
    defs.appendChild(grad);
    svg.appendChild(defs);

    var x = function (i) { return pad.l + (buckets.length > 1 ? i * step : iw / 2); };
    var y = function (v) { return pad.t + ih - (v / max) * ih; };

    ticks(max, 4).forEach(function (t) {
        svg.appendChild(line(pad.l, y(t), pad.l + iw, y(t), "grid-line"));
        svg.appendChild(label(pad.l - 10, y(t) + 4, num(t), "tick tick-y"));
    });

    var d = buckets.map(function (b, i) { return (i ? "L" : "M") + x(i) + " " + y(b.value); }).join(" ");
    svg.appendChild(svgEl("path", {
        d: d + " L" + x(buckets.length - 1) + " " + (pad.t + ih) + " L" + x(0) + " " + (pad.t + ih) + " Z",
        fill: "url(#" + gradId + ")"
    }));
    svg.appendChild(svgEl("path", {
        d: d, fill: "none", stroke: C.s1, "stroke-width": 2,
        "stroke-linejoin": "round", "stroke-linecap": "round"
    }));

    // End marker carries a 2px surface ring; only the endpoint is directly labelled.
    var last = buckets.length - 1;
    svg.appendChild(svgEl("circle", {
        cx: x(last), cy: y(buckets[last].value), r: 4.5,
        fill: C.s1, stroke: C.surface, "stroke-width": 2
    }));
    svg.appendChild(label(x(last), y(buckets[last].value) - 12,
        num(buckets[last].value), "bar-label", "end"));

    svg.appendChild(line(pad.l, pad.t + ih, pad.l + iw, pad.t + ih, "axis-line"));
    everyNth(buckets, Math.ceil(buckets.length / 8)).forEach(function (i) {
        svg.appendChild(label(x(i), h - 8, buckets[i].label, "tick", "middle"));
    });

    var cross = svgEl("line", { class: "crosshair", y1: pad.t, y2: pad.t + ih, opacity: 0 });
    var dot = svgEl("circle", { r: 4.5, fill: C.s1, stroke: C.surface, "stroke-width": 2, opacity: 0 });
    svg.appendChild(cross);
    svg.appendChild(dot);

    var hit = svgEl("rect", { x: pad.l, y: pad.t, width: iw, height: ih, class: "hit" });
    svg.appendChild(hit);
    hit.addEventListener("mousemove", function (event) {
        var box = svg.getBoundingClientRect();
        var scale = box.width / w;
        var i = step ? Math.round(((event.clientX - box.left) / scale - pad.l) / step) : 0;
        i = Math.max(0, Math.min(buckets.length - 1, i));
        cross.setAttribute("x1", x(i));
        cross.setAttribute("x2", x(i));
        cross.setAttribute("opacity", 1);
        dot.setAttribute("cx", x(i));
        dot.setAttribute("cy", y(buckets[i].value));
        dot.setAttribute("opacity", 1);
        showTip(event, buckets[i].label, [{ color: C.s1, name: "Requests", value: num(buckets[i].value) }]);
    });
    hit.addEventListener("mouseleave", function () {
        cross.setAttribute("opacity", 0);
        dot.setAttribute("opacity", 0);
        hideTip();
    });

    el.trend.textContent = "";
    el.trend.appendChild(svg);
}

function bucketByTime(rows) {
    var out = [];
    if (!rows.length) {
        out.unit = "day";
        return out;
    }
    var times = rows.map(function (r) { return r.date.getTime(); });
    var span = (Math.max.apply(null, times) - Math.min.apply(null, times)) / 86400000;
    var byDay = span <= 45;
    var map = {};

    rows.forEach(function (r) {
        var key = byDay
            ? r.date.getFullYear() + "-" + pad2(r.date.getMonth() + 1) + "-" + pad2(r.date.getDate())
            : r.date.getFullYear() + "-" + pad2(r.date.getMonth() + 1);
        map[key] = (map[key] || 0) + 1;
    });

    out = Object.keys(map).sort().map(function (key) {
        var parts = key.split("-");
        return {
            label: byDay ? (+parts[2]) + " " + MONTHS[+parts[1] - 1] : MONTHS[+parts[1] - 1] + " " + parts[0].slice(2),
            value: map[key]
        };
    });
    out.unit = byDay ? "day" : "month";
    return out;
}

/* --- horizontal bars: one series, one colour --- */

function renderStatus(rows) {
    var series = tally(rows, function (r) { return r.status; });
    if (views.status) {
        return mini(el.status, ["Status", "Requests"], series);
    }
    bars(el.status, series, "requests");
}

function renderItems(rows) {
    var byQty = {};
    var byCount = {};
    rows.forEach(function (r) {
        r.items.forEach(function (i) {
            byQty[i.name] = (byQty[i.name] || 0) + (i.qty || 0);
            byCount[i.name] = (byCount[i.name] || 0) + 1;
        });
    });

    // Serialised items often carry no quantity at all. Ranking them by a column
    // of zeroes says nothing, so count appearances instead and label it plainly.
    var quantities = toSeries(byQty);
    var total = quantities.reduce(function (sum, s) { return sum + s.value; }, 0);
    var useQty = total > 0;
    var series = (useQty ? quantities : toSeries(byCount)).slice(0, 8);
    var unit = useQty ? "units" : "times requested";

    el.itemsSub.textContent = useQty ? "By total quantity" : "By times requested — no quantities recorded";

    if (views.items) {
        return mini(el.items, ["Item", useQty ? "Quantity" : "Requests"], series);
    }
    bars(el.items, series, unit);
}

function renderUsers(rows) {
    var series = tally(rows, function (r) { return r.user; }).slice(0, 8);
    if (views.users) {
        return mini(el.users, ["Requester", "Requests"], series);
    }
    bars(el.users, series, "requests");
}

function renderSecondary(key, host, subEl, rows, prefer) {
    if (!rows.length) {
        subEl.textContent = "No records";
        return empty(host, "No records in this report.");
    }
    var field = categoricalField(rows, prefer);
    var series = field ? toSeries(rows.reduce(function (acc, row) {
        var value = display(row[field]) || "Not set";
        acc[value] = (acc[value] || 0) + 1;
        return acc;
    }, {})) : [];

    subEl.textContent = num(rows.length) + " records" +
        (field ? " · by " + field.replace(/_/g, " ") : "");

    if (!series.length) {
        return empty(host, num(rows.length) + " records, but no field with a small set of\n" +
            "labels to group by — dates and numbers are skipped on purpose.");
    }
    if (views[key]) {
        return mini(host, [field.replace(/_/g, " "), "Records"], series);
    }
    bars(host, series, "records");
}

/**
 * The most chart-worthy field: a small set of distinct *labels*. Dates and
 * numbers are measures, not categories — grouping by them produces a chart with
 * one bar per value, which says nothing. Rejecting them is what keeps this card
 * honest when it meets a report whose schema we do not know.
 */
function categoricalField(rows, prefer) {
    var best = null;

    Object.keys(rows[0]).forEach(function (key) {
        if (Array.isArray(rows[0][key]) || key === "ID") {
            return;
        }
        if (/date|time|_id0number|qty|quantity|amount|remark|serial/i.test(key)) {
            return;
        }

        var values = unique(rows.map(function (row) { return display(row[key]); }));
        if (values.length < 2 || values.length > 8) {
            return;
        }

        var dateish = values.filter(function (v) { return parseDate(v); }).length;
        var numeric = values.filter(function (v) { return /^-?[\d.,]+$/.test(v.trim()); }).length;
        if (dateish * 2 >= values.length || numeric * 2 >= values.length) {
            return;
        }

        var score = (prefer.test(key) ? 100 : 0) + (8 - values.length);
        if (!best || score > best.score) {
            best = { key: key, score: score };
        }
    });

    return best && best.key;
}

function bars(host, series, unit) {
    if (!series.length) {
        return empty(host, "Nothing to show for these filters.");
    }
    var w = width(host);
    // A generous gutter: category names are the point of these charts, so give
    // them room rather than truncating to an ellipsis.
    var gutter = Math.min(210, Math.max(120, Math.round(w * 0.40)));
    // Few bars grow to fill the card instead of leaving it half empty.
    var rowH = Math.max(30, Math.min(46, Math.round(230 / series.length)));
    var barH = Math.min(20, rowH - 12);   // thin mark, inside the 24px cap
    var h = series.length * rowH + 6;
    var max = Math.max.apply(null, series.map(function (s) { return s.value; })) || 1;
    var iw = Math.max(40, w - gutter - 58);

    var svg = newSvg(w, h);
    series.forEach(function (item, index) {
        var y = index * rowH + (rowH - barH) / 2;
        var bw = Math.max(3, (item.value / max) * iw);
        var mid = y + barH / 2 + 4;

        svg.appendChild(label(gutter - 14, mid, clip(item.label, gutter - 22), "cat-label", "end"));
        svg.appendChild(svgEl("path", { d: barPath(gutter, y, bw, barH, 4), fill: C.s1 }));
        svg.appendChild(label(gutter + bw + 10, mid, num(item.value), "bar-label"));

        var hit = svgEl("rect", { x: 0, y: index * rowH, width: w, height: rowH, class: "hit" });
        hit.appendChild(svgEl("title", {}, item.label + " — " + num(item.value) + " " + unit));
        hit.addEventListener("mousemove", function (event) {
            showTip(event, item.label, [{ color: C.s1, name: unit, value: num(item.value) }]);
        });
        hit.addEventListener("mouseleave", hideTip);
        svg.appendChild(hit);
    });

    host.textContent = "";
    host.appendChild(svg);
}

/** Rounded data-end, square at the baseline. */
function barPath(x, y, w, h, r) {
    var rr = Math.min(r, w);
    return "M" + x + " " + y +
        "H" + (x + w - rr) + "a" + rr + " " + rr + " 0 0 1 " + rr + " " + rr +
        "V" + (y + h - rr) + "a" + rr + " " + rr + " 0 0 1 " + (-rr) + " " + rr +
        "H" + x + "Z";
}

/* --- part-to-whole: 100% stacked bar, legend + labels that fit --- */

function renderSplit(key, host, rows, pick) {
    var map = {};
    if (pick) {
        rows.forEach(function (r) {
            var value = pick(r) || "Unspecified";
            map[value] = (map[value] || 0) + 1;
        });
    } else {
        rows.forEach(function (r) {
            r.items.forEach(function (i) {
                var value = i.category || "Unspecified";
                map[value] = (map[value] || 0) + 1;
            });
        });
    }

    var series = toSeries(map);
    var unit = pick ? "requests" : "items";
    if (views[key]) {
        return mini(host, [pick ? "Request type" : "Item category", cap(unit)], series);
    }
    if (!series.length) {
        return empty(host, "Nothing to show for these filters.");
    }
    stack(host, series, unit);
}

function stack(host, series, unit) {
    var w = width(host);
    var barH = 34;
    var gap = 2;                          // surface gap, never a stroke
    var total = series.reduce(function (sum, s) { return sum + s.value; }, 0) || 1;
    var usable = w - gap * (series.length - 1);

    // Clamping tiny slivers to 3px can push the stack past the card; rescale so
    // the segments always sum to exactly the usable width.
    var widths = series.map(function (s) { return Math.max(3, (s.value / total) * usable); });
    var sum = widths.reduce(function (a, b) { return a + b; }, 0);
    if (sum > usable) {
        widths = widths.map(function (v) { return v * (usable / sum); });
    }

    var svg = newSvg(w, barH + 12);
    var x = 0;

    series.forEach(function (item, index) {
        var bw = widths[index];
        var color = STACK_COLORS[index % STACK_COLORS.length];
        var share = Math.round((item.value / total) * 100) + "%";

        svg.appendChild(svgEl("path", {
            d: segPath(x, 6, bw, barH, 5, index === 0, index === series.length - 1),
            fill: color
        }));

        // Label inside only when the text clears comfortable padding either side.
        if (bw > 54) {
            svg.appendChild(svgEl("text", {
                x: x + bw / 2, y: 6 + barH / 2 + 4, "text-anchor": "middle",
                fill: "#ffffff", "font-size": "12.5", "font-weight": "700"
            }, share));
        }

        var hit = svgEl("rect", { x: x, y: 6, width: bw, height: barH, class: "hit" });
        hit.addEventListener("mousemove", function (event) {
            showTip(event, item.label, [
                { color: color, name: unit, value: num(item.value) },
                { color: color, name: "share", value: share }
            ]);
        });
        hit.addEventListener("mouseleave", hideTip);
        svg.appendChild(hit);

        x += bw + gap;
    });

    host.textContent = "";
    host.appendChild(svg);

    var legend = node("div", "legend", "");
    series.forEach(function (item, index) {
        var wrap = node("span", "legend-item", "");
        var swatch = node("span", "legend-swatch", "");
        swatch.style.background = STACK_COLORS[index % STACK_COLORS.length];
        wrap.appendChild(swatch);
        wrap.appendChild(document.createTextNode(item.label + " · " + num(item.value)));
        legend.appendChild(wrap);
    });
    host.appendChild(legend);
}

function segPath(x, y, w, h, r, roundLeft, roundRight) {
    var rl = roundLeft ? Math.min(r, w / 2) : 0;
    var rr = roundRight ? Math.min(r, w / 2) : 0;
    return "M" + (x + rl) + " " + y +
        "H" + (x + w - rr) + (rr ? "a" + rr + " " + rr + " 0 0 1 " + rr + " " + rr : "") +
        "V" + (y + h - rr) + (rr ? "a" + rr + " " + rr + " 0 0 1 " + (-rr) + " " + rr : "") +
        "H" + (x + rl) + (rl ? "a" + rl + " " + rl + " 0 0 1 " + (-rl) + " " + (-rl) : "") +
        "V" + (y + rl) + (rl ? "a" + rl + " " + rl + " 0 0 1 " + rl + " " + (-rl) : "") + "Z";
}

/* ---------------- requests table ---------------- */

function renderTable(rows) {
    var head = ["Request ID", "User", "Date", "Type", "Items", "Qty", "Gate pass", "Status", "Reason"];
    var thead = el.recent.tHead;
    var tbody = el.recent.tBodies[0];
    thead.textContent = "";
    tbody.textContent = "";

    var headRow = thead.insertRow();
    head.forEach(function (name) {
        var th = document.createElement("th");
        th.textContent = name;
        headRow.appendChild(th);
    });

    var sorted = rows.slice().sort(function (a, b) {
        return (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0);
    });
    var shown = sorted.slice(0, state.rows);

    shown.forEach(function (r) {
        var row = tbody.insertRow();
        cell(row, r.requestId, "mono");
        cell(row, r.user, "");
        cell(row, fmtDate(r.date), "");
        cell(row, r.type, "");
        cell(row, num(r.items.length), "num");
        cell(row, num(r.qty), "num");
        cell(row, r.gatePass || "—", "mono");
        row.insertCell().appendChild(node("span", "state " + tone(r.status), r.status));

        // Only a turned-down request owes an explanation.
        var reasonCell = row.insertCell();
        reasonCell.className = "reason";
        if (/reject/i.test(r.status)) {
            reasonCell.textContent = r.reason || "No reason recorded";
            reasonCell.title = r.reason || "No reason recorded";
            if (!r.reason) {
                reasonCell.classList.add("is-missing");
            }
        } else {
            reasonCell.textContent = "—";
            reasonCell.classList.add("is-na");
        }
    });

    el.tableSub.textContent = "Showing " + num(shown.length) + " of " + num(rows.length) + " · newest first";
    el.tableEmpty.hidden = rows.length > 0;
}

/** Status is state, not a series — fixed status palette, always dot + label. */
function tone(status) {
    var key = String(status).toLowerCase();
    if (key.indexOf("reject") > -1) {
        return "is-critical";
    }
    if (key.indexOf("generate") > -1 || key.indexOf("approve") > -1) {
        return "is-good";
    }
    if (key.indexOf("resubmit") > -1) {
        return "is-serious";
    }
    return "is-warning";
}

function cell(row, value, cls) {
    var td = row.insertCell();
    td.className = cls;
    td.textContent = value;
}

/* ---------------- export ---------------- */

function exportCsv() {
    var rows = visible();
    if (!rows.length) {
        return banner("Nothing to export for these filters.");
    }
    var lines = [["Request ID", "User", "Date", "Request Type", "Status", "Reject Reason",
        "Gate Pass", "Item", "Item Category", "Serial", "UoM", "Quantity"].join(",")];

    rows.forEach(function (r) {
        if (!r.items.length) {
            lines.push(csv([r.requestId, r.user, fmtDate(r.date), r.type, r.status, r.reason,
                r.gatePass, "", "", "", "", ""]));
            return;
        }
        r.items.forEach(function (i) {
            lines.push(csv([r.requestId, r.user, fmtDate(r.date), r.type, r.status, r.reason,
                r.gatePass, i.name, i.category, i.serial, i.uom, i.qty]));
        });
    });

    var blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "gate-pass-requests.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

function csv(values) {
    return values.map(function (value) {
        var s = value == null ? "" : String(value);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(",");
}

/* ---------------- svg + dom helpers ---------------- */

function newSvg(w, h) {
    var svg = svgEl("svg", { viewBox: "0 0 " + w + " " + h, width: "100%", height: h });
    svg.setAttribute("role", "img");
    return svg;
}

function svgEl(tag, attrs, textContent) {
    var element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(attrs || {}).forEach(function (key) {
        element.setAttribute(key, attrs[key]);
    });
    if (textContent != null) {
        element.textContent = textContent;
    }
    return element;
}

function line(x1, y1, x2, y2, cls) {
    return svgEl("line", { x1: x1, y1: y1, x2: x2, y2: y2, class: cls });
}

function label(x, y, value, cls, anchor) {
    var attrs = { x: x, y: y, class: cls };
    if (anchor) {
        attrs["text-anchor"] = anchor;
    }
    return svgEl("text", attrs, value);
}

function node(tag, cls, value) {
    var element = document.createElement(tag);
    element.className = cls;
    if (value) {
        element.textContent = value;
    }
    return element;
}

function width(host) {
    return Math.max(280, host.clientWidth || 420);
}

function empty(host, message) {
    host.textContent = "";
    host.appendChild(node("div", "no-data", message));
}

/** Every chart can be read as a table — the accessibility fallback. */
function mini(host, headers, series) {
    host.textContent = "";
    var table = node("table", "mini", "");

    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    headers.forEach(function (name, index) {
        var th = document.createElement("th");
        th.textContent = name;
        if (index) {
            th.style.textAlign = "right";
        }
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    series.forEach(function (item) {
        var row = document.createElement("tr");
        var name = document.createElement("td");
        name.textContent = item.label;
        var value = document.createElement("td");
        value.className = "num";
        value.textContent = num(item.value);
        row.appendChild(name);
        row.appendChild(value);
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    host.appendChild(table);
}

function showTip(event, title, rows) {
    el.tip.textContent = "";
    el.tip.appendChild(node("div", "tip-title", title));

    rows.forEach(function (r) {
        var row = node("div", "tip-row", "");
        var swatch = node("span", "legend-swatch", "");
        swatch.style.background = r.color;
        row.appendChild(swatch);
        row.appendChild(document.createTextNode(r.name));
        row.appendChild(node("span", "tip-val", r.value));
        el.tip.appendChild(row);
    });

    el.tip.hidden = false;
    var x = Math.min(event.clientX + 14, window.innerWidth - el.tip.offsetWidth - 8);
    var y = Math.min(event.clientY + 14, window.innerHeight - el.tip.offsetHeight - 8);
    el.tip.style.left = Math.max(8, x) + "px";
    el.tip.style.top = Math.max(8, y) + "px";
}

function hideTip() {
    el.tip.hidden = true;
}

/* ---------------- small utilities ---------------- */

function fill(select, values) {
    var current = select.value;
    select.textContent = "";
    values.forEach(function (value) {
        var option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    });
    if (values.indexOf(current) > -1) {
        select.value = current;
    }
}

function tally(rows, pick) {
    return toSeries(rows.reduce(function (acc, row) {
        var key = pick(row) || "Unknown";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {}));
}

function toSeries(map) {
    return Object.keys(map).map(function (key) {
        return { label: key, value: map[key] };
    }).sort(function (a, b) { return b.value - a.value; });
}

function unique(values) {
    var seen = {};
    return values.filter(function (value) {
        if (!value || seen[value]) {
            return false;
        }
        seen[value] = true;
        return true;
    }).sort();
}

function niceMax(value) {
    if (value <= 5) {
        return 5;
    }
    var mag = Math.pow(10, Math.floor(Math.log(value) / Math.LN10));
    return Math.ceil(value / (mag / 2)) * (mag / 2);
}

function ticks(max, count) {
    var out = [];
    for (var i = 0; i <= count; i++) {
        out.push(Math.round((max / count) * i));
    }
    return out.filter(function (value, index, all) { return all.indexOf(value) === index; });
}

function everyNth(list, n) {
    var out = [];
    for (var i = 0; i < list.length; i += Math.max(1, n)) {
        out.push(i);
    }
    if (out[out.length - 1] !== list.length - 1) {
        out.push(list.length - 1);
    }
    return out;
}

function clip(value, px) {
    var max = Math.floor(px / 6.6);
    return value.length > max ? value.slice(0, max - 1) + "…" : value;
}

function num(value) {
    return Number(value || 0).toLocaleString("en-IN");
}

function pct(part, whole) {
    return whole ? Math.round((part / whole) * 100) + "%" : "0%";
}

function pad2(n) {
    return n < 10 ? "0" + n : String(n);
}

function fmtDate(d) {
    return d ? pad2(d.getDate()) + "-" + MONTHS[d.getMonth()] + "-" + d.getFullYear() : "—";
}

function clockNow() {
    var d = new Date();
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}

function text(row, candidates) {
    for (var i = 0; i < candidates.length; i++) {
        var value = display(row[candidates[i]]);
        if (value) {
            return value;
        }
    }
    return "";
}

function number(value) {
    var n = parseFloat(String(value).replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? 0 : n;
}

function display(value) {
    if (value == null) {
        return "";
    }
    if (Array.isArray(value)) {
        return value.map(display).filter(Boolean).join(", ");
    }
    if (typeof value === "object") {
        if (value.display_value != null) return display(value.display_value);
        if (value.zc_display_value != null) return display(value.zc_display_value);
        var parts = [value.prefix, value.first_name, value.last_name, value.suffix]
            .filter(function (part) { return part; });
        if (parts.length) {
            return parts.join(" ");
        }
        if (value.Name != null) return display(value.Name);
        return "";
    }
    return String(value);
}

/* ---------------- sample data (layout fallback only) ---------------- */

function demoRequests() {
    var seed = 20260901;
    function rnd() {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
    }

    var users = ["itzohosupport_nsdcindia", "r.sharma", "p.verma", "a.khan", "s.nair", "m.gupta"];
    var statuses = ["Request Initiate", "L1 Review and Resubmit", "L1 Approve", "L1 Reject",
        "L2 Approve", "L2 Reject", "Gate Pass Generate"];
    var weights = [14, 5, 12, 4, 8, 3, 34];
    var types = ["Returnable Items", "Non-Returnable Items"];
    var cats = ["Unique Item with S.No", "Batch of Items"];
    var names = ["Laptop Dell 5420", "HDMI Cable", "Projector", "Router", "Monitor 24 inch",
        "Tool Kit", "Printer Cartridge", "Server Rack Rail", "Network Switch", "UPS Battery"];
    var total = weights.reduce(function (a, b) { return a + b; }, 0);

    var out = [];
    for (var i = 0; i < 80; i++) {
        var roll = rnd() * total;
        var running = 0;
        var status = statuses[statuses.length - 1];
        for (var k = 0; k < statuses.length; k++) {
            running += weights[k];
            if (roll <= running) {
                status = statuses[k];
                break;
            }
        }

        var when = new Date();
        when.setDate(when.getDate() - Math.floor(rnd() * 150));

        var category = cats[rnd() > 0.45 ? 1 : 0];
        var unique = category === cats[0];
        var items = [];
        var lines = 1 + Math.floor(rnd() * 3);
        for (var j = 0; j < lines; j++) {
            items.push({
                name: names[Math.floor(rnd() * names.length)],
                qty: unique ? 1 : 2 + Math.floor(rnd() * 40),
                uom: unique ? "NOS" : ["PKT", "CTN", "ROL"][Math.floor(rnd() * 3)],
                serial: unique ? "SN-" + (1000 + Math.floor(rnd() * 9000)) : "",
                category: category
            });
        }

        out.push({
            id: String(i),
            requestId: "PASS/REQ-" + ("000" + (i + 1)).slice(-4),
            user: users[Math.floor(rnd() * users.length)],
            date: when,
            type: types[rnd() > 0.38 ? 0 : 1],
            status: status,
            gatePass: status === "Gate Pass Generate" ? "GP/OUT-" + ("000" + (i + 1)).slice(-4) : "",
            category: category,
            items: items,
            qty: items.reduce(function (sum, item) { return sum + item.qty; }, 0)
        });
    }
    return out;
}

function demoSimple(labels, counts, field) {
    var out = [];
    labels.forEach(function (label, index) {
        for (var i = 0; i < counts[index]; i++) {
            var row = { ID: label + i };
            row[field] = label;
            out.push(row);
        }
    });
    return out;
}

/* ---------------- date range picker ---------------- */

var DOW = ["M", "T", "W", "T", "F", "S", "S"];
var pick = { from: null, to: null, anchor: null, label: "All time", cursor: null, hover: null };

function initPicker() {
    pick.cursor = firstOfMonth(new Date());

    RANGES.forEach(function (range) {
        var li = document.createElement("li");
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "preset";
        btn.dataset.label = range.label;
        btn.appendChild(node("span", "check", "✓"));
        btn.appendChild(document.createTextNode(range.label));
        btn.addEventListener("click", function () {
            var bounds = range.resolve();
            pick.from = bounds[0];
            pick.to = bounds[1];
            pick.label = range.label;
            if (pick.from) {
                pick.cursor = firstOfMonth(pick.to || pick.from);
                pick.cursor.setMonth(pick.cursor.getMonth() - 1);
            }
            drawPicker();
        });
        li.appendChild(btn);
        el.presets.appendChild(li);
    });

    el.rangeBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        if (el.rangePop.hidden) {
            openPicker();
        } else {
            closePicker();
        }
    });
    el.rangePop.addEventListener("click", function (event) { event.stopPropagation(); });
    document.addEventListener("click", closePicker);
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            closePicker();
        }
    });

    el.calPrev.addEventListener("click", function () { shiftMonth(-1); });
    el.calNext.addEventListener("click", function () { shiftMonth(1); });
    el.rangeCancel.addEventListener("click", closePicker);
    el.rangeApply.addEventListener("click", function () {
        state.from = pick.from;
        state.to = pick.to;
        state.range = pick.label;
        syncRangeButton();
        closePicker();
        render();
    });

    syncRangeButton();
}

function openPicker() {
    pick.from = state.from;
    pick.to = state.to;
    pick.label = state.range;
    pick.hover = null;
    pick.anchor = null;
    pick.cursor = firstOfMonth(state.to || state.from || new Date());
    pick.cursor.setMonth(pick.cursor.getMonth() - 1);
    el.rangePop.hidden = false;
    el.rangeBtn.setAttribute("aria-expanded", "true");
    drawPicker();
}

function closePicker() {
    el.rangePop.hidden = true;
    el.rangeBtn.setAttribute("aria-expanded", "false");
}

function shiftMonth(by) {
    pick.cursor.setMonth(pick.cursor.getMonth() + by);
    drawPicker();
}

function syncRangeButton() {
    el.rangeText.textContent = state.range === "Custom"
        ? rangeText(state.from, state.to)
        : state.range;
}

function rangeText(from, to) {
    if (!from && !to) {
        return "All time";
    }
    if (from && !to) {
        return fmtDate(from) + " → …";
    }
    return fmtDate(from) + " → " + fmtDate(to);
}

function drawPicker() {
    Array.prototype.forEach.call(el.presets.querySelectorAll(".preset"), function (btn) {
        btn.classList.toggle("is-on", btn.dataset.label === pick.label);
    });

    var a = new Date(pick.cursor);
    var b = new Date(pick.cursor.getFullYear(), pick.cursor.getMonth() + 1, 1);
    el.calTitle.textContent = monthName(a) + " – " + monthName(b);

    el.calMonths.textContent = "";
    el.calMonths.appendChild(monthGrid(a));
    el.calMonths.appendChild(monthGrid(b));

    el.rangeSum.textContent = rangeText(pick.from, pick.to) +
        (pick.from && pick.to ? "  ·  " + spanDays(pick.from, pick.to) + " days" : "");
}

function monthGrid(month) {
    var wrap = node("div", "month", "");
    wrap.appendChild(node("p", "month-name", monthName(month)));

    var dow = node("div", "dow", "");
    DOW.forEach(function (d) { dow.appendChild(node("span", "", d)); });
    wrap.appendChild(dow);

    var days = node("div", "days", "");
    var first = new Date(month.getFullYear(), month.getMonth(), 1);
    var lead = (first.getDay() + 6) % 7;             // weeks start Monday
    var count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    var states = dayStates();
    var today = key(new Date());

    for (var i = 0; i < lead; i++) {
        days.appendChild(node("button", "day blank", ""));
    }

    for (var d = 1; d <= count; d++) {
        days.appendChild(dayCell(new Date(month.getFullYear(), month.getMonth(), d), states, today));
    }

    wrap.appendChild(days);
    return wrap;
}

function dayCell(date, states, today) {
    var cell = node("button", "day", String(date.getDate()));
    cell.type = "button";

    var day = states[key(date)];
    var selected = inRange(date) || isEdge(date);

    if (day && !selected) {
        cell.classList.add("is-" + day.state);
    }
    if (key(date) === today) {
        cell.classList.add("today");
    }
    if (inRange(date)) {
        cell.classList.add("in-range");
    }
    if (isEdge(date)) {
        cell.classList.add("edge");
        if (same(date, pick.from)) {
            cell.classList.add("start");
        }
        if (same(date, pick.to)) {
            cell.classList.add("end");
        }
    }
    cell.title = dayTitle(date, day);

    cell.addEventListener("click", function () { choose(date); });
    cell.addEventListener("mouseenter", function () {
        if (pick.from && !pick.to) {
            pick.hover = date;
            drawPicker();
        }
    });

    return cell;
}

/**
 * One click selects that single day — pick 1 August and you get 1 August, not
 * "1 August onwards". A second click extends the selection from the anchor.
 */
function choose(date) {
    if (!pick.anchor) {
        pick.anchor = atStart(date);
        pick.from = atStart(date);
        pick.to = atEnd(date);
    } else if (date < pick.anchor) {
        pick.from = atStart(date);
        pick.to = atEnd(pick.anchor);
        pick.anchor = null;
    } else {
        pick.from = atStart(pick.anchor);
        pick.to = atEnd(date);
        pick.anchor = null;
    }
    pick.hover = null;
    pick.label = "Custom";
    drawPicker();
}

/**
 * The state of each day's requests. A day is only "cleared" once nothing raised
 * on it is still waiting, so an unactioned request keeps its date red however
 * many of its neighbours are done — which is the point of the view.
 */
function dayStates() {
    var map = {};

    visibleAnyDate().forEach(function (r) {
        if (!r.date) {
            return;
        }
        var k = key(r.date);
        var day = map[k] || (map[k] = { total: 0, pending: 0, rejected: 0, done: 0 });
        day.total++;
        day[requestState(r)]++;
    });

    Object.keys(map).forEach(function (k) {
        var day = map[k];
        day.state = day.pending ? "pending" : (day.rejected ? "rejected" : "done");
    });
    return map;
}

/** Awaiting either approval, turned down, or finished with. */
function requestState(r) {
    if (AWAITING_L1.indexOf(r.status) > -1 || AWAITING_L2.indexOf(r.status) > -1) {
        return "pending";
    }
    if (/reject/i.test(r.status)) {
        return "rejected";
    }
    return "done";
}

function dayTitle(date, day) {
    if (!day) {
        return fmtDate(date) + " · no requests";
    }
    var parts = [];
    if (day.pending) {
        parts.push(day.pending + " awaiting a decision");
    }
    if (day.rejected) {
        parts.push(day.rejected + " rejected");
    }
    if (day.done) {
        parts.push(day.done + " cleared");
    }
    return fmtDate(date) + " · " + day.total +
        (day.total === 1 ? " request" : " requests") + " — " + parts.join(", ");
}

function inRange(date) {
    // While extending, preview against the anchor rather than the committed end.
    var start = pick.anchor || pick.from;
    var end = pick.anchor ? (pick.hover || pick.to) : pick.to;
    if (!start || !end) {
        return false;
    }
    var lo = start < end ? start : end;
    var hi = start < end ? end : start;
    return date >= atStart(lo) && date <= atEnd(hi) && !isEdge(date);
}

function isEdge(date) {
    return same(date, pick.from) || same(date, pick.to);
}

function same(a, b) {
    return !!a && !!b && key(a) === key(b);
}

function key(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function monthName(d) {
    return MONTHS[d.getMonth()] + " " + d.getFullYear();
}

function firstOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

function atStart(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function atEnd(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function startOfDay(daysAgo) {
    var d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return atStart(d);
}

function endOfDay(daysAgo) {
    var d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return atEnd(d);
}

function spanDays(from, to) {
    return Math.round((atEnd(to) - atStart(from)) / 86400000);
}

/** What the current period should be called in prose. */
function rangeLabel() {
    return state.range === "Custom" ? rangeText(state.from, state.to) : state.range;
}

/* ---------------- period filtering across every report ---------------- */

var dateFieldCache = new WeakMap();

/**
 * The chosen period scopes every report, not just the requests spine. Each
 * report names its date column differently, so find it once per dataset by
 * preferring date-ish names and confirming the values actually parse.
 */
function dateFieldOf(rows) {
    if (!rows.length) {
        return null;
    }
    if (dateFieldCache.has(rows)) {
        return dateFieldCache.get(rows);
    }

    var keys = Object.keys(rows[0]).filter(function (key) {
        return !Array.isArray(rows[0][key]) && key !== "ID";
    }).sort(function (a, b) {
        return nameScore(b) - nameScore(a);
    });

    var found = null;
    for (var i = 0; i < keys.length && !found; i++) {
        var parses = rows.some(function (row) {
            return parseDate(display(row[keys[i]]));
        });
        if (parses) {
            found = keys[i];
        }
    }

    dateFieldCache.set(rows, found);
    return found;
}

function nameScore(key) {
    if (/date/i.test(key)) {
        return 3;
    }
    if (/time/i.test(key)) {
        return 2;
    }
    return 0;
}

/** Rows of any report that fall inside the selected period. */
function inPeriod(rows) {
    if (!rows.length || (!state.from && !state.to)) {
        return rows;
    }
    var field = dateFieldOf(rows);
    if (!field) {
        return rows;                       // undateable report — never hide it
    }
    return rows.filter(function (row) {
        var when = parseDate(display(row[field]));
        if (!when) {
            return false;
        }
        return (!state.from || when >= state.from) && (!state.to || when <= state.to);
    });
}

/** Records inside the period, per report — the "all reports" view. */
function renderSources(requestRows) {
    var series = [
        { label: "Gate pass requests", value: requestRows.length },
        { label: "L1 queue", value: inPeriod(data.l1).length },
        { label: "L2 queue", value: inPeriod(data.l2).length },
        { label: "Security verification", value: inPeriod(data.security).length },
        { label: "Post-exit returns", value: inPeriod(data.returns).length }
    ];
    var total = series.reduce(function (sum, s) { return sum + s.value; }, 0);

    el.sourcesSub.textContent = num(total) + " records · " + rangeLabel();

    if (views.sources) {
        return mini(el.sources, ["Report", "Records"], series);
    }
    bars(el.sources, series, "records");
}

/* ---------------- KPI presentation ---------------- */

/* Each tile is a distinct entity, so it carries its own accent and glyph. This
   is chrome, not a data encoding — the charts below stay on the series palette. */
var KPI_ART = {
    requests: {
        accent: "#cc6e11", soft: "rgba(204,110,17,.13)",
        path: '<path d="M9 3h6l1 3h3a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3Z"/><path d="M9 13h6M9 17h4"/>'
    },
    l1: {
        accent: "#fab219", soft: "rgba(250,178,25,.16)",
        path: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'
    },
    l2: {
        accent: "#fab219", soft: "rgba(250,178,25,.16)",
        path: '<path d="M12 3.5 20 7v5c0 5-3.4 8-8 9.5C7.4 20 4 17 4 12V7Z"/><path d="m9 12 2 2 4-4"/>'
    },
    issued: {
        accent: "#0ca30c", soft: "rgba(12,163,12,.13)",
        path: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M8 15h4"/>'
    },
    rejected: {
        accent: "#d03b3b", soft: "rgba(208,59,59,.12)",
        path: '<circle cx="12" cy="12" r="8.5"/><path d="m15 9-6 6M9 9l6 6"/>'
    },
    items: {
        accent: "#cc6e11", soft: "rgba(204,110,17,.13)",
        path: '<path d="M12 3 3.5 7.5v9L12 21l8.5-4.5v-9Z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>'
    }
};

function kpiTile(tile) {
    var art = KPI_ART[tile.art] || KPI_ART.requests;
    var box = node("div", "kpi");
    box.style.setProperty("--accent", art.accent);
    box.style.setProperty("--accent-soft", art.soft);

    var top = node("div", "kpi-top", "");
    var chip = node("span", "kpi-icon", "");
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = art.path;
    chip.appendChild(svg);
    top.appendChild(chip);
    top.appendChild(node("p", "kpi-label", tile.label));
    box.appendChild(top);

    box.appendChild(node("p", "kpi-value", num(tile.value)));

    var note = node("p", "kpi-note", "");
    note.appendChild(node("span", "kpi-dot " + tile.tone, ""));
    note.appendChild(document.createTextNode(tile.note));
    box.appendChild(note);

    return box;
}


/**
 * Named fields first, then any field whose link name matches the pattern.
 * Subform columns get renamed between apps far more often than top-level ones,
 * which is what fills an items chart with "Unnamed item".
 */
function loose(row, candidates, pattern) {
    var found = text(row, candidates);
    if (found) {
        return found;
    }
    var keys = Object.keys(row).filter(function (key) {
        return pattern.test(key) && !Array.isArray(row[key]);
    });
    for (var i = 0; i < keys.length; i++) {
        var value = display(row[keys[i]]);
        if (value) {
            return value;
        }
    }
    return "";
}

/** How many filters are narrowing the view — shown on the Clear button. */
function activeFilterCount() {
    var count = 0;
    if (state.from || state.to) {
        count++;
    }
    if (state.status !== "All") {
        count++;
    }
    if (state.type !== "All") {
        count++;
    }
    if (state.category !== "All") {
        count++;
    }
    if (state.search.trim()) {
        count++;
    }
    return count;
}

function renderClearState() {
    var count = activeFilterCount();
    el.clearCount.textContent = String(count);
    el.clearCount.hidden = count === 0;
    el.clearBtn.classList.toggle("is-active", count > 0);
    el.clearBtn.title = count
        ? "Clear " + count + (count === 1 ? " active filter" : " active filters")
        : "No filters applied";
}

/* ---------------- decisions recorded on the L1/L2 records ---------------- */

/**
 * A rejection is recorded on the L1/L2 process record, and does not always make
 * it back onto the gate pass record — so a request turned down at L2 can still
 * read "L1 Approve" in All_Gate_Pass_Requests. Fold those decisions in, joining
 * on the Request ID the process record looks up.
 *
 * Only rejections override: they are terminal, and the spine's own status is
 * otherwise the more advanced of the two (it carries "Gate Pass Generate",
 * which no process record knows about).
 */
function applyDecisions() {
    var decided = {};
    collectDecisions(data.l1, "L1", decided);
    collectDecisions(data.l2, "L2", decided);          // L2 outranks L1

    var changed = 0;
    data.requests.forEach(function (r) {
        var decision = decided[r.requestId];
        if (!decision) {
            return;
        }
        if (/reject/i.test(decision.status) && !/reject/i.test(r.status)) {
            r.status = decision.status;
            changed++;
        }
        // The reason is written on the process record, so fill it in whenever
        // the request is rejected and the spine did not carry one.
        if (!r.reason && decision.reason && /reject/i.test(r.status)) {
            r.reason = decision.reason;
        }
    });

    if (changed) {
        console.log("applied " + changed + " rejection(s) recorded on the L1/L2 reports.");
    }
}

function collectDecisions(rows, level, into) {
    (rows || []).forEach(function (row) {
        var id = text(row, FIELDS.requestId);
        if (!id) {
            return;
        }
        // The decision itself is Process_Request; Request__Status on a process
        // record is the state it was *waiting* at, not the outcome.
        var decision = text(row, ["Process_Request"]);
        var status = "";
        if (/reject/i.test(decision)) {
            status = level + " Reject";
        } else if (/approve/i.test(decision)) {
            status = level + " Approve";
        } else {
            status = text(row, FIELDS.status);
        }
        if (status) {
            into[id] = {
                status: status,
                reason: loose(row, FIELDS.rejectReason, /reject.*(reason|remark)|reason/i)
            };
        }
    });
}
