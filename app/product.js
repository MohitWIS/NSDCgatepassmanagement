/**
 * Product Catalog — self-contained (no external assets; the widget CSP blocks
 * them). Thumbnails are inline SVG placeholders keyed off the category.
 *
 * To feed this from Creator instead of the sample list, set CREATOR_SOURCE.report
 * to a report over your product form and map the fields in fromCreatorRecord().
 */
var CREATOR_SOURCE = {
    app_name: "item-gate-pass-management-system",
    report: "",          // e.g. "All_Products" — empty means use SAMPLE_PRODUCTS
    max_records: 200
};

var CATEGORIES = ["Drinkware", "Bags", "Office", "Electronics", "Apparel", "Gift Sets", "Awards"];
var BRANDING_TYPES = ["Screen Print", "Laser Engraving", "Embroidery", "UV Print", "Debossing"];
var SUPPLIERS = ["Gifto Impex", "Vardhman Exports", "Suncraft Industries", "Elite Promotions", "NovaGifts"];

var PRICE_BANDS = [
    { label: "0 - 250", min: 0, max: 250 },
    { label: "250 - 500", min: 250, max: 500 },
    { label: "500 - 1000", min: 500, max: 1000 },
    { label: "1000 - 2500", min: 1000, max: 2500 },
    { label: "2500+", min: 2500, max: Infinity }
];

var MOQ_BANDS = [
    { label: "Any MOQ", max: Infinity },
    { label: "Up to 25 Pcs", max: 25 },
    { label: "Up to 50 Pcs", max: 50 },
    { label: "Up to 100 Pcs", max: 100 }
];

var SORTS = [
    { label: "Featured", apply: null },
    { label: "Price: Low to High", apply: function (a, b) { return a.price - b.price; } },
    { label: "Price: High to Low", apply: function (a, b) { return b.price - a.price; } },
    { label: "Name: A to Z", apply: function (a, b) { return a.name.localeCompare(b.name); } },
    { label: "Lowest MOQ", apply: function (a, b) { return a.moq - b.moq; } }
];

var SAMPLE_PRODUCTS = [
    p("BOT-024", "Vacuum Bottle 750ml", "Drinkware", 475, 50, "Laser Engraving", "Gifto Impex", "Best Seller"),
    p("MUG-011", "Coffee Mug – Matte", "Drinkware", 185, 50, "UV Print", "Suncraft Industries", ""),
    p("BAG-067", "Laptop Backpack Premium", "Bags", 1250, 25, "Embroidery", "Vardhman Exports", ""),
    p("DIA-032", "Premium Pu Diary", "Office", 325, 50, "Debossing", "Elite Promotions", ""),
    p("SPK-103", "Wireless Speaker", "Electronics", 1150, 25, "UV Print", "NovaGifts", "New Arrival"),
    p("PWB-045", "Power Bank 10000mAh", "Electronics", 650, 25, "Laser Engraving", "NovaGifts", ""),
    p("PEN-019", "Metal Pen Gift Set", "Office", 275, 50, "Laser Engraving", "Elite Promotions", ""),
    p("TSH-022", "Round Neck T-Shirt", "Apparel", 275, 50, "Screen Print", "Vardhman Exports", ""),
    p("BOT-031", "Copper Water Bottle", "Drinkware", 640, 25, "Laser Engraving", "Gifto Impex", ""),
    p("MUG-018", "Ceramic Mug Gift Box", "Drinkware", 320, 50, "UV Print", "Suncraft Industries", "New Arrival"),
    p("TMB-007", "Steel Tumbler 500ml", "Drinkware", 380, 50, "Laser Engraving", "Gifto Impex", ""),
    p("BAG-022", "Jute Tote Bag", "Bags", 145, 100, "Screen Print", "Suncraft Industries", "Best Seller"),
    p("BAG-039", "Duffle Travel Bag", "Bags", 1450, 25, "Embroidery", "Vardhman Exports", ""),
    p("BAG-051", "Canvas Messenger Bag", "Bags", 890, 50, "Embroidery", "Vardhman Exports", ""),
    p("DSK-014", "Desk Organiser Wooden", "Office", 720, 25, "Laser Engraving", "Elite Promotions", ""),
    p("NTB-008", "A5 Notebook Set", "Office", 210, 100, "Debossing", "Elite Promotions", ""),
    p("CAL-003", "Desk Calendar 2026", "Office", 165, 100, "UV Print", "Suncraft Industries", ""),
    p("EAR-077", "TWS Earbuds", "Electronics", 1450, 25, "UV Print", "NovaGifts", "Best Seller"),
    p("MUS-012", "Wireless Mouse", "Electronics", 540, 50, "UV Print", "NovaGifts", ""),
    p("CHG-029", "Wireless Charging Pad", "Electronics", 690, 25, "Laser Engraving", "NovaGifts", ""),
    p("TSH-030", "Polo T-Shirt Cotton", "Apparel", 430, 50, "Embroidery", "Vardhman Exports", ""),
    p("JKT-011", "Softshell Jacket", "Apparel", 1650, 25, "Embroidery", "Vardhman Exports", "New Arrival"),
    p("CAP-005", "Baseball Cap", "Apparel", 185, 100, "Embroidery", "Vardhman Exports", ""),
    p("GFT-041", "Executive Gift Hamper", "Gift Sets", 2450, 25, "Debossing", "Elite Promotions", "Best Seller"),
    p("GFT-016", "Diwali Gift Box", "Gift Sets", 1250, 50, "UV Print", "Gifto Impex", ""),
    p("GFT-028", "Welcome Kit Combo", "Gift Sets", 980, 50, "Screen Print", "Gifto Impex", ""),
    p("AWD-009", "Crystal Trophy", "Awards", 1850, 10, "Laser Engraving", "Suncraft Industries", ""),
    p("AWD-015", "Wooden Plaque", "Awards", 950, 25, "Laser Engraving", "Suncraft Industries", ""),
    p("AWD-021", "Acrylic Award Stand", "Awards", 620, 25, "UV Print", "Suncraft Industries", "New Arrival")
];

