var APP_NAME = "item-gate-pass-management-system";

/**
 * The widget reads and writes one record, through the level's own report:
 * L1_End_Report for L1, L2_End_Report for L2. A decision is a single update
 * carrying the approval fields, the status, the process fields, and — on L2
 * approve — the newly issued gate pass number.
 *
 * Because the widget does this work itself, the approval Deluge on the form
 * should be disabled, or it will run again on the API update and issue a second
 * gate pass number.
 *
 * The level can be passed explicitly and is otherwise inferred from the status:
 *   openUrl("/#Page:TestWidget?Request_ID=" + input.ID + "&Level=L2", "popup window", ...)
 */
var LEVELS = {
    L1: {
        report: "L1_End_Report",
        // Criteria from the L1 form.
        actionable: ["Request Initiate", "L1 Review and Resubmit"],
        approvedStatus: "L1 Approve",
        rejectedStatus: "L1 Reject",
        fields: {
            approveRemarks: "L1_Approve_Remarks",
            approveDate: "L1_Approved_Date",
            rejectRemarks: "L1_Reject_Remarks",
            rejectDate: "L1_Reject_Date",
            user: "L1_User"
        },
        generatesGatePass: false
    },
    L2: {
        report: "L2_End_Report",
        // Criteria from the L2 form: Request__Status == "L1 Approve".
        actionable: ["L1 Approve"],
        approvedStatus: "L2 Approve",
        rejectedStatus: "L2 Reject",
        fields: {
            approveRemarks: "L2_Approve_Remarks",
            approveDate: "L2_Approve_Date",
            rejectRemarks: "L2_Reject_Remarks",
            rejectDate: "L2_Reject_Date",
            user: "L2_User"
        },
        generatesGatePass: true
    }
};
var DEFAULT_LEVEL = "L1";

var STATUS_FIELD = "Request__Status";

/* ---- gate pass numbering (L2 approve only) ---- */

var GATE_PASS_PREFIX = "NSDC-KB-GP";
var GATE_PASS_STATUS = "Gate Pass Generate";
var GATE_PASS_PAD = 4;

// Report scanned for existing gate pass numbers, so the next one continues the run.
// null means "the level's own report". If that report is filtered such that
// already-generated requests drop out of it, the scan will not see their numbers
// and numbering restarts at 0001 — point this at an unfiltered report instead.
var NUMBER_SCAN_REPORT = "All_Gate_Pass_Requests";

// Fields on the L1/L2 process record.
var PROCESS_FIELDS = {
    decision: "Process_Request",
    approveRemarks: "Approved_Remarks",
    rejectRemarks: "Reject_Reason"
};
var PROCESS_APPROVE = "Approve";
var PROCESS_REJECT = "Reject";

// Field link names. Each entry lists the candidates we accept, first match wins.
var FIELDS = {
    requestId: ["Request_ID", "Request_Id", "RequestID"],
    user: ["User", "Requested_By", "Requester"],
    requestedDate: ["Requested_Date", "Request_Date", "Requested_On"],
    requestType: ["Request_Type", "Type"],
    requestStatus: ["Request__Status", "Request_Status"],
    processRequest: ["Process_Request"],
    itemCategory: ["Item_Category", "Item_category", "ItemCategory"]
};

var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// How long the parent gets to act on #Script:page.refresh before the dialog is
// closed. Raise it if the underlying list still shows stale data after a save.
var CLOSE_DELAY = 600;

/**
 * Item_Category decides whether an item row carries a serial number:
 *   "Unique Item with S.No" → serial number and quantity
 *   "Batch of Items"        → quantity only
 * Read per row first, falling back to the record when it is set at that level.
 * The categories in play are shown once above the table, not on every row.
 */
var ITEM_CATEGORY_KEYS = ["Item_Category", "Item_category", "ItemCategory", "Category"];
var KIND_UNIQUE = "unique";
var KIND_BATCH = "batch";

// The only subform columns we render, in this order. A column is skipped when
// none of its candidate link names exist on the rows. `only` marks a column as
// belonging to one item category — it is dropped when no row is of that kind.
var COLUMNS = [
    {
        label: "Item Name", cls: "col-name",
        keys: ["Item_Name1", "Item_Name", "Item_name", "ItemName"],
        pattern: /name|product|descrip|title/i
    },
    {
        label: "UoM", cls: "col-uom",
        keys: ["UoM", "UOM", "Uom", "Unit_of_Measure"],
        pattern: /uom|unit/i
    },
    {
        label: "Serial No.", cls: "col-code",
        keys: ["Serial_No", "Serial_Number", "Serial_no", "SerialNo"],
        pattern: /serial/i, only: KIND_UNIQUE
    },
    {
        label: "Quantity", cls: "col-num",
        keys: ["Quantity", "Qty"],
        pattern: /qty|quantity/i
    }
];

