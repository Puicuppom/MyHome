// เงินได้ (เงินเดือน, โบนัส, 40(2), อื่น ๆ) — ข้อมูลอยู่ใน Tax.st.income
(function () {
  let user = null, editingId = null, confirmId = null;
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const shiftDate = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); const last = new Date(y, m + n, 0).getDate(); return ymd(new Date(y, m - 1 + n, Math.min(d, last))); };
  const T = Tax.INCOME_TYPES;
  const yearRows = () => Tax.st.income.filter(e => Number(e.received_date.slice(0, 4)) === Tax.st.year)
    .sort((a, b) => a.received_date.localeCompare(b.received_date));

  $("iType").innerHTML = Object.entries(T).map(([k, v]) => `<option value="${k}">${v.label} · ${v.code}</option>`).join("");
  const toggleSso = () => { $("iSsoWrap").hidden = !["salary", "bonus"].includes($("iType").value); };
  $("iType").addEventListener("change", toggleSso);

  // ----- ประมาณการทั้งปี -----
  const num = v => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
  const commas = v => { const n = Number(v) || 0; return n ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : ""; };
  const EST = [["eSalary", "salary"], ["eWht", "wht"], ["eSso", "sso"]];
  let eTimer = null;
  function renderEstimate() {
    const est = Tax.st.estimates[Tax.st.year] || {};
    if (!document.activeElement || !document.activeElement.closest("#incomeView .grid")) EST.forEach(([id, k]) => { $(id).value = commas(est[k]); });
  }
  function saveEstimate() {
    const y = Tax.st.year, row = { tax_year: y, salary: num($("eSalary").value), wht: num($("eWht").value), sso: num($("eSso").value) };
    Tax.st.estimates[y] = row; Tax.emit();
    clearTimeout(eTimer); $("eState").textContent = "กำลังบันทึก…";
    eTimer = setTimeout(async () => {
      const { error } = await db.from("income_estimates").upsert(Object.assign({ user_id: user.id, updated_at: new Date().toISOString() }, row));
      $("eState").textContent = error ? "บันทึกไม่สำเร็จ: " + (/income_estimates/.test(dbErr(error)) ? "ยังไม่ได้รัน SQL 004" : dbErr(error)) : "บันทึกแล้ว";
    }, 700);
  }
  EST.forEach(([id]) => $(id).addEventListener("input", saveEstimate));
  $("eFill").addEventListener("click", () => {
    const m = num($("eMonthly").value), b = num($("eBonus").value);
    if (m || b) $("eSalary").value = commas(m * 12 + b);
    if (num($("eWhtM").value)) $("eWht").value = commas(num($("eWhtM").value) * 12);
    if (num($("eSsoM").value)) $("eSso").value = commas(num($("eSsoM").value) * 12);
    saveEstimate();
  });

  function render() {
    if (!user) return;
    renderEstimate();
    const rows = yearRows(), c = Tax.compute(Tax.st.year);
    $("iEstNote").hidden = !c.usingEst;
    $("iPayerList").innerHTML = [...new Set(Tax.st.income.map(e => e.payer).filter(Boolean))].map(p => `<option value="${esc(p)}">`).join("");
    // สรุปตามประเภท
    const by = {}; rows.forEach(e => { by[e.type] = by[e.type] || { amount: 0, wht: 0, sso: 0, n: 0 }; by[e.type].amount += +e.amount; by[e.type].wht += +e.wht; by[e.type].sso += +e.sso; by[e.type].n++; });
    if (c.usingEst) { delete by.salary; delete by.bonus; }
    $("iSummary").innerHTML = (c.usingEst ? `<dt>เงินเดือน + โบนัส (ประมาณการ)</dt><dd>${fmt(c.i1)}</dd>` : "") + Object.keys(T).filter(k => by[k]).map(k => `<dt>${T[k].label} <span class="muted small">(${by[k].n})</span></dt><dd>${fmt(by[k].amount)}</dd>`).join("")
      + (rows.length || c.usingEst ? `<div class="sep"></div><dt>รวมเงินได้ (ไม่รวมค่าเช่า)</dt><dd>${fmt(c.i1 + c.i2 + c.iO)}</dd>
         <dt>ภาษีหัก ณ ที่จ่ายรวม</dt><dd>${fmt(c.y.whtInc)}</dd><dt>ประกันสังคม <span class="muted small">(นับเป็นลดหย่อนให้แล้ว)</span></dt><dd>${fmt(c.ssoSlip)}</dd>`
        : `<dt class="muted">ยังไม่มีเงินได้ปี ${be(Tax.st.year)}</dt><dd></dd>`);
    if (!rows.length) { $("iBody").innerHTML = `<tr><td colspan="7" class="empty">${Tax.st.loaded ? `ยังไม่มีรายการ<br><span class="small">ใส่เงินเดือนเดือนแรก แล้วติ๊ก "ทำซ้ำทุกเดือนจนถึง ธ.ค." เพื่อประมาณการทั้งปี</span>` : "กำลังโหลด…"}</td></tr>`; return; }
    let h = "";
    rows.forEach(e => {
      h += `<tr><td class="l num">${thDate(e.received_date)}</td><td class="l"><div>${esc(T[e.type]?.label || e.type)}</div><div class="small muted">${esc(e.payer || "")}</div></td>
        <td class="num">${fmt(e.amount)}</td><td class="num">${+e.wht ? fmt(e.wht) : "–"}</td><td class="num">${+e.sso ? fmt(e.sso) : "–"}</td>
        <td class="l small" style="white-space:normal;min-width:120px">${esc(e.note || "")}</td>
        <td><button class="btn-link" data-copy="${e.id}">คัดลอก</button><button class="btn-link" data-edit="${e.id}">แก้ไข</button><button class="btn-link btn-danger" data-del="${e.id}">ลบ</button></td></tr>`;
    });
    h += `<tr class="sub"><td class="l" colspan="2">รวมปี ${be(Tax.st.year)}</td><td class="num">${fmt(rows.reduce((a, e) => a + +e.amount, 0))}</td><td class="num">${fmt(c.y.whtInc)}</td><td class="num">${fmt(c.ssoSlip)}</td><td colspan="2"></td></tr>`;
    $("iBody").innerHTML = h;
  }

  function resetForm() {
    editingId = null; $("iForm").reset(); $("iDate").value = ymd(new Date()); toggleSso();
    $("iFormTitle").textContent = "บันทึกเงินได้"; $("iSave").textContent = "บันทึก"; $("iCancel").hidden = true; $("iRepeatWrap").hidden = false;
  }
  function fill(e, date) {
    $("iDate").value = date; $("iType").value = e.type; $("iPayer").value = e.payer || ""; $("iAmount").value = e.amount;
    $("iWht").value = +e.wht || ""; $("iSso").value = +e.sso || ""; $("iNote").value = e.note || ""; toggleSso();
  }
  function copyFrom(e) { resetForm(); fill(e, shiftDate(e.received_date, 1)); $("iMsg").className = "msg"; $("iMsg").textContent = "คัดลอกเป็นเดือนถัดไปแล้ว กดบันทึก"; $("iForm").scrollIntoView({ behavior: "smooth", block: "center" }); }

  $("iForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const base = { received_date: $("iDate").value, type: $("iType").value, payer: $("iPayer").value.trim() || null, amount: Number($("iAmount").value),
      wht: Number($("iWht").value) || 0, sso: $("iSsoWrap").hidden ? 0 : Number($("iSso").value) || 0, note: $("iNote").value.trim() || null, updated_at: new Date().toISOString() };
    const msg = $("iMsg"); msg.className = "msg";
    if (!base.received_date || !(base.amount > 0)) { msg.className = "msg err"; msg.textContent = "กรอกวันที่และจำนวนเงินให้ครบ"; return; }
    $("iSave").disabled = true;
    let res;
    if (editingId) res = await db.from("income_entries").update(base).eq("id", editingId).select();
    else {
      const rows = [Object.assign({ user_id: user.id }, base)];
      if ($("iRepeat").checked) { const m0 = Number(base.received_date.slice(5, 7)); for (let i = 1; i <= 12 - m0; i++) rows.push(Object.assign({}, rows[0], { received_date: shiftDate(base.received_date, i) })); }
      res = await db.from("income_entries").insert(rows).select();
    }
    $("iSave").disabled = false;
    if (res.error) { msg.className = "msg err"; msg.textContent = "บันทึกไม่สำเร็จ: " + dbErr(res.error); return; }
    res.data.forEach(r => { const a = Tax.st.income, i = a.findIndex(x => x.id === r.id); if (i >= 0) a[i] = r; else a.push(r); });
    Tax.st.year = Number(base.received_date.slice(0, 4));
    const keep = { type: base.type, payer: base.payer }; resetForm(); $("iType").value = keep.type; $("iPayer").value = keep.payer || ""; toggleSso();
    msg.className = "msg ok"; msg.textContent = `บันทึกแล้ว ${res.data.length} รายการ`;
    Tax.emit();
  });
  $("iCancel").addEventListener("click", resetForm);
  $("iCopyLast").addEventListener("click", () => {
    const t = $("iType").value, pool = Tax.st.income.filter(e => e.type === t).sort((a, b) => b.received_date.localeCompare(a.received_date));
    if (!pool.length) { $("iMsg").className = "msg err"; $("iMsg").textContent = "ยังไม่มีรายการประเภทนี้ให้คัดลอก"; return; }
    copyFrom(pool[0]);
  });
  $("iBody").addEventListener("click", async ev => {
    const ed = ev.target.closest("[data-edit]"), dl = ev.target.closest("[data-del]"), cp = ev.target.closest("[data-copy]");
    const find = id => Tax.st.income.find(x => x.id === id);
    if (cp) { const e = find(cp.dataset.copy); if (e) copyFrom(e); return; }
    if (ed) { const e = find(ed.dataset.edit); if (!e) return; resetForm(); editingId = e.id; fill(e, e.received_date);
      $("iFormTitle").textContent = "แก้ไขเงินได้"; $("iSave").textContent = "บันทึกการแก้ไข"; $("iCancel").hidden = false; $("iRepeatWrap").hidden = true;
      $("iForm").scrollIntoView({ behavior: "smooth", block: "center" }); }
    if (dl) {
      const id = dl.dataset.del;
      if (confirmId !== id) { confirmId = id; dl.textContent = "ยืนยันลบ?"; setTimeout(() => { if (confirmId === id) { confirmId = null; dl.textContent = "ลบ"; } }, 3000); return; }
      confirmId = null; const { error } = await db.from("income_entries").delete().eq("id", id);
      if (error) { banner("ลบไม่สำเร็จ: " + dbErr(error)); return; } Tax.removeLocal("income", id);
    }
  });

  Tax.on(render);
  App.modules.income = { init: u => { user = u; resetForm(); render(); Tax.load(); } };
})();