function p(sku, name, category, price, moq, branding, supplier, badge) {
    return {
        sku: sku, name: name, category: category, price: price,
        moq: moq, branding: branding, supplier: supplier, badge: badge
    };
}

/* ---------------- product artwork ----------------
 * Drawn inline so the page stays self-contained: Creator's widget CSP blocks
 * external image hosts unless they are listed in plugin-manifest.json. Artwork
 * is chosen by SKU prefix, so it matches the product, not just its category.
 * To use real photos instead, see thumbFor() at the bottom of this block.
 * All viewBoxes are 0 0 96 96.
 */
var ART = {
    BOT: '<rect x="40" y="9" width="16" height="11" rx="3" fill="#414855"/>' +
        '<rect x="33" y="19" width="30" height="68" rx="11" fill="#24282f"/>' +
        '<rect x="33" y="44" width="30" height="17" fill="#eceef1"/>' +
        '<rect x="38" y="27" width="5" height="12" rx="2.5" fill="#3d434e"/>',
    MUG: '<path d="M26 36h35v27a11 11 0 0 1-11 11H37a11 11 0 0 1-11-11Z" fill="#28456f"/>' +
        '<path d="M61 43h5a10 10 0 0 1 0 20h-5" fill="none" stroke="#28456f" stroke-width="7"/>' +
        '<ellipse cx="43.5" cy="36" rx="17.5" ry="5.5" fill="#375a8e"/>' +
        '<rect x="34" y="48" width="19" height="11" rx="2" fill="#8ea6c8"/>',
    TMB: '<path d="M37 24h22l-4 62H41Z" fill="#7d8894"/>' +
        '<rect x="33" y="14" width="30" height="11" rx="5" fill="#3d4451"/>' +
        '<rect x="41" y="40" width="14" height="16" rx="2" fill="#a7b1bc"/>',
    BAG: '<path d="M27 36a21 21 0 0 1 42 0v43a7 7 0 0 1-7 7H34a7 7 0 0 1-7-7Z" fill="#2b3037"/>' +
        '<path d="M36 32a12 12 0 0 1 24 0" fill="none" stroke="#474e59" stroke-width="5"/>' +
        '<rect x="33" y="52" width="30" height="21" rx="5" fill="#383e47"/>' +
        '<rect x="42" y="60" width="12" height="5" rx="2.5" fill="#5c6470"/>',
    DIA: '<rect x="25" y="15" width="45" height="66" rx="5" fill="#8b5a33"/>' +
        '<rect x="25" y="15" width="9" height="66" fill="#6d4425"/>' +
        '<path d="M70 38h6v20h-6Z" fill="#5b3a1f"/>' +
        '<rect x="41" y="42" width="20" height="12" rx="2" fill="#c9a882"/>',
    NTB: '<rect x="19" y="31" width="46" height="55" rx="4" fill="#2b6b8c"/>' +
        '<rect x="29" y="20" width="46" height="55" rx="4" fill="#3d8fb4"/>' +
        '<rect x="29" y="20" width="9" height="55" fill="#2f7c9e"/>',
    CAL: '<rect x="21" y="25" width="54" height="53" rx="6" fill="#fff" stroke="#ccd3db" stroke-width="3"/>' +
        '<path d="M21 31a6 6 0 0 1 6-6h42a6 6 0 0 1 6 6v9H21Z" fill="#cf4740"/>' +
        '<rect x="33" y="17" width="6" height="13" rx="3" fill="#8b9099"/>' +
        '<rect x="57" y="17" width="6" height="13" rx="3" fill="#8b9099"/>' +
        '<rect x="31" y="50" width="34" height="6" rx="3" fill="#e2e6ea"/>' +
        '<rect x="31" y="62" width="21" height="6" rx="3" fill="#e2e6ea"/>',
    DSK: '<rect x="19" y="45" width="58" height="34" rx="4" fill="#b17b45"/>' +
        '<rect x="19" y="45" width="58" height="9" fill="#8d6032"/>' +
        '<rect x="30" y="23" width="5" height="24" rx="2.5" fill="#2c6cb0"/>' +
        '<rect x="41" y="19" width="5" height="28" rx="2.5" fill="#d1645b"/>' +
        '<rect x="52" y="26" width="5" height="21" rx="2.5" fill="#3aa06a"/>',
    PEN: '<rect x="13" y="34" width="70" height="31" rx="5" fill="#1e2530"/>' +
        '<rect x="18" y="39" width="60" height="21" rx="3" fill="#e9ebef"/>' +
        '<rect x="24" y="46" width="48" height="6" rx="3" fill="#343c48"/>' +
        '<circle cx="26" cy="49" r="3.5" fill="#b8912f"/>',
    SPK: '<rect x="15" y="33" width="66" height="31" rx="15.5" fill="#20242b"/>' +
        '<circle cx="32" cy="48.5" r="10" fill="#39404a"/>' +
        '<circle cx="64" cy="48.5" r="10" fill="#39404a"/>' +
        '<rect x="44" y="43" width="9" height="11" rx="2" fill="#d13b3b"/>',
    PWB: '<rect x="31" y="18" width="34" height="60" rx="7" fill="#23272e"/>' +
        '<rect x="39" y="31" width="18" height="27" rx="3" fill="#3b414b"/>' +
        '<rect x="42" y="35" width="12" height="6" rx="1.5" fill="#5fd08a"/>' +
        '<circle cx="48" cy="68" r="3" fill="#6a7280"/>',
    EAR: '<rect x="23" y="41" width="50" height="35" rx="11" fill="#f1f3f6" stroke="#ccd3dc" stroke-width="3"/>' +
        '<circle cx="37" cy="29" r="10" fill="#e8ebf0" stroke="#ccd3dc" stroke-width="3"/>' +
        '<circle cx="59" cy="29" r="10" fill="#e8ebf0" stroke="#ccd3dc" stroke-width="3"/>' +
        '<rect x="42" y="56" width="12" height="5" rx="2.5" fill="#ccd3dc"/>',
    MUS: '<path d="M48 17c14 0 22 11 22 25v18c0 12-8 20-22 20s-22-8-22-20V42c0-14 8-25 22-25Z" fill="#3a404a"/>' +
        '<rect x="45.5" y="26" width="5" height="15" rx="2.5" fill="#6a7280"/>',
    CHG: '<ellipse cx="48" cy="66" rx="31" ry="12" fill="#282d36"/>' +
        '<rect x="35" y="17" width="26" height="43" rx="5" fill="#49505c"/>' +
        '<rect x="39" y="23" width="18" height="29" rx="2" fill="#8fb6ff"/>',
    TSH: '<path d="M35 18 22 25l-7 14 11 6 4-6v41h36V39l4 6 11-6-7-14-13-7-5 6h-6Z" fill="#9aa1a9"/>' +
        '<rect x="39" y="42" width="18" height="12" rx="2" fill="#c7cdd3"/>',
    JKT: '<path d="M35 17 21 25l6 17 7-4v45h28V38l7 4 6-17-14-8-7 6h-7Z" fill="#33405a"/>' +
        '<rect x="46" y="25" width="4" height="58" fill="#1f2a3d"/>' +
        '<rect x="30" y="52" width="12" height="4" rx="2" fill="#252f44"/>',
    CAP: '<path d="M22 57a26 25 0 0 1 52 0Z" fill="#2f5aa8"/>' +
        '<path d="M74 51h6a11 6 0 0 1-11 6H22v-6Z" fill="#24478a"/>' +
        '<circle cx="48" cy="34" r="3" fill="#24478a"/>',
    GFT: '<rect x="20" y="43" width="56" height="37" rx="3" fill="#bf403e"/>' +
        '<rect x="17" y="32" width="62" height="13" rx="3" fill="#d75450"/>' +
        '<rect x="43" y="32" width="10" height="48" fill="#eec14c"/>' +
        '<path d="M48 32c-9 0-15-4-13-8s11 0 13 8Zm0 0c9 0 15-4 13-8s-11 0-13 8Z" fill="#eec14c"/>',
    AWD: '<path d="M34 16h28v17a14 14 0 0 1-28 0Z" fill="#d5a638"/>' +
        '<path d="M34 21h-8v4a11 11 0 0 0 11 11M62 21h8v4a11 11 0 0 1-11 11" fill="none" stroke="#d5a638" stroke-width="4.5"/>' +
        '<rect x="44" y="47" width="8" height="15" fill="#bd9330"/>' +
        '<rect x="33" y="62" width="30" height="9" rx="2" fill="#8a6a22"/>'
};