// Never let a column latch onto one of these by pattern — "Item_Category"
// contains "item", and a serial column must not answer the name column.
var COLUMN_EXCLUDE = /category|serial|uom|unit|qty|quantity|^id$|_id$|remark/i;

var el = {};
var level = LEVELS[DEFAULT_LEVEL];
var levelKey = DEFAULT_LEVEL;
var recordId = null;
var explicitLevel = null;
var gatePassRequestNo = null;
var loginUser = null;
var pendingDecision = null;
var busy = false;

document.addEventListener("DOMContentLoaded", function () {
    [
        "state", "stateText", "card", "eyebrow", "requestId", "statusPill", "statusText", "statusDot",
        "meta", "itemsTitle", "itemsCount", "itemCats", "tableWrap", "itemsTable", "itemsEmpty",
        "note", "msg", "decision", "remarks", "remarksLabel", "remarksError",
        "cancelBtn", "confirmBtn", "actions", "approveBtn", "rejectBtn"
    ].forEach(function (id) {
        el[id] = document.getElementById(id);
    });

    el.approveBtn.addEventListener("click", function () { openDecision("approve"); });
    el.rejectBtn.addEventListener("click", function () { openDecision("reject"); });
    el.cancelBtn.addEventListener("click", closeDecision);
    el.confirmBtn.addEventListener("click", confirmDecision);
    el.remarks.addEventListener("input", function () { el.remarksError.hidden = true; });

    start();
});

function start() {
    ZOHO.CREATOR.UTIL.getQueryParams().then(function (params) {
        console.log("GPMS queryParams:", params);

        recordId = params && params.Request_ID;
        if (!recordId) {
            showState("No Request_ID was passed to this page.", true);
            return;
        }

        var requested = params && (params.Level || params.level);
        explicitLevel = normalizeLevel(requested);
        if (explicitLevel) {
            adoptLevel(explicitLevel);
        } else {
            console.warn("No usable Level param (got '" + requested + "') — the level will be " +
                "inferred from Request__Status. Pass &Level=L1 or &Level=L2 on the openUrl " +
                "to make it explicit.");
        }

        // L1_User / L2_User are stamped with the logged-in user, as zoho.loginuser does.
        return ZOHO.CREATOR.UTIL.getInitParams().then(function (init) {
            console.log("GPMS initParams:", init);
            loginUser = resolveLoginUser(init);
        }).catch(function (err) {
            console.warn("getInitParams failed, the user field will be skipped:", err);
        }).then(loadRecord);
    }).catch(function (err) {
        console.error("getQueryParams failed:", err);
        showState("Could not read the page parameters.", true);
    });
}

/**
 * The login name written to L1_User / L2_User, and printed on the gate pass as
 * Dept. Head / Admin Head. getInitParams names this differently across SDK
 * builds, so take the first key that holds a value and log which one it was.
 */
// Name-style keys first: getInitParams.loginUser is the email address, while the
// request's own User field shows the account's login name. Preferring the name
// keeps Dept. Head / Admin Head consistent with Submitted By on the gate pass.
function LOGIN_KEYS() {
    return ["loginUserName", "loginName", "userName", "user_name", "displayName",
        "loginUser", "login_user", "loginUserEmail", "userEmail", "email"];
}

function resolveLoginUser(init) {
    if (!init) {
        console.warn("no initParams; L1_User / L2_User will not be stamped.");
        return null;
    }
    var keys = LOGIN_KEYS();
    for (var i = 0; i < keys.length; i++) {
        var value = display(init[keys[i]]);
        if (value) {
            console.log('login user "' + value + '" read from initParams.' + keys[i]);
            return value;
        }
    }
    console.warn("could not find a login name in initParams; L1_User / L2_User " +
        "will be left unset. Keys present:", Object.keys(init));
    return null;
}

