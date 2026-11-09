// ลดหย่อน — ข้อมูลอยู่ใน Tax.st.deductions (ต่อปีภาษี)
(function () {
  let user = null, editingId = null, confirmId = null;
  const D = Tax.DED;
  const groups = [...new Set(Object.values(D).map(d => d.group))];
  $("dCat").innerHTML = groups.map(g => `<optgroup label="${g}">` + Object.entries(D).filter(([, d]) => d.group === g)
    .map(([k, d]) => `<option value="${k}">${d.label}</option>`).join("") + `</optgroup>`).join("");
  const hint = () => { $("dHint").textContent = D[$("dCat").value]?.hint || ""; };
  $("dCat").addEventListener("change", hint);

  function render() {
    if (!user) return;
    const y = Tax.st.year, c = Tax.compute(y), items = c.ded;
    $("dTotal").textContent = fmt(c.dedTotal);
    let h = `<tr class="sub"><td class="l">ส่วนตัว</td><td class="l small">อัตโนมัติ</td><td class="num">60,000.00</td><td class="num">60,000.00</td><td></td></tr>`;
    if (c.ssoSlip) h += `<tr><td class="l">ประกันสังคม</td><td class="l small">จากแท็บเงินได้</td><td class="num">${fmt(c.ssoSlip)}</td><td class="num">${fmt(c.ssoSlip)}</td><td></td></tr>`;
    const cats = Object.keys(D).filter(k => items.some(d => d.category === k));
    cats.forEach(k => {
      const list = items.filter(d => d.category === k), raw = list.reduce((a, d) => a + +d.amount, 0);
      const allowed = k === "sso" ? c.allow.sso - c.ssoSlip : (c.allow[k] || 0);
      const cut = allowed < raw - 0.005 && !k.startsWith("donation_edu");
      h += `<tr class="sub"><td class="l">${D[k].label}</td><td class="l small" style="white-space:normal">${esc(D[k].hint)}</td><td class="num">${fmt(raw)}</td>
        <td class="num" ${cut ? 'style="color:var(--bad)"' : ""}>${fmt(allowed)}${cut ? " ⚠" : ""}</td><td></td></tr>`;
      list.forEach(d => { h += `<tr><td class="l small">&nbsp;&nbsp;${esc(d.label || "–")}</td><td class="l small" style="white-space:normal">${esc(d.note || "")}</td><td class="num">${fmt(d.amount)}</td><td></td>
        <td><button class="btn-link" data-edit="${d.id}">แก้ไข</button><button class="btn-link btn-danger" data-del="${d.id}">ลบ</button></td></tr>`; });
    });
    h += `<tr class="sub"><td class="l" colspan="3">รวมหักลดหย่อนได้ ปี ${be(y)}</td><td class="num">${fmt(c.dedTotal)}</td><td></td></tr>`;
    $("dBody").innerHTML = h;
    $("dEmpty").hidden = !!items.length || !Tax.st.loaded;
  }

  function resetForm() { editingId = null; $("dForm").reset(); hint(); $("dFormTitle").textContent = "เพิ่มรายการลดหย่อน"; $("dSave").textContent = "บันทึก"; $("dCancel").hidden = true; }

  $("dForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const row = { tax_year: Tax.st.year, category: $("dCat").value, amount: Number($("dAmount").value), label: $("dLabel").value.trim() || null,
      note: $("dNote").value.trim() || null, updated_at: new Date().toISOString() };
    const msg = $("dMsg"); msg.className = "msg";
    if (!(row.amount >= 0) || $("dAmount").value === "") { msg.className = "msg err"; msg.textContent = "กรอกจำนวนเงิน"; return; }
    $("dSave").disabled = true;
    const q = editingId ? db.from("deduction_items").update(row).eq("id", editingId).select().single()
                        : db.from("deduction_items").insert(Object.assign({ user_id: user.id }, row)).select().single();
    const { data, error } = await q;
    $("dSave").disabled = false;
    if (error) { msg.className = "msg err"; msg.textContent = "บันทึกไม่สำเร็จ: " + dbErr(error); return; }
    resetForm(); msg.className = "msg ok"; msg.textContent = `บันทึกแล้ว · ${D[data.category].label}`;
    Tax.upsertLocal("deductions", data);
  });
  $("dCancel").addEventListener("click", resetForm);

  $("dBody").addEventListener("click", async ev => {
    const ed = ev.target.closest("[data-edit]"), dl = ev.target.closest("[data-del]");
    if (ed) { const d = Tax.st.deductions.find(x => x.id === ed.dataset.edit); if (!d) return; editingId = d.id;
      $("dCat").value = d.category; $("dAmount").value = d.amount; $("dLabel").value = d.label || ""; $("dNote").value = d.note || ""; hint();
      $("dFormTitle").textContent = "แก้ไขรายการลดหย่อน"; $("dSave").textContent = "บันทึกการแก้ไข"; $("dCancel").hidden = false;
      $("dForm").scrollIntoView({ behavior: "smooth", block: "center" }); }
    if (dl) {
      const id = dl.dataset.del;
      if (confirmId !== id) { confirmId = id; dl.textContent = "ยืนยันลบ?"; setTimeout(() => { if (confirmId === id) { confirmId = null; dl.textContent = "ลบ"; } }, 3000); return; }
      confirmId = null; const { error } = await db.from("deduction_items").delete().eq("id", id);
      if (error) { banner("ลบไม่สำเร็จ: " + dbErr(error)); return; } Tax.removeLocal("deductions", id);
    }
  });

  // ดึงดอกเบี้ยปีนี้จากหน้าผ่อนบ้าน
  $("dLoan").addEventListener("click", async () => {
    const msg = $("dMsg"), y = Tax.st.year; msg.className = "msg";
    const r = await App.loanYearInterest(y);
    if (r == null) { msg.className = "msg err"; msg.textContent = "ยังไม่มีข้อมูลในหน้าผ่อนบ้าน หรือคำนวณไม่ได้"; return; }
    const LBL = "จากหน้าผ่อนบ้าน";
    const ex = Tax.st.deductions.find(d => d.tax_year === y && d.category === "home_interest" && d.label === LBL);
    const row = { tax_year: y, category: "home_interest", amount: Math.round(r.interest * 100) / 100, label: LBL,
      note: `ประมาณการตามแผน ${r.months} งวดในปี ${be(y)}`, updated_at: new Date().toISOString() };
    const q = ex ? db.from("deduction_items").update(row).eq("id", ex.id).select().single()
                 : db.from("deduction_items").insert(Object.assign({ user_id: user.id }, row)).select().single();
    const { data, error } = await q;
    if (error) { msg.className = "msg err"; msg.textContent = "บันทึกไม่สำเร็จ: " + dbErr(error); return; }
    msg.className = "msg ok"; msg.textContent = `ดอกเบี้ยบ้านปี ${be(y)} ≈ ${fmt(r.interest)} บาท (หักได้ไม่เกิน 100,000)`;
    Tax.upsertLocal("deductions", data);
  });

  Tax.on(render);
  App.modules.deduct = { init: u => { user = u; resetForm(); render(); Tax.load(); } };
})();