// Per-SKU overrides where two products share a prefix but look nothing alike.
var ART_BY_SKU = {
    "BOT-031": '<rect x="40" y="9" width="16" height="11" rx="3" fill="#8a5a2b"/>' +
        '<rect x="33" y="19" width="30" height="68" rx="11" fill="#c07a3e"/>' +
        '<rect x="39" y="30" width="6" height="42" rx="3" fill="#d9975c"/>' +
        '<rect x="33" y="52" width="30" height="10" fill="#a2652f"/>'
};

// Used when a SKU prefix has no artwork of its own.
var CATEGORY_ART = {
    Drinkware: "MUG", Bags: "BAG", Office: "NTB",
    Electronics: "SPK", Apparel: "TSH", "Gift Sets": "GFT", Awards: "AWD"
};

/**
 * Artwork markup for a product. Replace the body with an <img> if you later
 * embed real photos as data URIs, or add the image host to cspDomains.
 */
function artFor(product) {
    if (ART_BY_SKU[product.sku]) {
        return ART_BY_SKU[product.sku];
    }
    var prefix = String(product.sku || "").split("-")[0].toUpperCase();
    return ART[prefix] || ART[CATEGORY_ART[product.category]] || ART.GFT;
}

var HEART = '<path d="M12 20.5 4.2 13a4.7 4.7 0 0 1 6.6-6.7l1.2 1.1 1.2-1.1A4.7 4.7 0 0 1 19.8 13Z"/>';