/** Accepts "L2", "l2", or plain "2". */
function normalizeLevel(raw) {
    var key = String(raw == null ? "" : raw).trim().toUpperCase();
    if (!key) {
        return null;
    }
    if (key.charAt(0) !== "L") {
        key = "L" + key;
    }
    return LEVELS[key] ? key : null;
}

function adoptLevel(key) {
    levelKey = key;
    level = LEVELS[key];
    el.eyebrow.textContent = "Gate Pass Request · " + levelKey + " Approval";
}

/**
 * With an explicit Level we load that level's report and nothing else. Without
 * one, each level's report is tried in turn and we settle on the level whose
 * criteria the record's Request__Status actually satisfies — so a request sitting
 * at "L1 Approve" is handled as L2 even though the page didn't say so. If no
 * level's criteria matches, the first report that returned the record is used,
 * which leaves the note explaining why the buttons are hidden.
 */
function loadRecord() {
    var keys = explicitLevel ? [explicitLevel] : Object.keys(LEVELS);
    var firstHit = null;

    function attempt(index) {
        if (index >= keys.length) {
            if (firstHit) {
                adoptLevel(firstHit.key);
                render(firstHit.data);
            } else {
                showState("Record " + recordId + " was not found in " +
                    keys.map(function (k) { return LEVELS[k].report; }).join(" or ") + ".", true);
            }
            return;
        }

        var key = keys[index];
        return ZOHO.CREATOR.DATA.getRecordById({
            app_name: APP_NAME,
            report_name: LEVELS[key].report,
            id: recordId,
            field_config: "all"
        }).then(function (response) {
            console.log("Process record (" + LEVELS[key].report + "):", response);

            var data = response && response.data;
            if (!data) {
                return attempt(index + 1);
            }
            if (!firstHit) {
                firstHit = { key: key, data: data };
            }

            var status = display(pick(data, FIELDS.requestStatus));
            if (explicitLevel || fitsLevel(key, status)) {
                adoptLevel(key);
                render(data);
                return;
            }
            console.log("Status “" + status + "” does not fit " + key + "; trying the next level.");
            return attempt(index + 1);
        }).catch(function (err) {
            console.warn("getRecordById failed for " + LEVELS[key].report + ":", err);
            return attempt(index + 1);
        });
    }

    return attempt(0);
}

function fitsLevel(key, status) {
    var actionable = LEVELS[key].actionable;
    if (!actionable || !status) {
        return true;
    }
    return actionable.some(function (allowed) {
        return slug(allowed) === slug(status);
    });
}

/* ---------------- rendering ---------------- */

function render(data) {
    var requestType = display(pick(data, FIELDS.requestType));
    var status = display(pick(data, FIELDS.requestStatus));
    var decision = display(pick(data, FIELDS.processRequest));

    gatePassRequestNo = display(pick(data, FIELDS.requestId));
    el.requestId.textContent = gatePassRequestNo || recordId;
    setPill(status || decision);

    el.meta.textContent = "";
    addMeta("User", display(pick(data, FIELDS.user)));
    addMeta("Requested Date", display(pick(data, FIELDS.requestedDate)));
    addMeta("Request Type", requestType);

    renderItems(data, requestType);
    setActionAvailability(status, decision, requestType);

    el.state.hidden = true;
    el.card.hidden = false;
}

/**
 * Criteria gate. Request__Status lives on Gate_Pass_Request, which this widget
 * cannot read, so it is only enforced when the process record happens to expose
 * it. Otherwise we fall back to Process_Request: a record that already says
 * Approve or Reject has been actioned and must not be actioned again.
 */
function setActionAvailability(status, decision, requestType) {
    console.log("action gate:", {
        level: levelKey,
        requestType: requestType,
        requestStatus: status || "(not on this report)",
        processRequest: decision || "(empty)",
        enforcedStatuses: level.actionable || "(not enforced)"
    });

    // The Deluge guards on Request_Type being set before writing either branch.
    if (!requestType) {
        return blockActions("This request has no Request Type set, so it cannot be actioned.");
    }

    // A record whose Process_Request is already set has been decided — this guard
    // always applies, and is the only one when the criteria isn't configured.
    var decided = slug(decision);
    if (decided === slug(PROCESS_APPROVE) || decided === slug(PROCESS_REJECT)) {
        return blockActions("This request has already been marked “" + decision + "”.");
    }

    if (level.actionable && status) {
        if (!level.actionable.some(function (allowed) { return slug(allowed) === slug(status); })) {
            return blockActions("This request is at “" + status + "”, which is not a status " +
                levelKey + " acts on (expected: " + level.actionable.join(", ") + ").");
        }
    }

    el.actions.hidden = false;
    el.note.hidden = true;
}

