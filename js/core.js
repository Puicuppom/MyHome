// core: Supabase, auth, routing, helpers
const SUPABASE_URL = "https://fmbympgecspgqtnazrbm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtYnltcGdlY3NwZ3F0bmF6cmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA3NDkwOTksImV4cCI6MjA2NjMyNTA5OX0.rqOrNDNRTF7WnDS6utTTKfFoNZKPiMZV_ttqYzYCaJs";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = id => document.getElementById(id);
const TH_M = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const fmt = n => (Number(n) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = n => Math.round(Number(n) || 0).toLocaleString("th-TH");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const be = y => y + 543;
const thDate = iso => { if (!iso) return ""; const [y,m,d] = iso.split("-").map(Number); return `${d} ${TH_M[m-1]} ${String(be(y)).slice(2)}`; };
const thMonth = ym => { if (!ym) return ""; const [y,m] = ym.split("-").map(Number); return `${TH_M[m-1]} ${be(y)}`; };
const dbErr = e => (e && (e.message || e.code)) || "ไม่ทราบสาเหตุ";

function downloadCSV(name, lines) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function banner(msg) { const b = $("appBanner"); b.hidden = !msg; b.textContent = msg || ""; }

const App = {
  user: null,
  modules: {},           // name -> { init(user), show() }
  started: new Set(),
  route() {
    const views = ["loan", "income", "rent", "deduct"];
    const h = location.hash.slice(1), name = views.includes(h) ? h : "loan";
    views.forEach(v => {
      $(v + "View").hidden = v !== name;
      const t = document.querySelector(`.tabs a[href="#${v}"]`); if (t) v === name ? t.setAttribute("aria-current", "page") : t.removeAttribute("aria-current");
    });
    const m = this.modules[name];
    if (m && this.user) {
      if (!this.started.has(name)) { this.started.add(name); m.init(this.user); }
      else if (m.show) m.show();
    }
  },
  setUser(user) {
    const changed = (this.user && this.user.id) !== (user && user.id);
    this.user = user;
    $("loginView").hidden = !!user;
    $("appView").hidden = !user;
    if (!user) { this.started.clear(); if (typeof Tax !== "undefined") Tax.reset(); return; }
    $("userEmail").textContent = user.email || "";
    if (changed) { this.started.clear(); if (typeof Tax !== "undefined") Tax.reset(); }
    this.route();
  }
};

window.addEventListener("hashchange", () => App.route());

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("loginBtn").disabled = true; $("loginMsg").textContent = "";
  const { error } = await db.auth.signInWithPassword({ email: $("loginEmail").value.trim(), password: $("loginPass").value });
  $("loginBtn").disabled = false;
  if (error) $("loginMsg").textContent = error.message === "Invalid login credentials" ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง" : "เข้าสู่ระบบไม่สำเร็จ: " + error.message;
});
$("logoutBtn").addEventListener("click", async () => { await db.auth.signOut(); });

document.addEventListener("DOMContentLoaded", async () => {
  const { data } = await db.auth.getSession();
  App.setUser(data.session ? data.session.user : null);
  db.auth.onAuthStateChange((_ev, session) => App.setUser(session ? session.user : null));
});