/* ---------------- state ---------------- */

var products = SAMPLE_PRODUCTS.slice();
var wishlist = {};
var state = {
    search: "",
    categories: [],
    band: null,          // index into PRICE_BANDS
    custom: null,        // {min, max}
    branding: "All",
    supplier: "All",
    moq: MOQ_BANDS[0].label,
    sort: SORTS[0].label,
    page: 1,
    perPage: 8,
    view: "grid"
};

var el = {};
var toastTimer = null;

document.addEventListener("DOMContentLoaded", function () {
    [
        "wishBtn", "wishCount", "searchInput", "pageSub",
        "categoryChips", "priceChips", "customPrice", "priceMin", "priceMax",
        "brandingSelect", "supplierSelect", "moqSelect", "sortSelect",
        "gridViewBtn", "listViewBtn", "activeRow", "activeTokens", "clearAllBtn",
        "grid", "empty", "resultsText", "pages", "perPage",
        "addProductBtn", "modalBackdrop", "closeModalBtn", "cancelModalBtn",
        "addProductForm", "formError", "toast",
        "fName", "fSku", "fCategory", "fSupplier", "fPrice", "fMoq", "fBranding", "fBadge"
    ].forEach(function (id) {
        el[id] = document.getElementById(id);
    });

    buildControls();
    bindEvents();
    loadProducts();
});

/* ---------------- setup ---------------- */