function blockActions(text) {
    el.actions.hidden = true;
    showNote(text);
}

function addMeta(label, value) {
    var dt = document.createElement("dt");
    dt.textContent = label;

    var dd = document.createElement("dd");
    var span = document.createElement("span");
    span.className = "m-label";
    span.textContent = label;
    var val = document.createElement("span");
    val.className = "m-value";
    val.textContent = value || "—";
    dd.appendChild(span);
    dd.appendChild(val);

    el.meta.appendChild(dt);
    el.meta.appendChild(dd);
}

function setPill(status) {
    el.statusText.textContent = status || "—";
    el.statusPill.className = "pill";

    var key = slug(status);
    if (key.indexOf("approve") > -1 || key.indexOf("generate") > -1) {
        el.statusPill.classList.add("is-approved");
    } else if (key.indexOf("reject") > -1) {
        el.statusPill.classList.add("is-rejected");
    } else if (key) {
        el.statusPill.classList.add("is-pending");
    }
}

function renderItems(data, requestType) {
    var field = findItemsField(data, requestType);
    var rows = field ? data[field] : [];

    el.itemsTitle.textContent = requestType || labelFor(field) || "Items";

    if (!rows.length) {
        el.tableWrap.hidden = true;
        el.itemsEmpty.hidden = false;
        el.itemsCount.hidden = true;
        return;
    }

    var fallback = display(pick(data, FIELDS.itemCategory));
    var kinds = rows.map(function (row) { return kindOf(row, fallback); });

    renderCategoryTags(rows, fallback);

    var columns = columnsFor(rows, kinds.filter(Boolean));
    var thead = el.itemsTable.tHead;
    var tbody = el.itemsTable.tBodies[0];
    thead.textContent = "";
    tbody.textContent = "";

    var headRow = thead.insertRow();
    columns.forEach(function (col) {
        var th = document.createElement("th");
        th.className = col.cls;
        th.textContent = col.label;
        headRow.appendChild(th);
    });

    rows.forEach(function (row, index) {
        var tr = tbody.insertRow();
        columns.forEach(function (col) {
            fillCell(tr.insertCell(), col, row, kinds[index]);
        });
    });

    el.itemsCount.textContent = rows.length + (rows.length === 1 ? " item" : " items");
    el.itemsCount.hidden = false;
    el.tableWrap.hidden = false;
    el.itemsEmpty.hidden = true;
}

/**
 * A serial number belongs only to a unique item, so on a batch row that cell is
 * struck out rather than filled. Quantity applies to both categories.
 */
function fillCell(td, col, row, kind) {
    td.className = col.cls;

    if (col.only && kind && col.only !== kind) {
        td.classList.add("is-na");
        td.textContent = "—";
        return;
    }
    td.textContent = display(row[col.key]) || "—";
}

/** The distinct item categories in this request, shown once above the table. */
function renderCategoryTags(rows, fallback) {
    el.itemCats.textContent = "";
    var seen = {};

    rows.forEach(function (row) {
        var label = display(pick(row, ITEM_CATEGORY_KEYS)) || fallback;
        var key = slug(label);
        if (!key || seen[key]) {
            return;
        }
        seen[key] = true;

        var tag = document.createElement("span");
        var kind = kindOf(row, fallback);
        tag.className = "cat-tag" + (kind ? " is-" + kind : "");
        tag.textContent = label;
        el.itemCats.appendChild(tag);
    });
}

/** The item category of one row, falling back to the record-level field. */
function kindOf(row, fallback) {
    var value = display(pick(row, ITEM_CATEGORY_KEYS)) || fallback;
    var key = slug(value);
    if (key.indexOf("unique") > -1 || key.indexOf("serial") > -1 || key.indexOf("sno") > -1) {
        return KIND_UNIQUE;
    }
    if (key.indexOf("batch") > -1) {
        return KIND_BATCH;
    }
    return "";
}

/**
 * Resolves COLUMNS against the link names the rows actually carry, and drops a
 * category-specific column when no row is of that category — an all-batch
 * request shows no Serial No. column at all, and vice versa.
 */
