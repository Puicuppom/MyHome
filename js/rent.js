// สมุดค่าเช่า (40(5)) — ข้อมูลอยู่ใน Tax.st.rent
(function () {
  let user = null, editingId = null, confirmId = null, lastDate = "", sTimer = null;
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const isoToday = () => ymd(new Date());
  const nextYM = ym => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
  const shiftDate = (iso, n = 1) => { const [y, m, d] = iso.split("-").map(Number); const last = new Date(y, m + n, 0).getDate(); return ymd(new Date(y, m - 1 + n, Math.min(d, last))); };
  const half = e => Number(e.received_date.slice(5, 7)) <= 6 ? 1 : 2;
  const yearEntries = () => Tax.st.rent.filter(e => Number(e.received_date.slice(0, 4)) === Tax.st.year);

  function renderMonths() {
    const sums = Array(12).fill(0); yearEntries().forEach(e => sums[Number(e.received_date.slice(5, 7)) - 1] += Number(e.amount) || 0);
    const max = Math.max(...sums, 1);
    $("rMonths").innerHTML = sums.map((v, i) => `<div class="m ${i > 5 ? "h2" : ""}" title="${TH_M[i]} ${fmt(v)} บาท">
      <span class="v">${v ? (v >= 1000 ? (Math.round(v / 100) / 10) + "k" : fmt0(v)) : ""}</span>
      <div class="bar" style="height:${v ? Math.max(4, v / max * 100) : 0}px"></div><span class="k">${TH_M[i]}</span></div>`).join("");
  }
  function renderTable() {
    const all = Tax.st.rent, fp = $("rFilter").value;
    const props = [...new Set(all.map(e => e.property).filter(Boolean))].sort();
    $("rFilter").innerHTML = `<option value="">ทุกหลัง</option>` + props.map(p => `<option ${p === fp ? "selected" : ""}>${esc(p)}</option>`).join("");
    $("propList").innerHTML = props.map(p => `<option value="${esc(p)}">`).join("");
    $("tenantList").innerHTML = [...new Set(all.map(e => e.tenant).filter(Boolean))].map(t => `<option value="${esc(t)}">`).join("");
    const rows = yearEntries().filter(e => !fp || e.property === fp).sort((a, b) => a.received_date.localeCompare(b.received_date));
    $("rCount").textContent = rows.length ? `· ${rows.length} รายการ` : "";
    if (!rows.length) { $("rBody").innerHTML = `<tr><td colspan="7" class="empty c-empty">${Tax.st.loaded ? `ยังไม่มีรายการของปี ${be(Tax.st.year)}<br><span class="small">กรอกวันที่ได้รับเงินและจำนวนเงินด้านบน แล้วกด "บันทึก"</span>` : "กำลังโหลด…"}</td></tr>`; return; }
    let h = "", cur = 0, sub = 0, subW = 0;
    const flush = lbl => { h += `<tr class="sub"><td class="l c-sublbl" colspan="3">${lbl}</td><td class="num c-amt">${fmt(sub)}</td><td class="num c-wht${subW ? "" : " c-none"}" data-label="หัก ณ ที่จ่าย">${fmt(subW)}</td><td class="c-none" colspan="2"></td></tr>`; };
    rows.forEach(e => {
      const hh = half(e);
      if (cur && hh !== cur) { flush("รวม ม.ค.–มิ.ย. (ภ.ง.ด.94)"); sub = 0; subW = 0; }
      cur = hh; sub += Number(e.amount) || 0; subW += Number(e.wht) || 0;
      h += `<tr><td class="l num c-date">${thDate(e.received_date)}</td>
        <td class="l c-sub"><div>${esc(e.property)}</div><div class="small muted">${esc(e.tenant || "")}<span class="hide-sm">${e.method ? " · " + esc(e.method) : ""}</span></div></td>
        <td class="l c-month">${e.for_month ? `<span class="tag">${thMonth(e.for_month)}</span>` : ""}</td>
        <td class="num c-amt">${fmt(e.amount)}</td><td class="num c-wht${Number(e.wht) ? "" : " c-none"}" data-label="หัก ณ ที่จ่าย">${Number(e.wht) ? fmt(e.wht) : "–"}</td>
        <td class="l small c-note${e.note ? "" : " c-none"}" style="white-space:normal;min-width:140px">${esc(e.note || "")}</td>
        <td class="c-act"><button class="btn-link" data-copy="${e.id}" title="คัดลอกเป็นเดือนถัดไป">คัดลอก</button><button class="btn-link" data-edit="${e.id}">แก้ไข</button><button class="btn-link btn-danger" data-del="${e.id}">ลบ</button></td></tr>`;
    });
    flush(cur === 1 ? "รวม ม.ค.–มิ.ย. (ภ.ง.ด.94)" : "รวม ก.ค.–ธ.ค.");
    $("rBody").innerHTML = h;
  }
  function renderSettings() {
    const s = Tax.settings(Tax.st.year), c = Tax.compute(Tax.st.year);
    const focused = document.activeElement && document.activeElement.closest && document.activeElement.closest("#rentSettings");
    if (!focused) {
      $("sFlat").checked = s.method !== "actual"; $("sActual").checked = s.method === "actual";
      $("sActualH1").value = Number(s.actual_h1) || ""; $("sActualY").value = Number(s.actual_y) || "";
      $("sPaid94").value = s.paid94 === null || s.paid94 === undefined ? "" : s.paid94;
    }
    $("sActualH1").disabled = $("sActualY").disabled = s.method !== "actual";
    $("sActualH1").placeholder = c.flat ? `เหมา 30% = ${fmt(c.e1)}` : "0.00";
    $("sActualY").placeholder = c.flat ? `เหมา 30% = ${fmt(c.eY)}` : "0.00";
    $("sPaid94").placeholder = `ว่าง = ใช้ค่าประมาณ ${fmt(c.h1.due)}`;
  }
  function render() { if (!user) return; renderMonths(); renderTable(); renderSettings(); }

  function resetForm() {
    editingId = null; $("rForm").reset(); $("fDate").value = isoToday(); $("fForMonth").value = isoToday().slice(0, 7); lastDate = $("fDate").value;
    $("rFormTitle").textContent = "บันทึกการรับเงิน"; $("rSave").textContent = "บันทึก"; $("rCancel").hidden = true;
  }
  function fillFrom(e, date, forMonth) {
    $("fDate").value = date; lastDate = date; $("fAmount").value = e.amount; $("fForMonth").value = forMonth || "";
    $("fProperty").value = e.property || ""; $("fTenant").value = e.tenant || ""; $("fMethod").value = e.method || "โอนเข้าบัญชี";
    $("fWht").value = Number(e.wht) || ""; $("fNote").value = e.note || "";
  }
  function copyFrom(e) {
    resetForm(); const date = shiftDate(e.received_date, 1);
    fillFrom(e, date, e.for_month ? nextYM(e.for_month) : date.slice(0, 7));
    $("rMsg").className = "msg"; $("rMsg").textContent = "คัดลอกแล้ว ตรวจวันที่แล้วกดบันทึก";
    $("rForm").scrollIntoView({ behavior: "smooth", block: "center" }); $("fDate").focus();
  }

  // เปลี่ยนวันที่รับเงิน → เดือนค่าเช่าตามทันที (แก้เดือนเองทีหลังได้)
  const syncMonth = () => { const d = $("fDate").value; if (d && d !== lastDate) { lastDate = d; $("fForMonth").value = d.slice(0, 7); } };
  ["input", "change", "blur"].forEach(ev => $("fDate").addEventListener(ev, syncMonth));

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
    const kept = row.property; resetForm(); $("fProperty").value = kept;
    msg.className = "msg ok"; msg.textContent = "บันทึกแล้ว " + fmt(data.amount) + " บาท";
    Tax.st.year = Number(data.received_date.slice(0, 4)); Tax.upsertLocal("rent", data);
  });
  $("rCancel").addEventListener("click", resetForm);
  $("rCopyLast").addEventListener("click", () => {
    const fp = $("fProperty").value.trim();
    const pool = Tax.st.rent.filter(e => !fp || e.property === fp).sort((a, b) => b.received_date.localeCompare(a.received_date));
    if (!pool.length) { $("rMsg").className = "msg err"; $("rMsg").textContent = "ยังไม่มีรายการให้คัดลอก"; return; }
    copyFrom(pool[0]);
  });
  $("fWht5").addEventListener("click", () => { const a = Number($("fAmount").value) || 0; $("fWht").value = a ? (Math.round(a * 5) / 100).toFixed(2) : ""; });
  $("rFilter").addEventListener("change", renderTable);

  $("rBody").addEventListener("click", async ev => {
    const ed = ev.target.closest("[data-edit]"), dl = ev.target.closest("[data-del]"), cp = ev.target.closest("[data-copy]");
    const find = id => Tax.st.rent.find(x => x.id === id);
    if (cp) { const e = find(cp.dataset.copy); if (e) copyFrom(e); return; }
    if (ed) {
      const e = find(ed.dataset.edit); if (!e) return; editingId = e.id; fillFrom(e, e.received_date, e.for_month);
      $("rFormTitle").textContent = "แก้ไขรายการ"; $("rSave").textContent = "บันทึกการแก้ไข"; $("rCancel").hidden = false;
      $("rForm").scrollIntoView({ behavior: "smooth", block: "center" }); $("fAmount").focus();
    }
    if (dl) {
      const id = dl.dataset.del;
      if (confirmId !== id) { confirmId = id; dl.textContent = "ยืนยันลบ?"; setTimeout(() => { if (confirmId === id) { confirmId = null; dl.textContent = "ลบ"; } }, 3000); return; }
      confirmId = null;
      const { error } = await db.from("rent_entries").delete().eq("id", id);
      if (error) { banner("ลบไม่สำเร็จ: " + dbErr(error)); return; }
      Tax.removeLocal("rent", id);
    }
  });

  function updSetting(patch) {
    const y = Tax.st.year;
    Tax.st.settings[y] = Object.assign(Tax.settings(y), patch, { tax_year: y });
    Tax.emit();
    clearTimeout(sTimer); $("sState").textContent = "· กำลังบันทึก…";
    sTimer = setTimeout(async () => {
      const s = Tax.st.settings[y];
      const { error } = await db.from("rent_settings").upsert({ user_id: user.id, tax_year: y, method: s.method, actual_h1: Number(s.actual_h1) || 0,
        actual_y: Number(s.actual_y) || 0, paid94: s.paid94, updated_at: new Date().toISOString() });
      $("sState").textContent = error ? "· บันทึกไม่สำเร็จ: " + dbErr(error) : "· บันทึกแล้ว";
    }, 700);
  }
  document.querySelectorAll('input[name="expMethod"]').forEach(r => r.addEventListener("change", () => updSetting({ method: $("sActual").checked ? "actual" : "flat" })));
  [["sActualH1", "actual_h1"], ["sActualY", "actual_y"]].forEach(([el, k]) => $(el).addEventListener("input", () => updSetting({ [k]: Number($(el).value) || 0 })));
  $("sPaid94").addEventListener("input", () => updSetting({ paid94: $("sPaid94").value === "" ? null : Number($("sPaid94").value) }));

  $("rExport").addEventListener("click", () => {
    const q = v => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const rows = yearEntries().sort((a, b) => a.received_date.localeCompare(b.received_date));
    downloadCSV(`ค่าเช่า-${be(Tax.st.year)}.csv`, ["วันที่รับเงิน,ครึ่งปี,บ้าน,ผู้เช่า,ค่าเช่าเดือน,จำนวนเงิน,ภาษีหัก ณ ที่จ่าย,ช่องทาง,หมายเหตุ"]
      .concat(rows.map(e => [e.received_date, half(e) === 1 ? "ม.ค.-มิ.ย." : "ก.ค.-ธ.ค.", e.property, e.tenant, e.for_month, e.amount, e.wht || 0, e.method, e.note].map(q).join(","))));
  });

  Tax.on(render);
  App.modules.rent = { init: u => { user = u; resetForm(); render(); Tax.load(); } };
})();