function buildControls() {
    fillSelect(el.brandingSelect, ["All Branding"].concat(BRANDING_TYPES));
    fillSelect(el.supplierSelect, ["All Suppliers"].concat(SUPPLIERS));
    fillSelect(el.moqSelect, MOQ_BANDS.map(function (b) { return b.label; }));
    fillSelect(el.sortSelect, SORTS.map(function (s) { return s.label; }));
    fillSelect(el.fCategory, CATEGORIES);
    fillSelect(el.fSupplier, SUPPLIERS);
    fillSelect(el.fBranding, BRANDING_TYPES);

    // "All" plus one chip per category; chips multi-select.
    el.categoryChips.appendChild(makeCatChip("All"));
    CATEGORIES.forEach(function (name) {
        el.categoryChips.appendChild(makeCatChip(name));
    });

    PRICE_BANDS.forEach(function (band, index) {
        el.priceChips.appendChild(makeChip("₹" + band.label, function () { toggleBand(index); }));
    });
    el.priceChips.appendChild(makeChip("Custom", toggleCustom, true));
}

function makeCatChip(name) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cat-chip";
    btn.dataset.category = name;
    btn.textContent = name;
    btn.addEventListener("click", function () {
        if (name === "All") {
            state.categories = [];
        } else {
            var at = state.categories.indexOf(name);
            if (at === -1) {
                state.categories.push(name);
            } else {
                state.categories.splice(at, 1);
            }
        }
        state.page = 1;
        render();
    });
    return btn;
}

function makeChip(label, onClick, withPencil) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.dataset.label = label;
    btn.textContent = label;
    if (withPencil) {
        var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.innerHTML = '<path d="M4 20h4L20 8l-4-4L4 16v4Z"/>';
        btn.appendChild(svg);
    }
    btn.addEventListener("click", onClick);
    return btn;
}

function fillSelect(select, values) {
    if (!select) {
        return;
    }
    select.textContent = "";
    values.forEach(function (value) {
        var option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    });
}

function bindEvents() {
    el.searchInput.addEventListener("input", function () {
        state.search = el.searchInput.value;
        state.page = 1;
        render();
    });

    el.brandingSelect.addEventListener("change", function () {
        state.branding = el.brandingSelect.selectedIndex === 0 ? "All" : el.brandingSelect.value;
        state.page = 1;
        render();
    });

    el.supplierSelect.addEventListener("change", function () {
        state.supplier = el.supplierSelect.selectedIndex === 0 ? "All" : el.supplierSelect.value;
        state.page = 1;
        render();
    });

    el.moqSelect.addEventListener("change", function () {
        state.moq = el.moqSelect.value;
        state.page = 1;
        render();
    });

    el.sortSelect.addEventListener("change", function () {
        state.sort = el.sortSelect.value;
        state.page = 1;
        render();
    });

    [el.priceMin, el.priceMax].forEach(function (input) {
        input.addEventListener("input", function () {
            state.custom = {
                min: parseFloat(el.priceMin.value),
                max: parseFloat(el.priceMax.value)
            };
            state.band = null;
            state.page = 1;
            render();
        });
    });

    el.perPage.addEventListener("change", function () {
        state.perPage = parseInt(el.perPage.value, 10);
        state.page = 1;
        render();
    });

    el.clearAllBtn.addEventListener("click", clearAll);

    el.gridViewBtn.addEventListener("click", function () { setView("grid"); });
    el.listViewBtn.addEventListener("click", function () { setView("list"); });

    el.wishBtn.addEventListener("click", function () {
        var saved = Object.keys(wishlist).length;
        showToast(saved ? saved + " products saved to your wishlist" : "Your wishlist is empty");
    });

    el.addProductBtn.addEventListener("click", openModal);
    el.closeModalBtn.addEventListener("click", closeModal);
    el.cancelModalBtn.addEventListener("click", closeModal);
    el.modalBackdrop.addEventListener("click", function (event) {
        if (event.target === el.modalBackdrop) {
            closeModal();
        }
    });
    el.addProductForm.addEventListener("submit", submitProduct);

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            closeModal();
            closeAllMenus();
        }
    });

    // Dropdown menus in the top bar.
    document.querySelectorAll("[data-dropdown]").forEach(function (drop) {
        drop.querySelector("[data-dropdown-toggle]").addEventListener("click", function (event) {
            event.stopPropagation();
            var open = drop.classList.contains("is-open");
            closeAllMenus();
            drop.classList.toggle("is-open", !open);
        });
        drop.querySelectorAll(".menu-item").forEach(function (item) {
            item.addEventListener("click", function () {
                closeAllMenus();
                showToast(item.textContent.trim());
            });
        });
    });
    document.addEventListener("click", closeAllMenus);
}

function closeAllMenus() {
    document.querySelectorAll("[data-dropdown].is-open").forEach(function (drop) {
        drop.classList.remove("is-open");
    });
}