function columnsFor(rows, kinds) {
    var taken = {};

    var resolved = COLUMNS.map(function (col) {
        if (col.only && kinds.length && kinds.indexOf(col.only) === -1) {
            return null;
        }
        var key = resolveColumn(rows, col, taken);
        if (!key) {
            return null;
        }
        taken[key] = true;
        return { key: key, label: col.label, cls: col.cls, only: col.only };
    }).filter(Boolean);

    console.log("item columns resolved to:", resolved.map(function (c) {
        return c.label + " → " + c.key;
    }).join(", ") || "(none)", "| available:", Object.keys(rows[0] || {}).join(", "));

    return resolved;
}

/**
 * A named field that actually holds a value wins. Failing that, any unclaimed
 * field whose link name matches the column's pattern — subform columns get
 * renamed often, and a renamed field should not blank the table. Only if
 * nothing holds data do we fall back to a name that merely exists.
 */
function resolveColumn(rows, col, taken) {
    var withValue = col.keys.filter(function (key) {
        return rows.some(function (row) { return display(row[key]) !== ""; });
    });
    if (withValue.length) {
        return withValue[0];
    }

    if (col.pattern) {
        var guess = allKeys(rows).filter(function (key) {
            return !taken[key] && col.pattern.test(key) && !COLUMN_EXCLUDE.test(key) &&
                rows.some(function (row) { return display(row[key]) !== ""; });
        })[0];
        if (guess) {
            console.log('"' + col.label + '" matched "' + guess + '" by pattern — add it to COLUMNS.');
            return guess;
        }
    }

    var present = col.keys.filter(function (key) {
        return rows.some(function (row) {
            return Object.prototype.hasOwnProperty.call(row, key);
        });
    });
    return present[0] || null;
}

function allKeys(rows) {
    var seen = {};
    rows.forEach(function (row) {
        Object.keys(row).forEach(function (key) {
            if (!Array.isArray(row[key])) {
                seen[key] = true;
            }
        });
    });
    return Object.keys(seen);
}

/**
 * Picks the subform to show. Works for both "Returnable Items" and
 * "Non-Returnable Items" without hard-coding either: match the request type
 * against the subform link name, and fall back to the only populated subform.
 */
function findItemsField(data, requestType) {
    var subforms = Object.keys(data).filter(function (key) {
        return isSubform(data[key]);
    });
    if (!subforms.length) {
        return null;
    }

    var wanted = slug(requestType);
    var exact = subforms.filter(function (key) {
        return slug(key) === wanted;
    });
    if (exact.length) {
        return exact[0];
    }

    var populated = subforms.filter(function (key) {
        return data[key].length > 0;
    });
    return populated[0] || subforms[0];
}

function isSubform(value) {
    if (!Array.isArray(value) || !value.length) {
        return false;
    }
    var row = value[0];
    if (row === null || typeof row !== "object") {
        return false;
    }
    // Multi-select / lookup arrays only carry ID + display value; subform rows carry real fields.
    return Object.keys(row).some(function (key) {
        return key !== "ID" && key !== "display_value" && key !== "zc_display_value";
    });
}

function labelFor(key) {
    return key ? key.replace(/_/g, " ") : "";
}

/* ---------------- approve / reject ---------------- */

function openDecision(decision) {
    pendingDecision = decision;
    var rejecting = decision === "reject";

    el.decision.className = "decision" + (rejecting ? " is-reject" : "");
    el.remarksLabel.textContent = rejecting ? "Reject Reason" : "Approved Remarks (optional)";
    el.confirmBtn.className = "btn " + (rejecting ? "btn-reject" : "btn-approve");
    el.confirmBtn.textContent = rejecting ? "Confirm Reject" : "Confirm Approve";
    el.remarks.value = "";
    el.remarksError.hidden = true;

    el.actions.hidden = true;
    el.msg.hidden = true;
    el.decision.hidden = false;
    el.remarks.focus();
}

function closeDecision() {
    pendingDecision = null;
    el.decision.hidden = true;
    el.actions.hidden = false;
}

