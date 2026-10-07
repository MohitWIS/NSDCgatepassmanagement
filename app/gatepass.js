var APP_NAME = "item-gate-pass-management-system";

// Reports tried in order until one returns the record. Override per-link with
// &Report=Some_Report on the openUrl if a pass lives somewhere else.
var REPORTS = ["L2_End_Report", "L1_End_Report"];

// Blank rows are kept so a short pass still prints with the pad's proportions.
var MIN_ITEM_ROWS = 3;

/**
 * Field link names, first match wins. Anything not found stays blank, exactly
 * as on the printed pad — check the console log and trim these to your fields.
 */
var FIELDS = {
    srNo: ["Gate_Pass_Number", "Gate_Pass_Number1"],
    companyName: ["Company_M_S", "Transporter_Name"],
    personName: ["Name_of_Person_SPOC", "Name_of_Person", "Person_Name"],
    issueDate: ["Gate_Pass_Generated_Date", "Requested_Date", "Request_Date"],
    issueTime: ["Added_Time", "Gate_Pass_Time", "Issue_Time", "Time"],
    returnDate: ["Return_Date", "Expected_Return_Date", "Returnable_Date"],
    requestType: ["Request_Type", "Type"],
    itemCategory: ["Item_Category", "Item_category", "ItemCategory"],

    // Signature block: who raised it, and who approved it at each level.
    // Receiver Sign is deliberately left blank to be signed by hand.
    submittedBy: ["User", "Added_User", "Requested_By", "Submitted_By"],
    deptHead: ["L1_User"],
    adminHead: ["L2_User"]
};

// Subform row → printed column.
var ITEM_FIELDS = {
    description: ["Item_Name1", "Item_Name", "Item_name", "ItemName", "Description"],
    unit: ["UoM", "UOM", "Uom", "Unit_of_Measure", "Unit"],
    qty: ["Quantity", "Qty"],
    remarks: ["Remarks"],
    serial: ["Serial_No", "Serial_Number", "Serial_no", "SerialNo"],
    category: ["Item_Category", "Item_category", "ItemCategory", "Category"]
};

var el = {};
var recordId = null;
var debugMode = false;

document.addEventListener("DOMContentLoaded", function () {
    ["loadStatus", "printBtn", "srNo", "companyName", "personName", "issueDate",
        "issueTime", "returnDate", "itemRows", "serialHead", "debugBox",
        "submittedBy", "deptHead", "adminHead"].forEach(function (id) {
            el[id] = document.getElementById(id);
        });

    el.printBtn.addEventListener("click", function () { window.print(); });

    start();
});

function start() {
    ZOHO.CREATOR.UTIL.getQueryParams().then(function (params) {
        console.log("gate pass queryParams:", params);

        recordId = params && params.Request_ID;
        if (!recordId) {
            return showStatus("No Request_ID was passed to this page.", true);
        }

        debugMode = !!(params && (params.debug || params.Debug));
        var override = params && (params.Report || params.report);
        loadRecord(override ? [override] : REPORTS);
    }).catch(function (err) {
        console.error("getQueryParams failed:", err);
        showStatus("Could not read the page parameters.", true);
    });
}

/** Tries each report in turn; the first one holding the record wins. */
function loadRecord(reports) {
    function attempt(index) {
        if (index >= reports.length) {
            return showStatus("Request " + recordId + " was not found in " + reports.join(" or ") + ".", true);
        }
        var reportName = reports[index];

        return ZOHO.CREATOR.DATA.getRecordById({
            app_name: APP_NAME,
            report_name: reportName,
            id: recordId,
            field_config: "all"
        }).then(function (response) {
            console.log("gate pass record (" + reportName + "):", response);

            var data = response && response.data;
            if (!data) {
                return attempt(index + 1);
            }
            fill(data);
            showStatus("", false);
            el.printBtn.disabled = false;
            if (debugMode) {
                renderDebug(reportName, data);
            }
        }).catch(function (err) {
            console.warn("getRecordById failed for " + reportName + ":", err);
            return attempt(index + 1);
        });
    }
    return attempt(0);
}

/**
 * Screen-only field dump, shown when the URL carries &debug=1. Lists every link
 * name the report returned, so a blank line on the pass can be traced to either
 * a missing column or a value shape display() does not unwrap.
 */
function renderDebug(reportName, data) {
    var lines = [reportName + " returned " + Object.keys(data).length + " fields:", ""];

    Object.keys(data).sort().forEach(function (key) {
        var value = data[key];
        if (Array.isArray(value)) {
            lines.push(pad(key) + "[subform, " + value.length + " row(s)]");
            return;
        }
        var shown = display(value);
        if (!shown && value && typeof value === "object") {
            shown = "(object) " + JSON.stringify(value);
        }
        lines.push(pad(key) + (shown || "(empty)"));
    });

    el.debugBox.textContent = lines.join("\n");
    el.debugBox.hidden = false;
}

function pad(key) {
    var text = key;
    while (text.length < 34) {
        text += " ";
    }
    return text + "  ";
}

/* ---------------- filling the pass ---------------- */

