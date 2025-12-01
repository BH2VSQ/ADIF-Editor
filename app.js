let adifRecords = [];
let qrzSession = null;

// ----------- ADIF PARSER (simple) -----------
function parseADIF(text) {
    const records = [];
    const parts = text.split("<eor>");

    for (let part of parts) {
        const record = {};
        const fields = part.match(/<([^:]+):(\d+)[^>]*>([^<]+)/gi);

        if (!fields) continue;

        for (let f of fields) {
            const m = f.match(/<([^:]+):(\d+)[^>]*>([^<]+)/i);
            if (m) {
                record[m[1].toLowerCase()] = m[3];
            }
        }

        if (Object.keys(record).length > 0) {
            records.push(record);
        }
    }

    return records;
}

// ----------- QRZ LOGIN -----------
async function qrzLogin(username, password) {
    const url = `https://xmldata.qrz.com/xml/current/?username=${username};password=${password}`;
    const resp = await fetch(url);
    const text = await resp.text();

    const session = text.match(/<Key>(.*?)<\/Key>/);
    if (session) return session[1];
    throw new Error("QRZ 登录失败");
}

// ----------- QRZ LOOKUP -----------
async function qrzLookup(sessionKey, callsign) {
    const url = `https://xmldata.qrz.com/xml/current/?s=${sessionKey};callsign=${callsign}`;
    const resp = await fetch(url);
    const xml = await resp.text();

    if (xml.includes("<Error>")) return false;
    if (xml.includes("<call>")) return true;

    return false;
}

// ----------- QRZ 自动校验 -----------
async function verifyRecords() {
    if (!qrzSession) return;

    for (let rec of adifRecords) {
        if (!rec.call) continue;
        const ok = await qrzLookup(qrzSession, rec.call);
        rec.__valid = ok;
        renderTable();
    }
}

// ----------- 渲染表格 -----------
function renderTable() {
    const tbody = document.getElementById("logTableBody");
    tbody.innerHTML = "";

    for (let r of adifRecords) {
        const tr = document.createElement("tr");

        if (r.__valid === true) tr.classList.add("green");
        if (r.__valid === false) tr.classList.add("red");

        tr.innerHTML = `
            <td>${r.call || ""}</td>
            <td>${r.band || ""}</td>
            <td>${r.mode || ""}</td>
            <td>${r.qso_date || ""}</td>
            <td>${r.time_on || ""}</td>
            <td>${JSON.stringify(r)}</td>
        `;
        tbody.appendChild(tr);
    }
}

// ----------- 文件导入 -----------
document.getElementById("adifFile").addEventListener("change", function () {
    const file = this.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        adifRecords = parseADIF(e.target.result);
        renderTable();
        verifyRecords();  // 自动开始 QRZ 校验
    };
    reader.readAsText(file);
});

// ----------- QRZ 登录按钮 -----------
document.getElementById("loginQRZ").addEventListener("click", async () => {
    const user = document.getElementById("qrzUser").value.trim();
    const pass = document.getElementById("qrzPass").value.trim();
    const status = document.getElementById("qrzStatus");

    status.textContent = "登录中…";

    try {
        qrzSession = await qrzLogin(user, pass);
        status.textContent = "登录成功";
        status.style.color = "green";

        if (adifRecords.length > 0) verifyRecords();

    } catch (err) {
        status.textContent = "登录失败";
        status.style.color = "red";
    }
});