function confirmDecision() {
    if (busy || !pendingDecision) {
        return;
    }
    var rejecting = pendingDecision === "reject";
    var remarks = el.remarks.value.trim();

    if (rejecting && !remarks) {
        el.remarksError.hidden = false;
        el.remarks.focus();
        return;
    }

    busy = true;
    el.confirmBtn.disabled = true;
    el.cancelBtn.disabled = true;

    // On L2 approve the gate pass number is issued as part of the same save.
    var needsNumber = !rejecting && level.generatesGatePass;
    var finalStatus = rejecting ? level.rejectedStatus :
        (needsNumber ? GATE_PASS_STATUS : level.approvedStatus);

    showMessage(needsNumber ? "Generating gate pass number…" : "Saving…", null);

    var prepare = needsNumber ? nextGatePassNumber() : Promise.resolve(null);

    prepare.then(function (gatePassNumber) {
        if (gatePassNumber) {
            showMessage("Saving " + gatePassNumber + "…", null);
        }
        return update(level.report, recordId, decisionValues(rejecting, remarks, gatePassNumber));
    }).then(function () {
        busy = false;
        pendingDecision = null;
        el.decision.hidden = true;
        el.actions.hidden = true;
        setPill(finalStatus);
        showMessage("Request marked as " + finalStatus + ".", true);
        closeAndRefresh();
    }).catch(function (err) {
        console.error("decision failed:", err);
        busy = false;
        el.confirmBtn.disabled = false;
        el.cancelBtn.disabled = false;
        showMessage(messageFor(err), false);
    });
}

function update(reportName, id, values) {
    console.log("updating " + reportName + "/" + id + ":", values);
    return ZOHO.CREATOR.DATA.updateRecordById({
        app_name: APP_NAME,
        report_name: reportName,
        id: id,
        payload: { data: values }
    }).then(function (response) {
        if (response && response.code != null && response.code !== 3000) {
            throw new Error(response.message || "Update failed with code " + response.code + ".");
        }
        return response;
    });
}

/**
 * Everything one decision writes: the approval block from the level's Deluge,
 * the process fields the form itself would have saved, and on L2 approve the
 * gate pass block.
 */
function decisionValues(rejecting, remarks, gatePassNumber) {
    var f = level.fields;
    var values = {};

    if (rejecting) {
        values[f.rejectRemarks] = remarks;
        values[f.rejectDate] = today();
        values[STATUS_FIELD] = level.rejectedStatus;
    } else {
        values[f.approveRemarks] = remarks;
        values[f.approveDate] = today();
        values[STATUS_FIELD] = level.approvedStatus;
    }
    if (loginUser) {
        values[f.user] = loginUser;
    }

    // What the form's Submit would have saved, including clearing the unused remark.
    values[PROCESS_FIELDS.decision] = rejecting ? PROCESS_REJECT : PROCESS_APPROVE;
    values[PROCESS_FIELDS.approveRemarks] = rejecting ? "" : remarks;
    values[PROCESS_FIELDS.rejectRemarks] = rejecting ? remarks : "";

    // Issuing the number also advances the status past "L2 Approve", so this
    // assignment intentionally overwrites the one above.
    if (gatePassNumber) {
        values.Gate_Pass_Number = gatePassNumber;
        values.Gate_Pass_Number1 = gatePassNumber;
        values.Gate_Pass_Generated_Date = today();
        values.Send_to_Mail = "No";
        values[STATUS_FIELD] = GATE_PASS_STATUS;
    }
    return values;
}

/**
 * NSDC-KB-GP-0001, NSDC-KB-GP-0002, … Scans every existing number carrying the
 * prefix and takes the largest counter, as the Deluge does.
 */
function nextGatePassNumber() {
    return ZOHO.CREATOR.DATA.getRecords({
        app_name: APP_NAME,
        report_name: NUMBER_SCAN_REPORT || level.report,
        criteria: '(Gate_Pass_Number.contains("' + GATE_PASS_PREFIX + '"))',
        max_records: 1000,
        field_config: "all"
    }).catch(function (err) {
        // "No records found" is the expected answer before the first gate pass.
        if (isNoRecords(err)) {
            console.log("no existing gate pass numbers; starting the sequence.");
            return { data: [] };
        }
        throw err;
    }).then(function (response) {
        var rows = (response && response.data) || [];
        var greatest = 0;

        rows.forEach(function (row) {
            var suffix = suffixOf(display(row.Gate_Pass_Number));
            if (suffix > greatest) {
                greatest = suffix;
            }
        });

        console.log("highest existing gate pass suffix:", greatest, "from", rows.length, "record(s)");
        return GATE_PASS_PREFIX + "-" + padNumber(greatest + 1);
    });
}