/* ---------------- data source ---------------- */

function loadProducts() {
    if (!CREATOR_SOURCE.report || typeof ZOHO === "undefined") {
        render();
        return;
    }
    ZOHO.CREATOR.DATA.getRecords({
        app_name: CREATOR_SOURCE.app_name,
        report_name: CREATOR_SOURCE.report,
        max_records: CREATOR_SOURCE.max_records,
        field_config: "all"
    }).then(function (response) {
        var rows = (response && response.data) || [];
        if (rows.length) {
            products = rows.map(fromCreatorRecord);
        }
        render();
    }).catch(function (err) {
        console.warn("Falling back to sample products:", err);
        render();
    });
}

/** Map a Creator record onto a catalog product. Adjust to your field names. */
function fromCreatorRecord(row) {
    return p(
        text(row.SKU_Code || row.Product_Code),
        text(row.Product_Name || row.Name),
        text(row.Category) || CATEGORIES[0],
        parseFloat(row.Price) || 0,
        parseInt(row.MOQ, 10) || 1,
        text(row.Branding_Type),
        text(row.Supplier),
        text(row.Badge)
    );
}

function text(value) {
    if (value == null) {
        return "";
    }
    if (typeof value === "object") {
        return String(value.display_value != null ? value.display_value : "");
    }
    return String(value);
}

/* ---------------- filtering ---------------- */

function matches(product) {
    var term = state.search.trim().toLowerCase();
    if (term) {
        var haystack = [product.name, product.sku, product.category, product.supplier, product.branding]
            .join(" ").toLowerCase();
        if (haystack.indexOf(term) === -1) {
            return false;
        }
    }
    if (state.categories.length && state.categories.indexOf(product.category) === -1) {
        return false;
    }
    if (state.band != null) {
        var band = PRICE_BANDS[state.band];
        if (product.price < band.min || product.price > band.max) {
            return false;
        }
    }
    if (state.custom) {
        var min = isNaN(state.custom.min) ? 0 : state.custom.min;
        var max = isNaN(state.custom.max) ? Infinity : state.custom.max;
        if (product.price < min || product.price > max) {
            return false;
        }
    }
    if (state.branding !== "All" && product.branding !== state.branding) {
        return false;
    }
    if (state.supplier !== "All" && product.supplier !== state.supplier) {
        return false;
    }
    if (state.moq !== "All") {
        var moqBand = MOQ_BANDS.filter(function (b) { return b.label === state.moq; })[0];
        if (moqBand && product.moq > moqBand.max) {
            return false;
        }
    }
    return true;
}

function countMatches() {
    return products.filter(matches).length;
}

/* ---------------- rendering ---------------- */

function render() {
    var found = products.filter(matches);

    var sort = SORTS.filter(function (s) { return s.label === state.sort; })[0];
    if (sort && sort.apply) {
        found.sort(sort.apply);
    }

    var pageCount = Math.max(1, Math.ceil(found.length / state.perPage));
    state.page = Math.min(state.page, pageCount);

    var start = (state.page - 1) * state.perPage;
    var slice = found.slice(start, start + state.perPage);

    el.grid.textContent = "";
    el.grid.className = "grid" + (state.view === "list" ? " list-view" : "");
    slice.forEach(function (product) {
        el.grid.appendChild(renderCard(product));
    });

    el.empty.hidden = found.length > 0;
    el.resultsText.textContent = found.length
        ? "Showing " + (start + 1) + "–" + (start + slice.length) + " of " + found.length + " products"
        : "No products found";
    el.pageSub.textContent = products.length + " products across " + CATEGORIES.length + " categories";

    syncChips();
    renderTokens();
    renderWishCount();
    renderPages(pageCount);
}

function setView(view) {
    state.view = view;
    el.gridViewBtn.classList.toggle("is-on", view === "grid");
    el.listViewBtn.classList.toggle("is-on", view === "list");
    render();
}

function renderWishCount() {
    var saved = Object.keys(wishlist).length;
    el.wishCount.textContent = String(saved);
    el.wishCount.hidden = saved === 0;
}

