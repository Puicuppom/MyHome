// Tax: ที่เก็บข้อมูลร่วม (ค่าเช่า + เงินได้ + ลดหย่อน) และเครื่องคำนวณภาษี ภ.ง.ด.94 / 90
const Tax = (function () {
  const today = new Date();
  const st = { year: today.getFullYear(), rent: [], settings: {}, income: [], deductions: [], estimates: {}, loaded: false, errors: [] };
  const subs = new Set();
  let loading = null;

  const INCOME_TYPES = {
    salary: { label: "เงินเดือน", code: "40(1)" },
    bonus:  { label: "โบนัส / เงินได้จากนายจ้างอื่น ๆ", code: "40(1)" },
    "40_2": { label: "ค่าจ้าง / ฟรีแลนซ์ / ค่านายหน้า", code: "40(2)" },
    other:  { label: "เงินได้อื่น (ไม่หักค่าใช้จ่าย)", code: "อื่น ๆ" }
  };
  // เพดานลดหย่อนที่ใช้มาหลายปี · รายการที่เปลี่ยนบ่อย (ประกันสังคม, ช้อปลดหย่อน) ใช้ยอดที่กรอก
  const DED = {
    spouse:        { label: "คู่สมรสไม่มีเงินได้", group: "ครอบครัว", cap: 60000, hint: "60,000" },
    child:         { label: "บุตร", group: "ครอบครัว", hint: "30,000/คน · คนที่ 2 ขึ้นไปเกิดตั้งแต่ 2561 = 60,000", perItem: true },
    parent:        { label: "อุปการะบิดามารดา", group: "ครอบครัว", cap: 120000, hint: "30,000/คน (อายุ 60+ เงินได้ไม่เกิน 30,000)" },
    disabled:      { label: "อุปการะคนพิการ", group: "ครอบครัว", hint: "60,000/คน" },
    sso:           { label: "ประกันสังคม (นอกเหนือจากสลิป)", group: "ประกัน", hint: "ยอดที่จ่ายจริง · ที่หักในสลิปเงินเดือนนับให้อัตโนมัติ" },
    life:          { label: "เบี้ยประกันชีวิต", group: "ประกัน", cap: 100000, hint: "ไม่เกิน 100,000 (รวมกับประกันสุขภาพตนเอง)" },
    health:        { label: "เบี้ยประกันสุขภาพตนเอง", group: "ประกัน", cap: 25000, hint: "ไม่เกิน 25,000" },
    health_parent: { label: "เบี้ยประกันสุขภาพบิดามารดา", group: "ประกัน", cap: 15000, hint: "ไม่เกิน 15,000" },
    pension_ins:   { label: "เบี้ยประกันชีวิตแบบบำนาญ", group: "เกษียณ", cap: 200000, pct: 0.15, hint: "15% ของเงินได้ ไม่เกิน 200,000" },
    pvd:           { label: "กองทุนสำรองเลี้ยงชีพ / กบข.", group: "เกษียณ", cap: 500000, pct: 0.15, hint: "15% ของค่าจ้าง ไม่เกิน 500,000" },
    rmf:           { label: "RMF", group: "เกษียณ", cap: 500000, pct: 0.30, hint: "30% ของเงินได้ ไม่เกิน 500,000" },
    ssf:           { label: "SSF", group: "เกษียณ", cap: 200000, pct: 0.30, hint: "30% ของเงินได้ ไม่เกิน 200,000" },
    thaiesg:       { label: "Thai ESG", group: "กองทุน", cap: 300000, pct: 0.30, hint: "30% ของเงินได้ ไม่เกิน 300,000 (เงื่อนไขปี 2568)" },
    home_interest: { label: "ดอกเบี้ยเงินกู้ซื้อที่อยู่อาศัย", group: "บ้าน", cap: 100000, hint: "ไม่เกิน 100,000" },
    other:         { label: "อื่น ๆ (เช่น ช้อปลดหย่อน)", group: "อื่น ๆ", hint: "ใส่ตามเงื่อนไขปีนั้น" },
    donation_edu:  { label: "บริจาคการศึกษา / กีฬา / รพ.รัฐ (2 เท่า)", group: "บริจาค", hint: "หักได้ 2 เท่า ไม่เกิน 10% ของเงินได้หลังหักลดหย่อน" },
    donation:      { label: "บริจาคทั่วไป", group: "บริจาค", hint: "ไม่เกิน 10% ของเงินได้หลังหักลดหย่อน" }
  };
  const SDEF = { method: "flat", actual_h1: 0, actual_y: 0, paid94: null };

  function progressive(net) {
    const br = [[150000,0],[300000,.05],[500000,.10],[750000,.15],[1000000,.20],[2000000,.25],[5000000,.30],[Infinity,.35]];
    let tax = 0, prev = 0;
    for (const [cap, r] of br) { if (net <= prev) break; tax += (Math.min(net, cap) - prev) * r; prev = cap; }
    return tax;
  }
  const yr = d => Number(String(d).slice(0, 4));
  const sum = (a, f) => a.reduce((t, x) => t + (Number(typeof f === "function" ? f(x) : x[f]) || 0), 0);
  const settings = y => Object.assign({}, SDEF, st.settings[y] || {});

  function compute(year) {
    const s = settings(year);
    const rent = st.rent.filter(e => yr(e.received_date) === year);
    const rentH1 = rent.filter(e => Number(e.received_date.slice(5, 7)) <= 6);
    const inc = st.income.filter(e => yr(e.received_date) === year);
    const ded = st.deductions.filter(d => d.tax_year === year);
    const flat = s.method !== "actual";

    // ----- เงินได้ -----
    // ประมาณการทั้งปี (ถ้ากรอก) ใช้แทนเงินเดือน/โบนัสรายการย่อย
    const est = st.estimates[year], usingEst = !!(est && Number(est.salary) > 0);
    const is40_1 = e => e.type === "salary" || e.type === "bonus";
    const incUsed = usingEst ? inc.filter(e => !is40_1(e)) : inc;
    const i1 = usingEst ? Number(est.salary) : sum(inc.filter(is40_1), "amount");
    const i2 = sum(inc.filter(e => e.type === "40_2"), "amount");
    const iO = sum(inc.filter(e => e.type === "other"), "amount");
    const g1 = sum(rentH1, "amount"), gY = sum(rent, "amount");
    const e1 = flat ? g1 * 0.3 : Number(s.actual_h1) || 0, eY = flat ? gY * 0.3 : Number(s.actual_y) || 0;
    const exp12 = Math.min((i1 + i2) * 0.5, 100000);
    const totalIncome = i1 + i2 + iO + gY;
    const ssoSlip = usingEst ? Number(est.sso) || 0 : sum(inc, "sso");

    // ----- ลดหย่อน -----
    const byCat = {}; ded.forEach(d => { byCat[d.category] = (byCat[d.category] || 0) + (Number(d.amount) || 0); });
    const raw = c => byCat[c] || 0;
    const allow = {};   // category -> allowed
    allow.personal = 60000;
    for (const c of ["spouse", "child", "parent", "disabled", "health_parent", "home_interest", "other"]) {
      const cap = DED[c].cap; allow[c] = cap ? Math.min(raw(c), cap) : raw(c);
    }
    allow.sso = raw("sso") + ssoSlip;
    allow.health = Math.min(raw("health"), 25000);
    allow.life = Math.min(raw("life"), 100000 - allow.health);
    const pctCap = c => Math.min(raw(c), DED[c].cap, DED[c].pct * (c === "pvd" ? i1 : totalIncome));
    let retire = ["pension_ins", "pvd", "rmf", "ssf"].map(c => [c, pctCap(c)]);
    let room = 500000;   // เพดานรวมกลุ่มเกษียณ
    retire.forEach(([c, v]) => { allow[c] = Math.min(v, room); room -= allow[c]; });
    allow.thaiesg = pctCap("thaiesg");
    const nonDon = Object.values(allow).reduce((a, b) => a + b, 0);
    const beforeDon = Math.max(0, totalIncome - exp12 - eY - nonDon);
    allow.donation_edu = Math.min(raw("donation_edu") * 2, beforeDon * 0.1);
    allow.donation = Math.min(raw("donation"), Math.max(0, (beforeDon - allow.donation_edu) * 0.1));
    const dedTotal = nonDon + allow.donation_edu + allow.donation;

    // ----- ภ.ง.ด.90 -----
    const minTax = base => { const nonSalary = i2 + iO + gY; let t = progressive(base), m = "อัตราก้าวหน้า";
      if (nonSalary >= 120000) { const h = nonSalary * 0.005; if (h > 5000 && h > t) { t = h; m = "0.5% ของเงินได้"; } } return { tax: t, method: m }; };
    const net90 = Math.max(0, totalIncome - exp12 - eY - dedTotal);
    const t90 = minTax(net90);
    const noRent = progressive(Math.max(0, i1 + i2 + iO - exp12 - dedTotal));
    const whtInc = sum(incUsed, "wht") + (usingEst ? Number(est.wht) || 0 : 0), whtRent = sum(rent, "wht"), whtRentH1 = sum(rentH1, "wht");

    // ----- ภ.ง.ด.94 (ค่าเช่าครึ่งปีแรก) ลดหย่อนครึ่งหนึ่งของส่วนตัว/ครอบครัว -----
    const ded94 = 30000 + (allow.spouse + allow.child + allow.parent + allow.disabled) / 2;
    const net94 = Math.max(0, g1 - e1 - ded94);
    let tax94 = progressive(net94), m94 = "อัตราก้าวหน้า";
    if (g1 >= 120000) { const h = g1 * 0.005; if (h > 5000 && h > tax94) { tax94 = h; m94 = "0.5% ของเงินได้"; } }
    const due94 = Math.max(0, tax94 - whtRentH1);
    const paid94 = s.paid94 === null || s.paid94 === undefined || s.paid94 === "" ? due94 : Number(s.paid94);
    const due90 = t90.tax - whtInc - whtRent - paid94;

    return { year, s, flat, usingEst, est, rent, rentH1, inc, ded, byCat, allow, ssoSlip,
      i1, i2, iO, g1, gY, e1, eY, exp12, totalIncome, dedTotal,
      h1: { count: rentH1.length, net: net94, tax: tax94, method: m94, wht: whtRentH1, due: due94, ded: ded94 },
      y: { net: net90, tax: t90.tax, method: t90.method, whtInc, whtRent, paid94, due: due90, rentTax: t90.tax - noRent } };
  }

  // ----- การ์ดสรุป (ใช้ร่วมทุกแท็บภาษี) -----
  function chip(deadline, label) {
    const d = Math.ceil((deadline - today) / 864e5);
    if (d < 0) return `<span class="chip past">พ้นกำหนดแล้ว</span>`;
    if (d <= 45) return `<span class="chip soon">อีก ${d} วัน</span>`;
    return `<span class="chip open">${label}</span>`;
  }
  function summaryHTML(year) {
    const c = compute(year), B = be(year), h = c.h1, y = c.y;
    const line = (k, v, cls = "") => `<dt class="${cls}">${k}</dt><dd class="${cls}">${v}</dd>`;
    return `
    <article class="card taxcard">
      <div class="spread"><div><div class="code">ภ.ง.ด.94</div><div class="small muted">ค่าเช่า ม.ค.–มิ.ย. ${B} · ยื่น 1 ก.ค.–30 ก.ย. ${B}</div></div>${chip(new Date(year, 8, 30, 23, 59), "ยังไม่ถึงกำหนด")}</div>
      <dl class="kv">
        ${line(`ค่าเช่าที่ได้รับ (${h.count} รายการ)`, fmt(c.g1))}
        ${line(`หักค่าใช้จ่าย${c.flat ? "เหมา 30%" : "ตามจริง"}`, "−" + fmt(c.e1))}
        ${line("หักลดหย่อน (ครึ่งปี)", "−" + fmt(h.ded))}<div class="sep"></div>
        ${line("เงินได้สุทธิ", fmt(h.net))}
        ${line(`ภาษี (${h.method})`, fmt(h.tax))}
        ${line("ผู้เช่าหัก ณ ที่จ่าย", "−" + fmt(h.wht))}
        ${line("ต้องชำระโดยประมาณ", fmt(h.due), "total")}
      </dl>
      <p class="small muted" style="margin:0">${c.g1 > 60000 ? "เงินได้ครึ่งปีเกิน 60,000 ต้องยื่น (คนโสด)" : "เงินได้ครึ่งปีไม่เกิน 60,000 คนโสดไม่ต้องยื่น"}${h.due >= 3000 ? " · ผ่อนชำระได้ 3 งวด" : ""}</p>
    </article>
    <article class="card taxcard">
      <div class="spread"><div><div class="code">ภ.ง.ด.90</div><div class="small muted">เงินได้ทั้งปี ${B} · ยื่นภายใน 31 มี.ค. ${B + 1}</div></div>${chip(new Date(year + 1, 2, 31, 23, 59), "รอสิ้นปี")}</div>
      <dl class="kv">
        ${c.i1 ? line(`เงินเดือน / โบนัส 40(1)${c.usingEst ? " (ประมาณการ)" : ""}`, fmt(c.i1)) : ""}
        ${c.i2 ? line("ค่าจ้าง / ฟรีแลนซ์ 40(2)", fmt(c.i2)) : ""}
        ${c.i1 + c.i2 ? line("หักค่าใช้จ่าย 50% (ไม่เกิน 1 แสน)", "−" + fmt(c.exp12)) : ""}
        ${line("ค่าเช่า 40(5)", fmt(c.gY))}
        ${line(`หักค่าใช้จ่ายค่าเช่า${c.flat ? "เหมา 30%" : "ตามจริง"}`, "−" + fmt(c.eY))}
        ${c.iO ? line("เงินได้อื่น", fmt(c.iO)) : ""}
        ${line(`หักลดหย่อน <a href="#deduct" class="small">ดูรายการ</a>`, "−" + fmt(c.dedTotal))}<div class="sep"></div>
        ${line("เงินได้สุทธิ", fmt(y.net))}
        ${line(`ภาษี (${y.method})`, fmt(y.tax))}
        ${y.whtInc ? line("ภาษีหัก ณ ที่จ่าย (เงินได้)", "−" + fmt(y.whtInc)) : ""}
        ${line("ผู้เช่าหัก ณ ที่จ่าย", "−" + fmt(y.whtRent))}
        ${line("จ่ายไปแล้วใน ภ.ง.ด.94", "−" + fmt(y.paid94))}
        ${line(y.due < 0 ? "ขอคืนภาษีโดยประมาณ" : "ต้องชำระเพิ่มโดยประมาณ", fmt(Math.abs(y.due)), "total")}
      </dl>
      ${c.i1 + c.i2 + c.iO ? `<p class="small" style="margin:0">ภาษีที่เพิ่มขึ้นเพราะค่าเช่า ≈ <b>${fmt(y.rentTax)}</b> บาท/ปี (เดือนละ ≈ ${fmt0(y.rentTax / 12)})</p>`
        : `<p class="small muted" style="margin:0">ยังไม่มีเงินได้อื่น <a href="#income">บันทึกเงินเดือนในแท็บเงินได้</a> เพื่อประมาณการให้ใกล้จริง</p>`}
    </article>`;
  }

  function yearsAvailable() {
    const ys = new Set([today.getFullYear(), st.year]);
    st.rent.forEach(e => ys.add(yr(e.received_date))); st.income.forEach(e => ys.add(yr(e.received_date)));
    st.deductions.forEach(d => ys.add(d.tax_year));
    return [...ys].sort((a, b) => b - a);
  }
  function renderShared() {
    document.querySelectorAll(".taxsum").forEach(el => { el.innerHTML = summaryHTML(st.year); });
    const opts = yearsAvailable().map(y => `<option value="${y}" ${y === st.year ? "selected" : ""}>${be(y)}</option>`).join("");
    document.querySelectorAll("select.yearSel").forEach(sel => { sel.innerHTML = opts; });
  }
  function emit() { renderShared(); subs.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }

  async function load() {
    if (loading) return loading;
    loading = (async () => {
      const [r, s, i, d, e] = await Promise.all([
        db.from("rent_entries").select("*").order("received_date"),
        db.from("rent_settings").select("*"),
        db.from("income_entries").select("*").order("received_date"),
        db.from("deduction_items").select("*").order("created_at"),
        db.from("income_estimates").select("*")
      ]);
      st.errors = [r, s, i, d, e].filter(x => x.error).map(x => dbErr(x.error));
      if (st.errors.length) banner("โหลดข้อมูลบางส่วนไม่ได้: " + st.errors[0] + " (รัน SQL ใน supabase/ ครบแล้วหรือยัง?)");
      st.rent = r.data || []; st.income = i.data || []; st.deductions = d.data || [];
      st.estimates = {}; (e.data || []).forEach(x => st.estimates[x.tax_year] = x);
      st.settings = {}; (s.data || []).forEach(x => st.settings[x.tax_year] = x);
      st.loaded = true; emit();
    })();
    return loading;
  }
  function reset() { loading = null; st.loaded = false; st.rent = []; st.income = []; st.deductions = []; st.settings = {}; st.estimates = {}; }

  // อัปเดตรายการในหน่วยความจำ แล้วแจ้งทุกแท็บ
  function upsertLocal(list, row) { const a = st[list], i = a.findIndex(x => x.id === row.id); if (i >= 0) a[i] = row; else a.push(row); emit(); }
  function removeLocal(list, id) { st[list] = st[list].filter(x => x.id !== id); emit(); }
  function setYear(y) { st.year = Number(y); emit(); }

  document.addEventListener("change", e => { if (e.target.matches("select.yearSel")) setYear(e.target.value); });

  return { st, INCOME_TYPES, DED, settings, compute, load, reset, emit, on: fn => subs.add(fn), upsertLocal, removeLocal, setYear, progressive };
})();