/**
 * Creator answers an empty criteria search with an error rather than an empty
 * list — 9280 from getRecords, 3100 elsewhere. The SDK sometimes rejects with
 * the parsed object and sometimes with the raw JSON string, so check both.
 */
function isNoRecords(err) {
    if (!err) {
        return false;
    }
    var code = err.code != null ? err.code : (err.responseJSON && err.responseJSON.code);
    if (code === 3100 || code === 9280) {
        return true;
    }
    var text = typeof err === "string" ? err : (err.message || err.responseText || "");
    if (!text) {
        try {
            text = JSON.stringify(err);
        } catch (ignored) {
            text = "";
        }
    }
    return /"?code"?\s*:?\s*(9280|3100)|no\s*records?\s*found/i.test(String(text));
}

/**
 * The counter at the end of a gate pass number. The prefix itself contains
 * dashes (NSDC-KB-GP-0007), so anchor on the prefix and read what follows
 * rather than splitting the whole string — 0 for anything not in this series.
 */
function suffixOf(number) {
    if (number.indexOf(GATE_PASS_PREFIX) !== 0) {
        return 0;
    }
    var tail = number.slice(GATE_PASS_PREFIX.length).replace(/^[-\/\s]+/, "");
    var value = parseInt(tail, 10);
    return isNaN(value) ? 0 : value;
}

function padNumber(value) {
    var text = String(value);
    while (text.length < GATE_PASS_PAD) {
        text = "0" + text;
    }
    return text;
}

function messageFor(err) {
    return (err && (err.message || err.responseText)) || "Could not submit this decision.";
}

/** dd-MMM-yyyy, matching the format the form displays (13-Aug-2026). */
function today() {
    var d = new Date();
    var day = d.getDate() < 10 ? "0" + d.getDate() : String(d.getDate());
    return day + "-" + MONTHS[d.getMonth()] + "-" + d.getFullYear();
}

/**
 * Widget equivalent of the Deluge tail:
 *   openUrl("#Script:dialog.close","same window");
 *   openUrl("#Script:page.refresh","same window");
 * Those openUrl calls cannot reach the browser when the workflow is triggered
 * over the API, so the widget performs them itself.
 */
function closeAndRefresh() {
    setTimeout(function () {
        // Refresh first: dialog.close tears this iframe down, and sending both
        // in one tick lets the close supersede a refresh that is still in
        // flight — which shows up as an intermittent "it closed but the list
        // is stale". The gap gives the parent time to act on the refresh.
        navigateParent("#Script:page.refresh");
        setTimeout(function () {
            navigateParent("#Script:dialog.close");
        }, CLOSE_DELAY);
    }, 700);
}

function navigateParent(url) {
    return ZOHO.CREATOR.UTIL.navigateParentURL({
        action: "open",
        url: url,
        window: "same"
    }).catch(function (err) {
        console.warn("navigateParentURL failed for " + url + ":", err);
    });
}

function showMessage(text, ok) {
    el.msg.textContent = text;
    el.msg.className = "msg" + (ok === true ? " is-ok" : ok === false ? " is-error" : "");
    el.msg.hidden = false;
}

function showNote(text) {
    el.note.textContent = text;
    el.note.hidden = false;
}

function showState(text, isError) {
    el.stateText.textContent = text;
    el.state.className = "state" + (isError ? " error" : "");
    el.state.hidden = false;
    el.card.hidden = true;
}

/* ---------------- helpers ---------------- */

function pick(data, candidates) {
    for (var i = 0; i < candidates.length; i++) {
        if (data[candidates[i]] != null && data[candidates[i]] !== "") {
            return data[candidates[i]];
        }
    }
    return null;
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

        // Creator Name fields arrive split into parts rather than one string.
        var parts = [value.prefix, value.first_name, value.last_name, value.suffix]
            .filter(function (part) { return part; });
        if (parts.length) {
            return parts.join(" ");
        }

        if (value.Name != null) return display(value.Name);

        // A lookup that carries its own fields rather than a display value:
        // take the first readable string that is not an internal id.
        var keys = Object.keys(value).filter(function (key) {
            return !/^id$/i.test(key) && !/^zc_/.test(key) && typeof value[key] === "string" && value[key];
        });
        if (keys.length) {
            return value[keys[0]];
        }

        console.warn("field value not recognised, printing blank:", value);
        return "";
    }
    return String(value);
}

function slug(value) {
    return String(value == null ? "" : value).toLowerCase().replace(/[^a-z]/g, "");
}
