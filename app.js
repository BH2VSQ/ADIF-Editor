let adifRecords = [];
let filteredRecords = [];
let qrzSession = null;
let sortField = null;
let sortAsc = true;

/* =======================
   ADIF PARSER
======================= */
function parseADIF(text) {
    const records = [];
    const parts = text.split(/<eor>/i);

    for (let part of parts) {
        const record = {};
        const fields = part.match(/<([^:]+):(\d+)[^>]*>([^<]+)/gi);
        if (!fields) continue;

        for (let f of fields) {
            const m = f.match(/<([^:]+):(\d+)[^>]*>([^<]+)/i);
            if (m) record[m[1].toLowerCase()] = m[3];
        }
        records.push(record);
    }
    return records;
}

/* =======================
   QRZ LOGIN
======================= */
async function qrzLogin(username, password) {
    const url = `https://xmldata.qrz.com/xml/current/?username=${username};password=${password}`;
    const r = await fetch(url);
    const t = await r.text();

    const session = t.match(/<Key>(.*?)<\/Key>/);
    if (session) return session[1];
    throw new Error("QRZ 登录失败");
}

/* =======================
   QRZ LOOKUP
======================= */
async function qrzLookup(sessionKey, callsign) {
    const url = `https://xmldata.qrz.com/xml/current/?s=${sessionKey};callsign=${callsign}`;
    const r = await fetch(url);
    const xml = await r.text();

    if (xml.includes("<Error>")) return false;
    if (xml.includes("<call>")) return true;
    return false;
}

/* =======================
   QRZ 验证所有记录
======================= */
async function verifyRecords() {
    if (!qrzSession) return;

    for (let r of adifRecords) {
        if (!r.call) continue;
        const ok = await qrzLookup(qrzSession, r.call);
        r.__valid = ok;
        renderTable();
    }
}

/* =======================
  搜索和过滤
======================= */
function applyFilters() {
    const keyword = document.getElementById("searchBox").value.toLowerCase();
    const band = document.getElementById("bandFilter").value;
    const mode = document.getElementById("modeFilter").value;

    filteredRecords = adifRecords.filter(r => {
        let ok = true;

        if (keyword) {
            ok =
                (r.call || "").toLowerCase().includes(keyword) ||
                (r.band || "").toLowerCase().includes(keyword) ||
                (r.mode || "").toLowerCase().includes(keyword) ||
                (r.qso_date || "").toLowerCase().includes(keyword);
        }

        if (band && r.band !== band) ok = false;
        if (mode && r.mode !== mode) ok = false;

        return ok;
    });

    renderTable();
}

/* =======================
   排序
======================= */
function sortBy(field) {
    if (sortField === field) sortAsc = !sortAsc;
    else {
        sortField = field;
        sortAsc = true;
    }

    filteredRecords.sort((a, b) => {
        const A = a[field] || "";
        const B = b[field] || "";
        return sortAsc ? A.localeCompare(B) : B.localeCompare(A);
    });

    renderTable();
}

/* =======================
   表格渲染（含编辑）
======================= */
function renderTable() {
    filteredRecords = filteredRecords.length ? filteredRecords : adifRecords;

    const tbody = document.getElementById("logTableBody");
    tbody.innerHTML = "";

    for (let r of filteredRecords) {
        const tr = document.createElement("tr");

        if (r.__valid === true) tr.classList.add("green");
        if (r.__valid === false) tr.classList.add("red");

        ["call", "band", "mode", "qso_date", "time_on"].forEach(field => {
            const td = document.createElement("td");
            td.textContent = r[field] || "";

            // 双击编辑
            td.addEventListener("dblclick", () => editCell(td, r, field));

            tr.appendChild(td);
        });

        const raw = document.createElement("td");
        raw.textContent = JSON.stringify(r);
        tr.appendChild(raw);

        tbody.appendChild(tr);
    }
}

/* =======================
   编辑单元格
======================= */
function editCell(td, record, field) {
    td.classList.add("editing");
    const oldValue = td.textContent;

    const input = document.createElement("input");
    input.value = oldValue;

    td.innerHTML = "";
    td.appendChild(input);
    input.focus();

    input.addEventListener("blur", () => {
        td.classList.remove("editing");
        record[field] = input.value.trim();
        td.textContent = input.value.trim();
    });
}

/* =======================
   生成 ADIF 导出
======================= */
function exportADIF() {
    let out = "";

    for (let r of adifRecords) {
        for (let k in r) {
            if (k.startsWith("__")) continue;
            const v = r[k];
            out += `<${k}:${v.length}>${v}`;
        }
        out += "<EOR>\n";
    }

    const blob = new Blob([out], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "export.adi";
    a.click();
}

/* =======================
   事件绑定
======================= */

document.getElementById("adifFile").addEventListener("change", function () {
    const file = this.files[0];
    const reader = new FileReader();

    reader.onload = e => {
        adifRecords = parseADIF(e.target.result);

        // 填充 band/mode 过滤器
        const bands = [...new Set(adifRecords.map(r => r.band).filter(Boolean))];
        const modes = [...new Set(adifRecords.map(r => r.mode).filter(Boolean))];

        bands.forEach(b => {
            const opt = document.createElement("option");
            opt.value = b;
            opt.textContent = b;
            bandFilter.appendChild(opt);
        });

        modes.forEach(m => {
            const opt = document.createElement("option");
            opt.value = m;
            opt.textContent = m;
            modeFilter.appendChild(opt);
        });

        filteredRecords = [...adifRecords];
        renderTable();
        verifyRecords();
    };

    reader.readAsText(file);
});

document.getElementById("loginQRZ").addEventListener("click", async () => {
    const user = qrzUser.value.trim();
    const pass = qrzPass.value.trim();

    qrzStatus.textContent = "登录中…";

    try {
        qrzSession = await qrzLogin(user, pass);
        qrzStatus.textContent = "成功";
        qrzStatus.style.color = "green";
        verifyRecords();
    } catch {
        qrzStatus.textContent = "失败";
        qrzStatus.style.color = "red";
    }
});

searchBox.addEventListener("input", applyFilters);
bandFilter.addEventListener("change", applyFilters);
modeFilter.addEventListener("change", applyFilters);

document.querySelectorAll("th[data-field]").forEach(th => {
    th.addEventListener("click", () => sortBy(th.dataset.field));
});

document.getElementById("exportAdif").addEventListener("click", exportADIF);
