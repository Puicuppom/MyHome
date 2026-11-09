// ผ่อนบ้าน: เทียบ ผ่อนปกติ vs โปะ + กราฟ + บันทึก Supabase (loan_profiles)
(function () {
  const OLD_KEY = "homeLoanCalculatorData_v4";
  const DEFAULTS = { loanAmount: 3000000, monthlyPayment: 15300, extraPayment: 2500, startMonth: "", birthDate: "1991-12-04",
                     tiers: [{ from: 1, to: "", rate: 6.5 }], lumps: [] };
  let user = null, chart = null, last = null, chartMode = "bal", tableMode = "year", saveTimer = null, loaded = false;

  const num = v => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
  const withCommas = v => { const s = String(v ?? "").replace(/[^0-9]/g, ""); return s ? parseInt(s, 10).toLocaleString("en-US") : ""; };
  const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
  const addMonths = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return d; };
  const monthLabel = d => `${TH_M[d.getMonth()]} ${be(d.getFullYear())}`;
  const dur = n => { const y = Math.floor(n / 12), m = n % 12; return (y ? `${y} ปี ` : "") + (m ? `${m} เดือน` : (y ? "" : "0 เดือน")); };

  // ---------- form <-> state ----------
  function tierRow(t, first) {
    const el = document.createElement("div"); el.className = "tier";
    el.innerHTML = `<div><label class="lbl">ตั้งแต่เดือนที่</label><input type="number" class="tf num" min="1" value="${esc(t.from)}" ${first ? "readonly" : ""}></div>
      <div><label class="lbl">ถึงเดือนที่</label><input type="number" class="tt num" min="1" placeholder="ตลอดไป" value="${esc(t.to)}"></div>
      <div class="rate-wrap"><label class="lbl">ดอกเบี้ย (%/ปี)</label><input type="number" class="tr num" step="0.01" min="0" value="${esc(t.rate)}"></div>
      <button type="button" class="x" aria-label="ลบช่วงนี้" ${first ? "hidden" : ""}>×</button>`;
    return el;
  }
  function lumpRow(l) {
    const el = document.createElement("div"); el.className = "lump";
    el.innerHTML = `<div><label class="lbl">งวดที่</label><input type="number" class="lm num" min="1" value="${esc(l.month)}"></div>
      <div><label class="lbl">จำนวนเงินโปะ (บาท)</label><input type="text" inputmode="numeric" class="la money num" value="${esc(withCommas(l.amount))}"></div>
      <button type="button" class="x" aria-label="ลบรายการนี้">×</button>`;
    return el;
  }
  function fill(d) {
    $("loanAmount").value = withCommas(d.loanAmount);
    $("monthlyPayment").value = withCommas(d.monthlyPayment);
    $("extraPayment").value = withCommas(d.extraPayment);
    $("startMonth").value = d.startMonth || thisMonth();
    $("birthDate").value = d.birthDate || "";
    $("tiers").innerHTML = ""; (d.tiers && d.tiers.length ? d.tiers : DEFAULTS.tiers).forEach((t, i) => $("tiers").appendChild(tierRow(t, i === 0)));
    $("lumps").innerHTML = ""; (d.lumps || []).forEach(l => $("lumps").appendChild(lumpRow(l)));
  }
  function read() {
    return {
      loanAmount: num($("loanAmount").value), monthlyPayment: num($("monthlyPayment").value), extraPayment: num($("extraPayment").value),
      startMonth: $("startMonth").value || thisMonth(), birthDate: $("birthDate").value,
      tiers: [...$("tiers").querySelectorAll(".tier")].map(r => ({ from: r.querySelector(".tf").value, to: r.querySelector(".tt").value, rate: r.querySelector(".tr").value })),
      lumps: [...$("lumps").querySelectorAll(".lump")].map(r => ({ month: r.querySelector(".lm").value, amount: num(r.querySelector(".la").value) })).filter(l => l.month || l.amount)
    };
  }

  // ---------- calc ----------
  function simulate(d, withExtra) {
    const tiers = d.tiers.map(t => ({ from: parseInt(t.from, 10), to: t.to === "" || t.to == null ? Infinity : parseInt(t.to, 10), rate: parseFloat(t.rate) }))
      .filter(t => !isNaN(t.from) && !isNaN(t.rate));
    const lumps = {};
    if (withExtra) d.lumps.forEach(l => { const m = parseInt(l.month, 10); if (m > 0 && l.amount > 0) lumps[m] = (lumps[m] || 0) + l.amount; });
    const pay = d.monthlyPayment + (withExtra ? d.extraPayment : 0);
    let bal = d.loanAmount, n = 0, totalInt = 0, totalPaid = 0; const rows = [];
    while (bal > 0.005) {
      n++;
      if (n > 1200) return { error: "ผ่อนเกิน 100 ปี ตรวจค่างวดและดอกเบี้ย" };
      const tier = tiers.find(t => n >= t.from && n <= t.to);
      if (!tier) return { error: `ไม่มีอัตราดอกเบี้ยของเดือนที่ ${n} เพิ่มช่วงดอกเบี้ยให้ต่อเนื่อง` };
      const interest = bal * tier.rate / 100 / 12;
      if (pay <= interest && !lumps[n]) return { error: `ค่างวด ${fmt0(pay)} บาท ไม่พอจ่ายดอกเบี้ยเดือนที่ ${n} (${fmt0(interest)} บาท) จะผ่อนไม่หมด` };
      let payment = Math.min(pay, bal + interest);
      let principal = payment - interest;
      bal -= principal;
      let lump = 0;
      if (lumps[n] && bal > 0) { lump = Math.min(lumps[n], bal); bal -= lump; }
      if (bal < 0.005) bal = 0;
      totalInt += interest; totalPaid += payment + lump;
      rows.push({ n, date: addMonths(d.startMonth, n - 1), payment, interest, principal, lump, bal, rate: tier.rate, cumInt: totalInt });
    }
    return { rows, months: n, totalInt, totalPaid, end: rows.length ? rows[rows.length - 1].date : addMonths(d.startMonth, 0) };
  }
  function ageAt(birth, date) {
    if (!birth) return "";
    const b = new Date(birth); let y = date.getFullYear() - b.getFullYear(), m = date.getMonth() - b.getMonth();
    if (m < 0) { y--; m += 12; }
    return `${y} ปี ${m} เดือน`;
  }

  // ---------- render ----------
  function kv(s, birth) {
    return `<dt>ระยะเวลา</dt><dd>${dur(s.months)}</dd>
      <dt>จำนวนงวด</dt><dd>${fmt0(s.months)} งวด</dd>
      <dt>ผ่อนหมดเดือน</dt><dd>${monthLabel(s.end)}</dd>
      ${birth ? `<dt>อายุตอนผ่อนหมด</dt><dd>${ageAt(birth, s.end)}</dd>` : ""}
      <dt>ดอกเบี้ยรวม</dt><dd>${fmt(s.totalInt)}</dd>
      <dt>จ่ายทั้งหมด</dt><dd>${fmt(s.totalPaid)}</dd>`;
  }
  function calculate() {
    const d = read(); $("loanErr").textContent = "";
    if (d.loanAmount <= 0 || d.monthlyPayment <= 0) { $("loanResult").hidden = true; $("loanErr").textContent = "กรอกยอดเงินกู้และค่างวดให้มากกว่า 0"; return; }
    const base = simulate(d, false), plan = simulate(d, true);
    if (plan.error) { $("loanResult").hidden = true; $("loanErr").textContent = plan.error; return; }
    $("loanResult").hidden = false;
    $("scnPlan").innerHTML = kv(plan, d.birthDate);
    if (base.error) {
      $("scnBase").innerHTML = `<dt>ผล</dt><dd style="color:var(--bad);white-space:normal;text-align:right">${esc(base.error)}</dd>`;
      $("savings").innerHTML = `<div class="save"><div class="small">ถ้าไม่โปะ</div><div class="big" style="color:var(--bad)">ผ่อนไม่หมด</div><div class="small muted">ค่างวดปกติไม่พอจ่ายดอกเบี้ย</div></div>`;
    } else {
      $("scnBase").innerHTML = kv(base, d.birthDate);
      const sm = base.months - plan.months, si = base.totalInt - plan.totalInt;
      const extraTotal = plan.rows.reduce((a, r) => a + r.lump, 0) + d.extraPayment * plan.months;
      $("savings").innerHTML = `
        <div class="save"><div class="small">ประหยัดดอกเบี้ย</div><div class="big">${fmt0(si)} ฿</div><div class="small muted">${base.totalInt ? ((si / base.totalInt) * 100).toFixed(1) : 0}% ของดอกเบี้ยทั้งหมด</div></div>
        <div class="save"><div class="small">ผ่อนหมดเร็วขึ้น</div><div class="big">${dur(sm)}</div><div class="small muted">${monthLabel(base.end)} → ${monthLabel(plan.end)}</div></div>
        <div class="save"><div class="small">ทุกเงินโปะ 1 บาท</div><div class="big">${extraTotal > 0 ? (si / extraTotal).toFixed(2) : "0.00"} ฿</div><div class="small muted">ดอกเบี้ยที่ประหยัดได้ต่อเงินโปะ</div></div>`;
    }
    last = { base: base.error ? null : base, plan };
    drawChart(); drawTable();
  }

  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function drawChart() {
    if (!last || typeof Chart === "undefined") return;
    const { base, plan } = last;
    const len = Math.max(plan.months, base ? base.months : 0);
    const step = len > 240 ? 3 : 1;   // ลดจุดเมื่อยาวมาก
    const labels = [], b = [], p = [];
    const key = chartMode === "bal" ? "bal" : "cumInt";
    for (let i = 0; i < len; i += step) {
      labels.push(i + 1);
      b.push(base ? (base.rows[i] ? base.rows[i][key] : (key === "bal" ? 0 : base.totalInt)) : null);
      p.push(plan.rows[i] ? plan.rows[i][key] : (key === "bal" ? 0 : plan.totalInt));
    }
    const ink = css("--muted"), grid = css("--line");
    const data = { labels, datasets: [
      { label: "ผ่อนปกติ", data: b, borderColor: css("--base-line"), borderWidth: 2, pointRadius: 0, tension: .1 },
      { label: "ผ่อน + โปะ", data: p, borderColor: css("--primary"), backgroundColor: css("--primary-soft"), fill: true, borderWidth: 2.5, pointRadius: 0, tension: .1 }
    ]};
    const opts = { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, animation: false,
      plugins: { legend: { labels: { color: ink, font: { family: "Sarabun" } } },
        tooltip: { callbacks: { title: it => { const n = Number(it[0].label); return `งวดที่ ${n} · ${monthLabel(addMonths(read().startMonth, n - 1))}`; },
                                label: c => `${c.dataset.label}: ${fmt0(c.parsed.y)} บาท` } } },
      scales: { x: { ticks: { color: ink, maxTicksLimit: 10, callback: (v, i) => { const n = labels[i]; return n % 12 === 1 || step > 1 ? `ปีที่ ${Math.ceil(n / 12)}` : ""; } }, grid: { display: false } },
                y: { ticks: { color: ink, callback: v => v >= 1e6 ? (v / 1e6).toFixed(1) + " ล้าน" : fmt0(v / 1000) + "k" }, grid: { color: grid } } } };
    if (chart) chart.destroy();
    chart = new Chart($("loanChart"), { type: "line", data, options: opts });
  }
  function drawTable() {
    if (!last) return;
    const rows = last.plan.rows;
    let h = "";
    if (tableMode === "year") {
      h = `<thead><tr><th class="l">ปี พ.ศ.</th><th class="l">ช่วงเดือน</th><th>จ่ายรวม</th><th>ดอกเบี้ย</th><th>ตัดเงินต้น</th><th>โปะก้อน</th><th>คงเหลือ ณ สิ้นงวด</th></tr></thead><tbody>`;
      // แบ่งตามปีปฏิทิน (ม.ค.–ธ.ค.) ให้ตรงกับปีภาษี
      const groups = [];
      rows.forEach(r => { const y = r.date.getFullYear(); if (!groups.length || groups[groups.length - 1].y !== y) groups.push({ y, rows: [] }); groups[groups.length - 1].rows.push(r); });
      groups.forEach(({ y, rows: ch }) => {
        const s = k => ch.reduce((a, r) => a + r[k], 0);
        h += `<tr><td class="l">${be(y)}</td><td class="l">${monthLabel(ch[0].date)} – ${monthLabel(ch[ch.length - 1].date)} <span class="muted small">(${ch.length} งวด)</span></td>
          <td class="num">${fmt(s("payment") + s("lump"))}</td><td class="num">${fmt(s("interest"))}</td><td class="num">${fmt(s("principal") + s("lump"))}</td>
          <td class="num">${s("lump") ? fmt(s("lump")) : "–"}</td><td class="num">${fmt(ch[ch.length - 1].bal)}</td></tr>`;
      });
    } else {
      h = `<thead><tr><th class="l">งวด</th><th class="l">เดือน</th><th>ค่างวด</th><th>ดอกเบี้ย</th><th>ตัดเงินต้น</th><th>โปะก้อน</th><th>คงเหลือ</th><th>ดอกเบี้ย %</th></tr></thead><tbody>`;
      rows.forEach(r => {
        h += `<tr class="${r.lump ? "lumprow" : ""}"><td class="l">${r.n}</td><td class="l">${monthLabel(r.date)}</td><td class="num">${fmt(r.payment)}</td><td class="num">${fmt(r.interest)}</td>
          <td class="num">${fmt(r.principal)}</td><td class="num">${r.lump ? fmt(r.lump) : "–"}</td><td class="num">${fmt(r.bal)}</td><td class="num">${r.rate.toFixed(2)}</td></tr>`;
      });
    }
    $("schedule").innerHTML = h + "</tbody>";
  }

  // ---------- save ----------
  function scheduleSave() {
    if (!loaded) return;
    clearTimeout(saveTimer);
    $("loanSaveState").textContent = "กำลังบันทึก…";
    saveTimer = setTimeout(async () => {
      const { error } = await db.from("loan_profiles").upsert({ user_id: user.id, data: read(), updated_at: new Date().toISOString() });
      $("loanSaveState").textContent = error ? "บันทึกไม่สำเร็จ: " + dbErr(error) : "บันทึกแล้ว";
    }, 800);
  }
  let calcTimer = null;
  function changed() { clearTimeout(calcTimer); calcTimer = setTimeout(calculate, 250); scheduleSave(); }

  // ---------- events ----------
  document.addEventListener("input", e => {
    if (e.target.classList.contains("money")) {
      const i = e.target, before = i.value, pos = i.selectionStart; i.value = withCommas(before);
      const np = Math.max(0, pos + (i.value.length - before.length)); i.setSelectionRange(np, np);
    }
    if (e.target.closest("#loanView")) changed();
  });
  $("addTier").addEventListener("click", () => {
    const rows = $("tiers").querySelectorAll(".tier"), last = rows[rows.length - 1];
    const to = last ? parseInt(last.querySelector(".tt").value, 10) : NaN;
    if (last && isNaN(to)) { $("loanErr").textContent = 'ใส่ "ถึงเดือนที่" ของช่วงก่อนหน้าก่อน'; last.querySelector(".tt").focus(); return; }
    $("tiers").appendChild(tierRow({ from: last ? to + 1 : 1, to: "", rate: "" }, !last));
    $("tiers").lastElementChild.querySelector(".tr").focus(); changed();
  });
  $("addLump").addEventListener("click", () => { $("lumps").appendChild(lumpRow({ month: 12, amount: "" })); $("lumps").lastElementChild.querySelector(".la").focus(); changed(); });
  $("loanView").addEventListener("click", e => { const x = e.target.closest(".x"); if (x) { x.parentElement.remove(); changed(); } });
  const seg = (a, b, fn) => { a.addEventListener("click", () => { a.setAttribute("aria-pressed", "true"); b.setAttribute("aria-pressed", "false"); fn(); }); };
  seg($("chBal"), $("chInt"), () => { chartMode = "bal"; drawChart(); });
  seg($("chInt"), $("chBal"), () => { chartMode = "int"; drawChart(); });
  seg($("tblYear"), $("tblMonth"), () => { tableMode = "year"; drawTable(); });
  seg($("tblMonth"), $("tblYear"), () => { tableMode = "month"; drawTable(); });

  // ---------- init ----------
  async function init(u) {
    user = u; loaded = false;
    $("loanSaveState").textContent = "กำลังโหลด…";
    const { data, error } = await db.from("loan_profiles").select("data").eq("user_id", u.id).maybeSingle();
    let d = null;
    if (error) { $("loanSaveState").textContent = ""; banner("โหลดข้อมูลผ่อนบ้านไม่ได้: " + dbErr(error) + " (รัน supabase/schema.sql แล้วหรือยัง?)"); }
    else if (data && data.data) d = data.data;
    let migrated = false;
    if (!d) {   // ย้ายข้อมูลเก่าจากเครื่อง (เวอร์ชันก่อน)
      try {
        const o = JSON.parse(localStorage.getItem(OLD_KEY) || "null");
        if (o) { d = { loanAmount: num(o.loanAmount), monthlyPayment: num(o.monthlyPayment), extraPayment: num(o.extraPayment), birthDate: o.birthDate,
                       tiers: (o.interestTiers || []).map(t => ({ from: t.from, to: t.to, rate: t.rate })), lumps: [] }; migrated = true; }
      } catch (e) {}
    }
    fill(Object.assign({}, DEFAULTS, d || {}));
    loaded = !error;
    if (!error) $("loanSaveState").textContent = data ? "บันทึกแล้ว" : "";
    calculate();
    if (migrated && loaded) scheduleSave();
  }
  App.modules.loan = { init, show: () => chart && chart.resize() };
})();