function fill(data) {
    setText(el.srNo, pickText(data, FIELDS.srNo));
    setText(el.companyName, pickText(data, FIELDS.companyName));
    setText(el.personName, pickTextLoose(data, FIELDS.personName, /person|spoc/i));
    setText(el.issueDate, pickText(data, FIELDS.issueDate));
    setText(el.issueTime, timeOnly(pickText(data, FIELDS.issueTime)));
    setText(el.returnDate, pickText(data, FIELDS.returnDate));

    setText(el.submittedBy, pickText(data, FIELDS.submittedBy));
    setText(el.deptHead, pickText(data, FIELDS.deptHead));
    setText(el.adminHead, pickText(data, FIELDS.adminHead));

    var requestType = pickText(data, FIELDS.requestType);
    fillItems(findItemsField(data, requestType), data, pickText(data, FIELDS.itemCategory));
    markStatus(requestType);

    document.title = "Gate Pass " + (pickText(data, FIELDS.srNo) || recordId);
}

/**
 * "Unique Item with S.No" rows print their serial number in the SR. No. column
 * and leave Remarks blank for the security desk to write in. Everything else
 * numbers the rows 1, 2, 3 and prints its own Remarks.
 */
function fillItems(field, data, recordCategory) {
    var rows = field ? data[field] : [];
    el.itemRows.textContent = "";

    // The Serial No. column only exists when the pass carries a unique item.
    var withSerial = rows.some(function (row) { return isUniqueItem(row, recordCategory); });
    el.serialHead.hidden = !withSerial;

    rows.forEach(function (row, index) {
        var unique = isUniqueItem(row, recordCategory);
        addItemRow(withSerial, [
            String(index + 1),
            pickTextLoose(row, ITEM_FIELDS.description, /name|product|descrip|title/i),
            pickText(row, ITEM_FIELDS.unit),
            pickText(row, ITEM_FIELDS.qty),
            unique ? pickText(row, ITEM_FIELDS.serial) : "",
            unique ? "" : pickText(row, ITEM_FIELDS.remarks)
        ]);
    });

    for (var i = rows.length; i < MIN_ITEM_ROWS; i++) {
        addItemRow(withSerial, ["", "", "", "", "", ""]);
    }
}

function isUniqueItem(row, recordCategory) {
    var key = slug(pickText(row, ITEM_FIELDS.category) || recordCategory);
    return key.indexOf("unique") > -1 || key.indexOf("serial") > -1 || key.indexOf("sno") > -1;
}

function addItemRow(withSerial, values) {
    var classes = ["c-sr", "c-desc", "c-unit", "c-qty", "c-serial", "c-rem"];
    var tr = document.createElement("tr");

    classes.forEach(function (cls, index) {
        if (cls === "c-serial" && !withSerial) {
            return;
        }
        var td = document.createElement("td");
        td.className = cls;
        td.textContent = values[index];
        tr.appendChild(td);
    });

    el.itemRows.appendChild(tr);
}

/** Ticks the Yes column against the row matching Request_Type. */
function markStatus(requestType) {
    var wanted = slug(requestType);
    if (!wanted) {
        return;
    }
    var rows = document.querySelectorAll(".status tbody tr");

    Array.prototype.forEach.call(rows, function (tr) {
        var label = slug(tr.getAttribute("data-status"));
        if (!label || wanted.indexOf(label) !== 0) {
            return;
        }
        var yes = tr.cells[1];
        yes.textContent = "✓";
        yes.className = "is-checked";
    });
}

/**
 * Picks the subform holding the items. Matches the request type against the
 * subform link name, and otherwise falls back to the only populated one.
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

/* ---------------- helpers ---------------- */

function showStatus(text, isError) {
    el.loadStatus.textContent = text;
    el.loadStatus.className = "status" + (isError ? " is-error" : "");
    el.loadStatus.hidden = !text;
}

/**
 * Added_Time arrives as a full stamp ("13-Aug-2026 14:32:05"); the pad's Time
 * line wants the clock part on its own. Returns "" if there is no time in it.
 */
function timeOnly(value) {
    var match = String(value == null ? "" : value)
        .match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*([AaPp]\.?[Mm]\.?)?/);
    if (!match) {
        return "";
    }
    var meridiem = match[2] ? " " + match[2].replace(/\./g, "").toUpperCase() : "";
    return match[1] + meridiem;
}

function setText(node, value) {
    if (node) {
        node.textContent = value;
    }
}

/**
 * Exact candidates first; failing that, any field whose link name matches
 * `pattern` and holds a value. Link names vary between forms, so this fills the
 * pass without a code change — the key it settled on is logged so the candidate
 * list above can be trimmed to it.
 */
function pickTextLoose(data, candidates, pattern) {
    var text = pickText(data, candidates);
    if (text) {
        return text;
    }

    var keys = Object.keys(data).filter(function (key) {
        return pattern.test(key) && !Array.isArray(data[key]);
    });
    for (var i = 0; i < keys.length; i++) {
        var value = display(data[keys[i]]);
        if (value) {
            console.log('matched "' + keys[i] + '" via ' + pattern + " — add it to FIELDS.");
            return value;
        }
    }
    console.warn("no field matched " + pattern + "; candidates tried:", candidates);
    return "";
}

function pickText(data, candidates) {
    for (var i = 0; i < candidates.length; i++) {
        var value = data[candidates[i]];
        if (value != null && value !== "") {
            var text = display(value);
            if (text) {
                return text;
            }
        }
    }
    return "";
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
            return !/^id$/i.test(key) && !/^zc_/.test(key) &&
                typeof value[key] === "string" && value[key];
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
