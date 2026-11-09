// สมุดค่าเช่า: rent_entries + rent_settings บน Supabase
(function () {
  let user = null, entries = [], settings = {}, editingId = null, confirmId = null, monthTouched = false;
  const nextYM = (ym, n = 1) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
  const shiftDate = (iso, n = 1) => { const [y, m, d] = iso.split("-").map(Number); const last = new Date(y, m + n, 0).getDate(); const t = new Date(y, m - 1 + n, Math.min(d, last)); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`; };
  const today = new Date();
  let year = today.getFullYear();
  const SDEF = { method: "flat", actual_h1: 0, actual_y: 0, ded94: 30000, ded90: 60000, paid94: null, salary: 0, salary_wht: 0 };
  const S = () => Object.assign({}, SDEF, settings[year] || {});
  const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

  // ---------- tax ----------
  function progressive(net) {
    const br = [[150000,0],[300000,.05],[500000,.10],[750000,.15],[1000000,.20],[2000000,.25],[5000000,.30],[Infinity,.35]];
    let tax = 0, prev = 0;
    for (const [cap, r] of br) { if (net <= prev) break; tax += (Math.min(net, cap) - prev) * r; prev = cap; }
    return tax;
  }
  function calc(gross, expense, allowance) {
    const net = Math.max(0, gross - expense - allowance);
    let tax = progressive(net), method = "อัตราก้าวหน้า";
    if (gross >= 120000) { const m = gross * 0.005; if (m > 5000 && m > tax) { tax = m; method = "0.5% ของเงินได้"; } }
    return { net, tax, method };
  }

  // ---------- render ----------
  const yearEntries = () => entries.filter(e => Number(e.received_date.slice(0, 4)) === year);
  const half = e => Number(e.received_date.slice(5, 7)) <= 6 ? 1 : 2;
  function chip(deadline, label) {
    const d = Math.ceil((deadline - today) / 864e5);
    if (d < 0) return `<span class="chip past">พ้นกำหนดแล้ว</span>`;
    if (d <= 45) return `<span class="chip soon">อีก ${d} วัน</span>`;
    return `<span class="chip open">${label}</span>`;
  }
  function renderYears() {
    const ys = new Set([today.getFullYear(), year]); entries.forEach(e => ys.add(Number(e.received_date.slice(0, 4))));
    $("rYear").innerHTML = [...ys].sort((a, b) => b - a).map(y => `<option value="${y}" ${y === year ? "selected" : ""}>${be(y)}</option>`).join("");
  }
  function renderCards() {
    const s = S(), ye = yearEntries(), h1 = ye.filter(e => half(e) === 1);
    const sum = (a, k) => a.reduce((t, e) => t + (Number(e[k]) || 0), 0);
    const g1 = sum(h1, "amount"), w1 = sum(h1, "wht"), gY = sum(ye, "amount"), wY = sum(ye, "wht");
    const flat = s.method !== "actual";
    const e1 = flat ? g1 * 0.3 : Number(s.actual_h1) || 0, eY = flat ? gY * 0.3 : Number(s.actual_y) || 0;
    const c1 = calc(g1, e1, Number(s.ded94) || 0), cY0 = calc(gY, eY, Number(s.ded90) || 0);
    // ภ.ง.ด.90 รวมเงินเดือน (40(1)): หักค่าใช้จ่าย 50% ไม่เกิน 100,000
    const sal = Number(s.salary) || 0, salWht = Number(s.salary_wht) || 0, salExp = Math.min(sal * 0.5, 100000);
    const cY = sal ? (() => {
      const net = Math.max(0, sal - salExp + gY - eY - (Number(s.ded90) || 0));
      let tax = progressive(net), method = "อัตราก้าวหน้า";
      if (gY >= 120000) { const m = gY * 0.005; if (m > 5000 && m > tax) { tax = m; method = "0.5% ของเงินได้"; } }
      return { net, tax, method };
    })() : cY0;
    const salOnlyTax = sal ? progressive(Math.max(0, sal - salExp - (Number(s.ded90) || 0))) : 0;
    const rentTaxY = cY.tax - salOnlyTax;
    const due1 = Math.max(0, c1.tax - w1);
    const paid94 = s.paid94 === null || s.paid94 === "" || s.paid94 === undefined ? due1 : Number(s.paid94);
    const dueY = cY.tax - wY - salWht - paid94, B = be(year);
    $("card94").innerHTML = `
      <div class="spread"><div><div class="code">ภ.ง.ด.94</div><div class="small muted">เงินได้ ม.ค.–มิ.ย. ${B} · ยื่น 1 ก.ค.–30 ก.ย. ${B}</div></div>${chip(new Date(year, 8, 30, 23, 59), "ยังไม่ถึงกำหนด")}</div>
      <dl class="kv">
        <dt>ค่าเช่าที่ได้รับ (${h1.length} รายการ)</dt><dd>${fmt(g1)}</dd>
        <dt>หักค่าใช้จ่าย${flat ? "เหมา 30%" : "ตามจริง"}</dt><dd>−${fmt(e1)}</dd>
        <dt>หักลดหย่อน</dt><dd>−${fmt(s.ded94)}</dd><div class="sep"></div>
        <dt>เงินได้สุทธิ</dt><dd>${fmt(c1.net)}</dd>
        <dt>ภาษี (${c1.method})</dt><dd>${fmt(c1.tax)}</dd>
        <dt>หัก ณ ที่จ่ายแล้ว</dt><dd>−${fmt(w1)}</dd>
        <dt class="total">ต้องชำระโดยประมาณ</dt><dd class="total">${fmt(due1)}</dd>
      </dl>
      <p class="small muted" style="margin:0">${g1 > 60000 ? "เงินได้ครึ่งปีเกิน 60,000 บาท ต้องยื่น ภ.ง.ด.94 (คนโสด)" : "เงินได้ครึ่งปียังไม่เกิน 60,000 บาท คนโสดไม่ต้องยื่น ภ.ง.ด.94"}${due1 >= 3000 ? " · ภาษีตั้งแต่ 3,000 บาท ผ่อนชำระได้ 3 งวด" : ""}</p>`;
    $("card90").innerHTML = `
      <div class="spread"><div><div class="code">ภ.ง.ด.90</div><div class="small muted">เงินได้ทั้งปี ${B} · ยื่นภายใน 31 มี.ค. ${B + 1}</div></div>${chip(new Date(year + 1, 2, 31, 23, 59), "รอสิ้นปี")}</div>
      <dl class="kv">
        ${sal ? `<dt>เงินเดือนทั้งปี</dt><dd>${fmt(sal)}</dd><dt>หักค่าใช้จ่ายเงินเดือน 50% (ไม่เกิน 1 แสน)</dt><dd>−${fmt(salExp)}</dd>` : ""}
        <dt>ค่าเช่าทั้งปี (${ye.length} รายการ)</dt><dd>${fmt(gY)}</dd>
        <dt>หักค่าใช้จ่ายค่าเช่า${flat ? "เหมา 30%" : "ตามจริง"}</dt><dd>−${fmt(eY)}</dd>
        <dt>หักลดหย่อน</dt><dd>−${fmt(s.ded90)}</dd><div class="sep"></div>
        <dt>เงินได้สุทธิ</dt><dd>${fmt(cY.net)}</dd>
        <dt>ภาษี (${cY.method})</dt><dd>${fmt(cY.tax)}</dd>
        ${sal ? `<dt>นายจ้างหักไว้ (50 ทวิ)</dt><dd>−${fmt(salWht)}</dd>` : ""}
        <dt>ผู้เช่าหัก ณ ที่จ่าย</dt><dd>−${fmt(wY)}</dd>
        <dt>จ่ายไปแล้วใน ภ.ง.ด.94</dt><dd>−${fmt(paid94)}</dd>
        <dt class="total">${dueY < 0 ? "ขอคืนภาษีโดยประมาณ" : "ต้องชำระเพิ่มโดยประมาณ"}</dt><dd class="total">${fmt(Math.abs(dueY))}</dd>
      </dl>
      ${sal ? `<p class="small" style="margin:0">ภาษีที่เพิ่มขึ้นเพราะค่าเช่า ≈ <b>${fmt(rentTaxY)}</b> บาท/ปี (เดือนละ ≈ ${fmt0(rentTaxY / 12)})</p>` : `<p class="small muted" style="margin:0">ยังไม่รวมเงินเดือน ใส่เงินเดือนทั้งปีในส่วนตั้งค่าเพื่อประมาณการให้ใกล้จริง</p>`}
      <p class="small muted" style="margin:0">ยื่นออนไลน์ efiling.rd.go.th มักได้ขยายเวลาเพิ่ม ตรวจวันที่ประกาศของปีนั้น</p>`;
    // ผลคำนวณสดใต้ส่วนตั้งค่า
    $("sActualH1").placeholder = flat ? `เหมา 30% = ${fmt(e1)}` : "0.00";
    $("sActualY").placeholder = flat ? `เหมา 30% = ${fmt(eY)}` : "0.00";
    $("sResult").innerHTML = `
      <div class="save"><div class="small">ภ.ง.ด.94 · เงินได้สุทธิ ${fmt(c1.net)}</div><div class="big">${fmt(due1)} ฿</div><div class="small muted">ภาษีที่ต้องชำระ (หักค่าใช้จ่าย ${fmt(e1)})</div></div>
      <div class="save"><div class="small">ภ.ง.ด.90${sal ? " (รวมเงินเดือน)" : ""} · เงินได้สุทธิ ${fmt(cY.net)}</div><div class="big" style="${dueY < 0 ? "" : "color:var(--bad)"}">${fmt(Math.abs(dueY))} ฿</div><div class="small muted">${dueY < 0 ? "ได้คืนโดยประมาณ" : "ต้องชำระเพิ่มโดยประมาณ"} (หักค่าใช้จ่าย ${fmt(eY)})</div></div>
      ${gY ? "" : `<div class="save" style="background:var(--soft)"><div class="small">ยังไม่มีรายรับปี ${B}</div><div class="small muted">บันทึกการรับเงินก่อน ตัวเลขภาษีจะคำนวณให้ทันที</div></div>`}`;
  }
  function renderMonths() {
    const sums = Array(12).fill(0); yearEntries().forEach(e => sums[Number(e.received_date.slice(5, 7)) - 1] += Number(e.amount) || 0);
    const max = Math.max(...sums, 1);
    $("rMonths").innerHTML = sums.map((v, i) => `<div class="m ${i > 5 ? "h2" : ""}" title="${TH_M[i]} ${fmt(v)} บาท">
      <span class="v">${v ? (v >= 1000 ? (Math.round(v / 100) / 10) + "k" : fmt0(v)) : ""}</span>
      <div class="bar" style="height:${v ? Math.max(4, v / max * 100) : 0}px"></div><span class="k">${TH_M[i]}</span></div>`).join("");
  }
  function renderTable() {
    const fp = $("rFilter").value;
    const props = [...new Set(entries.map(e => e.property).filter(Boolean))].sort();
    $("rFilter").innerHTML = `<option value="">ทุกหลัง</option>` + props.map(p => `<option ${p === fp ? "selected" : ""}>${esc(p)}</option>`).join("");
    $("propList").innerHTML = props.map(p => `<option value="${esc(p)}">`).join("");
    $("tenantList").innerHTML = [...new Set(entries.map(e => e.tenant).filter(Boolean))].map(t => `<option value="${esc(t)}">`).join("");
    const rows = yearEntries().filter(e => !fp || e.property === fp).sort((a, b) => a.received_date.localeCompare(b.received_date));
    $("rCount").textContent = rows.length ? `· ${rows.length} รายการ` : "";
    if (!rows.length) { $("rBody").innerHTML = `<tr><td colspan="7" class="empty">ยังไม่มีรายการของปี ${be(year)}<br><span class="small">กรอกวันที่ได้รับเงินและจำนวนเงินด้านบน แล้วกด "บันทึก"</span></td></tr>`; return; }
    let h = "", cur = 0, sub = 0, subW = 0;
    const flush = lbl => { h += `<tr class="sub"><td class="l" colspan="3">${lbl}</td><td class="num">${fmt(sub)}</td><td class="num">${fmt(subW)}</td><td colspan="2"></td></tr>`; };
    rows.forEach(e => {
      const hh = half(e);
      if (cur && hh !== cur) { flush("รวม ม.ค.–มิ.ย. (ภ.ง.ด.94)"); sub = 0; subW = 0; }
      cur = hh; sub += Number(e.amount) || 0; subW += Number(e.wht) || 0;
      h += `<tr><td class="l num">${thDate(e.received_date)}</td>
        <td class="l"><div>${esc(e.property)}</div><div class="small muted">${esc(e.tenant || "")}${e.method ? " · " + esc(e.method) : ""}</div></td>
        <td class="l">${e.for_month ? `<span class="tag">${thMonth(e.for_month)}</span>` : ""}</td>
        <td class="num">${fmt(e.amount)}</td><td class="num">${Number(e.wht) ? fmt(e.wht) : "–"}</td>
        <td class="l small" style="white-space:normal;min-width:140px">${esc(e.note || "")}</td>
        <td><button class="btn-link" data-copy="${e.id}" title="คัดลอกเป็นเดือนถัดไป">คัดลอก</button><button class="btn-link" data-edit="${e.id}">แก้ไข</button><button class="btn-link btn-danger" data-del="${e.id}">ลบ</button></td></tr>`;
    });
    flush(cur === 1 ? "รวม ม.ค.–มิ.ย. (ภ.ง.ด.94)" : "รวม ก.ค.–ธ.ค.");
    $("rBody").innerHTML = h;
  }
  function renderSettings() {
    const s = S();
    $("sFlat").checked = s.method !== "actual"; $("sActual").checked = s.method === "actual";
    $("sActualH1").value = Number(s.actual_h1) || ""; $("sActualY").value = Number(s.actual_y) || "";
    $("sDed94").value = s.ded94; $("sDed90").value = s.ded90; $("sSalary").value = Number(s.salary) || ""; $("sSalaryWht").value = Number(s.salary_wht) || "";
    $("sPaid94").value = s.paid94 === null || s.paid94 === undefined ? "" : s.paid94;
    $("sActualH1").disabled = $("sActualY").disabled = s.method !== "actual";
  }
  function render() { renderYears(); renderCards(); renderMonths(); renderTable(); }

  // ---------- data ----------
  async function load() {
    $("rBody").innerHTML = `<tr><td colspan="7" class="empty">กำลังโหลด…</td></tr>`;
    const [a, b] = await Promise.all([
      db.from("rent_entries").select("*").order("received_date"),
      db.from("rent_settings").select("*")
    ]);
    if (a.error || b.error) { banner("โหลดข้อมูลค่าเช่าไม่ได้: " + dbErr(a.error || b.error) + " (รัน supabase/schema.sql แล้วหรือยัง?)"); entries = []; }
    else { entries = a.data; settings = {}; b.data.forEach(r => settings[r.tax_year] = r); }
    render(); renderSettings();
  }

  function resetForm() {
    editingId = null; $("rForm").reset(); $("fDate").value = isoToday(); $("fForMonth").value = isoToday().slice(0, 7); monthTouched = false; lastDate = $("fDate").value;
    $("rFormTitle").textContent = "บันทึกการรับเงิน"; $("rSave").textContent = "บันทึก"; $("rCancel").hidden = true;
  }

  $("rForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const row = { received_date: $("fDate").value, amount: Number($("fAmount").value), for_month: $("fForMonth").value || null,
      property: $("fProperty").value.trim(), tenant: $("fTenant").value.trim() || null, method: $("fMethod").value,
      wht: Number($("fWht").value) || 0, note: $("fNote").value.trim() || null, updated_at: new Date().toISOString() };
    const msg = $("rMsg"); msg.className = "msg";
    if (!row.received_date || !(row.amount > 0) || !row.property) { msg.className = "msg err"; msg.textContent = "กรอกวันที่ จำนวนเงิน และบ้านให้ครบ"; return; }
    $("rSave").disabled = true;
    const q = editingId ? db.from("rent_entries").update(row).eq("id", editingId).select().single()
                        : db.from("rent_entries").insert(Object.assign({ user_id: user.id }, row)).select().single();
    const { data, error } = await q;
    $("rSave").disabled = false;
    if (error) { msg.className = "msg err"; msg.textContent = "บันทึกไม่สำเร็จ: " + dbErr(error); return; }
    const i = entries.findIndex(e => e.id === data.id); if (i >= 0) entries[i] = data; else entries.push(data);
    year = Number(data.received_date.slice(0, 4));
    const kept = row.property; resetForm(); $("fProperty").value = kept;
    msg.className = "msg ok"; msg.textContent = "บันทึกแล้ว " + fmt(data.amount) + " บาท";
    render(); renderSettings();
  });
  $("rCancel").addEventListener("click", resetForm);
  $("fWht5").addEventListener("click", () => { const a = Number($("fAmount").value) || 0; $("fWht").value = a ? (Math.round(a * 5) / 100).toFixed(2) : ""; });
  // ค่าเช่าของเดือน: ตามวันที่รับเงินอัตโนมัติ จนกว่าจะแก้เอง
  // เปลี่ยนวันที่รับเงินเมื่อไหร่ → ค่าเช่าของเดือนเปลี่ยนตามทันที (แก้เดือนเองทีหลังได้)
  let lastDate = "";
  const syncMonth = () => { const d = $("fDate").value; if (d && d !== lastDate) { lastDate = d; $("fForMonth").value = d.slice(0, 7); } };
  ["input", "change", "blur"].forEach(ev => $("fDate").addEventListener(ev, syncMonth));
  $("fForMonth").addEventListener("input", () => { monthTouched = !!$("fForMonth").value; });

  function copyFrom(e) {
    resetForm();
    const date = shiftDate(e.received_date, 1);
    $("fDate").value = date; lastDate = date; $("fAmount").value = e.amount; $("fProperty").value = e.property || ""; $("fTenant").value = e.tenant || "";
    $("fMethod").value = e.method || "โอนเข้าบัญชี"; $("fWht").value = Number(e.wht) || ""; $("fNote").value = e.note || "";
    $("fForMonth").value = e.for_month ? nextYM(e.for_month) : date.slice(0, 7); monthTouched = true;
    $("rMsg").className = "msg"; $("rMsg").textContent = "คัดลอกแล้ว ตรวจวันที่แล้วกดบันทึก";
    $("rForm").scrollIntoView({ behavior: "smooth", block: "center" }); $("fDate").focus();
  }
  $("rCopyLast").addEventListener("click", () => {
    const fp = $("fProperty").value.trim();
    const pool = entries.filter(e => !fp || e.property === fp).sort((a, b) => b.received_date.localeCompare(a.received_date));
    if (!pool.length) { $("rMsg").className = "msg err"; $("rMsg").textContent = "ยังไม่มีรายการให้คัดลอก"; return; }
    copyFrom(pool[0]);
  });
  $("rYear").addEventListener("change", e => { year = Number(e.target.value); render(); renderSettings(); });
  $("rFilter").addEventListener("change", renderTable);

  $("rBody").addEventListener("click", async ev => {
    const ed = ev.target.closest("[data-edit]"), dl = ev.target.closest("[data-del]"), cp = ev.target.closest("[data-copy]");
    if (cp) { const e = entries.find(x => x.id === cp.dataset.copy); if (e) copyFrom(e); return; }
    if (ed) {
      const e = entries.find(x => x.id === ed.dataset.edit); if (!e) return; editingId = e.id;
      $("fDate").value = e.received_date; lastDate = e.received_date; $("fAmount").value = e.amount; $("fForMonth").value = e.for_month || ""; $("fProperty").value = e.property || "";
      monthTouched = true; $("fTenant").value = e.tenant || ""; $("fMethod").value = e.method || "โอนเข้าบัญชี"; $("fWht").value = Number(e.wht) || ""; $("fNote").value = e.note || "";
      $("rFormTitle").textContent = "แก้ไขรายการ"; $("rSave").textContent = "บันทึกการแก้ไข"; $("rCancel").hidden = false;
      $("rForm").scrollIntoView({ behavior: "smooth", block: "center" }); $("fAmount").focus();
    }
    if (dl) {
      const id = dl.dataset.del;
      if (confirmId !== id) { confirmId = id; dl.textContent = "ยืนยันลบ?"; setTimeout(() => { if (confirmId === id) { confirmId = null; dl.textContent = "ลบ"; } }, 3000); return; }
      confirmId = null;
      const { error } = await db.from("rent_entries").delete().eq("id", id);
      if (error) { banner("ลบไม่สำเร็จ: " + dbErr(error)); return; }
      entries = entries.filter(x => x.id !== id); render();
    }
  });

  let sTimer = null;
  function updSetting(patch) {
    settings[year] = Object.assign(S(), patch, { tax_year: year });
    renderSettings(); renderCards();
    clearTimeout(sTimer); $("sState").textContent = "· กำลังบันทึก…";
    sTimer = setTimeout(async () => {
      const s = settings[year];
      const { error } = await db.from("rent_settings").upsert({ user_id: user.id, tax_year: year, method: s.method, actual_h1: Number(s.actual_h1) || 0,
        actual_y: Number(s.actual_y) || 0, ded94: Number(s.ded94) || 0, ded90: Number(s.ded90) || 0, paid94: s.paid94, salary: Number(s.salary) || 0, salary_wht: Number(s.salary_wht) || 0, updated_at: new Date().toISOString() });
      $("sState").textContent = error ? (/salary/.test(dbErr(error)) ? "· บันทึกไม่สำเร็จ: ยังไม่ได้รัน SQL เพิ่มคอลัมน์เงินเดือน" : "· บันทึกไม่สำเร็จ: " + dbErr(error)) : "· บันทึกแล้ว";
    }, 700);
  }
  document.querySelectorAll('input[name="expMethod"]').forEach(r => r.addEventListener("change", () => updSetting({ method: $("sActual").checked ? "actual" : "flat" })));
  [["sActualH1", "actual_h1"], ["sActualY", "actual_y"], ["sDed94", "ded94"], ["sDed90", "ded90"], ["sSalary", "salary"], ["sSalaryWht", "salary_wht"]]
    .forEach(([el, k]) => $(el).addEventListener("input", () => updSetting({ [k]: Number($(el).value) || 0 })));
  $("sPaid94").addEventListener("input", () => updSetting({ paid94: $("sPaid94").value === "" ? null : Number($("sPaid94").value) }));

  $("rExport").addEventListener("click", () => {
    const q = v => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const rows = yearEntries().sort((a, b) => a.received_date.localeCompare(b.received_date));
    const csv = "﻿" + ["วันที่รับเงิน,ครึ่งปี,บ้าน,ผู้เช่า,ค่าเช่าเดือน,จำนวนเงิน,ภาษีหัก ณ ที่จ่าย,ช่องทาง,หมายเหตุ"]
      .concat(rows.map(e => [e.received_date, half(e) === 1 ? "ม.ค.-มิ.ย." : "ก.ค.-ธ.ค.", e.property, e.tenant, e.for_month, e.amount, e.wht || 0, e.method, e.note].map(q).join(","))).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `ค่าเช่า-${be(year)}.csv`; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  });

  App.modules.rent = { init: u => { user = u; resetForm(); load(); } };
})();
