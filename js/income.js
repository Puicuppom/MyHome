// เงินได้: ประมาณการทั้งปี (เงินเดือน+โบนัส, ภาษีที่ถูกหัก, ประกันสังคม) — Tax.st.estimates
(function () {
  let user = null, eTimer = null;
  const num = v => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
  const commas = v => { const n = Number(v) || 0; return n ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : ""; };
  const EST = [["eSalary", "salary"], ["eWht", "wht"], ["eSso", "sso"]];

  function render() {
    if (!user) return;
    const est = Tax.st.estimates[Tax.st.year] || {}, c = Tax.compute(Tax.st.year);
    const focused = document.activeElement && document.activeElement.closest && document.activeElement.closest("#incomeView .grid");
    if (!focused) EST.forEach(([id, k]) => { $(id).value = commas(est[k]); });
    $("iSummary").innerHTML = c.i1 + c.i2 + c.iO
      ? `<dt>เงินเดือน + โบนัส 40(1)</dt><dd>${fmt(c.i1)}</dd>
         <dt>หักค่าใช้จ่าย 50% (ไม่เกิน 100,000)</dt><dd>−${fmt(c.exp12)}</dd>
         <dt>ภาษีที่ถูกหัก ณ ที่จ่าย</dt><dd>${fmt(c.y.whtInc)}</dd>
         <dt>ประกันสังคม <span class="muted small">(นับเป็นลดหย่อนแล้ว)</span></dt><dd>${fmt(c.ssoSlip)}</dd>`
      : `<dt class="muted">ยังไม่ได้กรอกเงินได้ปี ${be(Tax.st.year)}</dt><dd></dd>`;
  }

  function save() {
    const y = Tax.st.year, row = { tax_year: y, salary: num($("eSalary").value), wht: num($("eWht").value), sso: num($("eSso").value) };
    Tax.st.estimates[y] = row; Tax.emit();
    clearTimeout(eTimer); $("eState").textContent = "กำลังบันทึก…";
    eTimer = setTimeout(async () => {
      const { error } = await db.from("income_estimates").upsert(Object.assign({ user_id: user.id, updated_at: new Date().toISOString() }, row));
      $("eState").textContent = error ? "บันทึกไม่สำเร็จ: " + (/income_estimates/.test(dbErr(error)) ? "ยังไม่ได้รัน SQL 004" : dbErr(error)) : "บันทึกแล้ว";
    }, 700);
  }
  EST.forEach(([id]) => $(id).addEventListener("input", save));
  $("eFill").addEventListener("click", () => {
    const m = num($("eMonthly").value), b = num($("eBonus").value);
    if (m || b) $("eSalary").value = commas(m * 12 + b);
    if (num($("eWhtM").value)) $("eWht").value = commas(num($("eWhtM").value) * 12);
    if (num($("eSsoM").value)) $("eSso").value = commas(num($("eSsoM").value) * 12);
    save();
  });

  Tax.on(render);
  App.modules.income = { init: u => { user = u; render(); Tax.load(); } };
})();