/** Removable tokens for every filter that is currently narrowing the list. */
function renderTokens() {
    el.activeTokens.textContent = "";
    var tokens = [];

    state.categories.forEach(function (name) {
        tokens.push({
            text: name, clear: function () {
                state.categories.splice(state.categories.indexOf(name), 1);
            }
        });
    });
    if (state.band != null) {
        tokens.push({
            text: "₹" + PRICE_BANDS[state.band].label, clear: function () { state.band = null; }
        });
    }
    if (state.custom) {
        var min = isNaN(state.custom.min) ? "0" : state.custom.min;
        var max = isNaN(state.custom.max) ? "any" : state.custom.max;
        tokens.push({
            text: "₹" + min + " – " + max, clear: function () {
                state.custom = null;
                el.priceMin.value = "";
                el.priceMax.value = "";
            }
        });
    }
    if (state.branding !== "All") {
        tokens.push({ text: state.branding, clear: function () { state.branding = "All"; } });
    }
    if (state.supplier !== "All") {
        tokens.push({ text: state.supplier, clear: function () { state.supplier = "All"; } });
    }
    if (state.moq !== MOQ_BANDS[0].label) {
        tokens.push({ text: state.moq, clear: function () { state.moq = MOQ_BANDS[0].label; } });
    }
    if (state.search.trim()) {
        tokens.push({
            text: '"' + state.search.trim() + '"', clear: function () {
                state.search = "";
                el.searchInput.value = "";
            }
        });
    }

    tokens.forEach(function (token) {
        var span = document.createElement("span");
        span.className = "token";
        span.appendChild(document.createTextNode(token.text));

        var close = document.createElement("button");
        close.type = "button";
        close.setAttribute("aria-label", "Remove " + token.text);
        close.textContent = "×";
        close.addEventListener("click", function () {
            token.clear();
            state.page = 1;
            render();
        });

        span.appendChild(close);
        el.activeTokens.appendChild(span);
    });

    el.activeRow.hidden = tokens.length === 0;
}

function syncChips() {
    Array.prototype.forEach.call(el.categoryChips.children, function (chip) {
        var name = chip.dataset.category;
        var on = name === "All"
            ? state.categories.length === 0
            : state.categories.indexOf(name) !== -1;
        chip.classList.toggle("is-on", on);
    });

    Array.prototype.forEach.call(el.priceChips.children, function (chip, index) {
        var custom = chip.dataset.label === "Custom";
        chip.classList.toggle("is-on", custom ? !!state.custom : index === state.band);
    });

    el.customPrice.hidden = !state.custom;
    el.brandingSelect.selectedIndex = state.branding === "All"
        ? 0 : BRANDING_TYPES.indexOf(state.branding) + 1;
    el.supplierSelect.selectedIndex = state.supplier === "All"
        ? 0 : SUPPLIERS.indexOf(state.supplier) + 1;
    el.moqSelect.value = state.moq;
    el.sortSelect.value = state.sort;
}

function renderCard(product) {
    var card = document.createElement("article");
    card.className = "card";

    var thumb = document.createElement("div");
    thumb.className = "thumb";
    var art = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    art.setAttribute("viewBox", "0 0 96 96");
    art.setAttribute("class", "art");
    art.setAttribute("role", "img");
    art.setAttribute("aria-label", product.name);
    art.innerHTML = artFor(product);
    thumb.appendChild(art);

    if (product.badge) {
        var badge = document.createElement("span");
        badge.className = "badge" + (product.badge === "New Arrival" ? " is-new" : "");
        badge.textContent = product.badge;
        thumb.appendChild(badge);
    }

    var quick = document.createElement("div");
    quick.className = "quick";

    var wish = quickButton(HEART, "Save " + product.name);
    wish.classList.toggle("is-on", !!wishlist[product.sku]);
    wish.addEventListener("click", function () {
        if (wishlist[product.sku]) {
            delete wishlist[product.sku];
        } else {
            wishlist[product.sku] = true;
        }
        wish.classList.toggle("is-on");
        renderWishCount();
        showToast(wishlist[product.sku]
            ? product.name + " saved to wishlist"
            : product.name + " removed from wishlist");
    });

    var cart = quickButton('<path d="M6 6h15l-1.6 9H7.5L6 6Z"/><path d="M6 6 5 3H2"/>' +
        '<circle cx="9" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/>', "Add " + product.name + " to order");
    cart.addEventListener("click", function () {
        showToast(product.moq + " Pcs of " + product.name + " added to your order");
    });

    quick.appendChild(wish);
    quick.appendChild(cart);
    thumb.appendChild(quick);

    var priceRow = document.createElement("div");
    priceRow.className = "price-row";
    priceRow.appendChild(node("p", "price", "₹" + product.price.toLocaleString("en-IN")));
    priceRow.appendChild(node("p", "moq", "MOQ " + product.moq + " Pcs"));

    var body = document.createElement("div");
    body.className = "card-body";
    body.appendChild(node("p", "sku", product.sku));
    body.appendChild(node("p", "name", product.name));
    body.appendChild(priceRow);
    body.appendChild(node("p", "card-extra", product.category + " · " + product.branding));
    body.appendChild(node("p", "card-extra", product.supplier));

    card.appendChild(thumb);
    card.appendChild(body);
    return card;
}

function quickButton(markup, label) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quick-btn";
    btn.setAttribute("aria-label", label);
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.innerHTML = markup;
    btn.appendChild(svg);
    return btn;
}

function node(tag, className, textContent) {
    var element = document.createElement(tag);
    element.className = className;
    element.textContent = textContent;
    return element;
}

function renderPages(pageCount) {
    el.pages.textContent = "";
    el.pages.appendChild(pageButton("‹", state.page - 1, state.page === 1, false));

    pageNumbers(state.page, pageCount).forEach(function (item) {
        if (item === "gap") {
            el.pages.appendChild(node("span", "page-gap", "..."));
        } else {
            el.pages.appendChild(pageButton(String(item), item, false, item === state.page));
        }
    });

    el.pages.appendChild(pageButton("›", state.page + 1, state.page === pageCount, false));
}

function pageButton(label, target, disabled, current) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "page-btn" + (current ? " is-current" : "");
    btn.textContent = label;
    btn.disabled = disabled;
    btn.addEventListener("click", function () {
        state.page = target;
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
    });
    return btn;
}

/** 1 2 3 4 5 ... 15 — always shows the first and last page. */
function pageNumbers(current, total) {
    if (total <= 7) {
        return range(1, total);
    }
    if (current <= 4) {
        return range(1, 5).concat(["gap", total]);
    }
    if (current >= total - 3) {
        return [1, "gap"].concat(range(total - 4, total));
    }
    return [1, "gap"].concat(range(current - 1, current + 1)).concat(["gap", total]);
}

function range(from, to) {
    var out = [];
    for (var i = from; i <= to; i++) {
        out.push(i);
    }
    return out;
}

/* ---------------- filter sync ---------------- */

function toggleBand(index) {
    state.band = state.band === index ? null : index;
    state.custom = null;
    el.priceMin.value = "";
    el.priceMax.value = "";
    state.page = 1;
    render();
}

function toggleCustom() {
    state.custom = state.custom ? null : { min: NaN, max: NaN };
    state.band = null;
    if (!state.custom) {
        el.priceMin.value = "";
        el.priceMax.value = "";
    }
    state.page = 1;
    render();
    if (state.custom) {
        el.priceMin.focus();
    }
}

function clearAll() {
    state.search = "";
    state.categories = [];
    state.band = null;
    state.custom = null;
    state.branding = "All";
    state.supplier = "All";
    state.moq = MOQ_BANDS[0].label;
    state.page = 1;

    el.searchInput.value = "";
    el.priceMin.value = "";
    el.priceMax.value = "";

    render();
    showToast("Filters cleared");
}

/* ---------------- add product ---------------- */

function openModal() {
    el.formError.hidden = true;
    el.addProductForm.reset();
    el.fMoq.value = "50";
    el.modalBackdrop.hidden = false;
    el.fName.focus();
}

function closeModal() {
    el.modalBackdrop.hidden = true;
}

function submitProduct(event) {
    event.preventDefault();

    var sku = el.fSku.value.trim().toUpperCase();
    var name = el.fName.value.trim();
    var price = parseFloat(el.fPrice.value);
    var moq = parseInt(el.fMoq.value, 10);

    if (!name || !sku) {
        return showFormError("Product name and SKU code are both required.");
    }
    if (products.some(function (item) { return item.sku === sku; })) {
        return showFormError("SKU " + sku + " already exists in the catalog.");
    }
    if (isNaN(price) || price < 0) {
        return showFormError("Enter a valid price.");
    }
    if (isNaN(moq) || moq < 1) {
        return showFormError("MOQ must be at least 1.");
    }

    products.unshift(p(sku, name, el.fCategory.value, price, moq,
        el.fBranding.value, el.fSupplier.value, el.fBadge.value));

    closeModal();
    state.page = 1;
    render();
    showToast(name + " added to the catalog");
}

function showFormError(message) {
    el.formError.textContent = message;
    el.formError.hidden = false;
}

/* ---------------- toast ---------------- */

function showToast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
        el.toast.hidden = true;
    }, 2200);
}
