// HOMEXA WhatsApp Bot — QR / Linked Devices se connect hota hai
const express = require("express");
const QRCode = require("qrcode");
const pino = require("pino");
const {
  default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion,
  BufferJSON, initAuthCreds, proto,
} = require("@whiskeysockets/baileys");

const PORT = process.env.PORT || 3000;
const PAIR_PHONE = (process.env.PAIR_PHONE || "").replace(/\D/g, ""); // optional: 919XXXXXXXXX
const OWNER = (process.env.OWNER || "918235867775") + "@s.whatsapp.net"; // naye booking ki alert yahan
const DB = "https://bbbb-1290c-default-rtdb.firebaseio.com/homexa";

const FB_SECRET = process.env.FB_SECRET || ""; // Firebase database secret (session surakshit rakhne ke liye)
const fb = (m, p, b) =>
  fetch(DB + p + ".json" + (FB_SECRET ? "?auth=" + encodeURIComponent(FB_SECRET) : ""), { method: m, body: b == null ? undefined : JSON.stringify(b) })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);

// ---------- Services ----------
let S = {
  1: "❄️ AC Service & Repair", 2: "🧊 Fridge Repair", 3: "🌀 Washing Machine Repair",
  4: "🚿 Geyser Repair", 5: "❄️ Cooler Repair", 6: "🛠️ AC Installation / Uninstallation",
  7: "💨 AC Gas Charging & Deep Cleaning", 8: "🚰 Water Tank Cleaning (सिर्फ ₹750)",
  9: "💧 ARO Service & Repairing", 10: "📺 TV Repair (सभी कंपनी)",
  11: "🍳 Chimney Service & Repairing", 12: "🟩 Carpet / Grass Mat / Door Mat Installation",
  13: "🏠 Wallpaper, Vinyl Flooring & PVC Panel",
};
async function refreshServices() {
  const o = await fb("GET", "/services");
  if (!o) return;
  const a = Array.isArray(o) ? o.filter(Boolean) : Object.values(o);
  const n = {};
  a.filter((x) => x.on !== 0).forEach((x) => (n[x.n] = x.name));
  if (Object.keys(n).length) S = n;
}
const nm = (v) => String(v).replace(/^[^\p{L}\p{N}(]+\s*/u, "");

// ---------- Texts ----------
let L = {}; // per-user language: jid -> "hi" | "en"
const T = (j, h, e) => (L[j] === "en" ? e : h);
const AREAS = ["Motihari", "Dhaka", "Raxaul", "Areraj", "Kotwa", "Ghorasahan"];
const days = (j) =>
  [T(j, "आज", "Today"), T(j, "कल", "Tomorrow"), T(j, "परसों", "Day after")].map((n, i) => {
    const x = new Date(); x.setDate(x.getDate() + i);
    return n + " (" + x.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + ")";
  });
const slots = (j) => (L[j] === "en" ? ["Morning 9-12", "Afternoon 12-3", "Evening 3-6"] : ["सुबह 9-12", "दोपहर 12-3", "शाम 3-6"]);
const probs = (j) => (L[j] === "en" ? ["Not working", "Leakage", "Noise", "Need inspection"] : ["Not working", "Leakage", "Noise", "Inspection चाहिए"]);
const list = (a) => a.map((x, i) => `${i + 1}️⃣ ${x}`).join("\n");
const pickOpt = (a, x) => { const n = parseInt(x, 10); return n >= 1 && n <= a.length && String(n) === x.trim() ? a[n - 1] : x.trim(); };

const menuText = () =>
  "🙏 नमस्ते! HOMEXA Repairing & Service Centre में आपका स्वागत है।\n\nकृपया नीचे दी गई *SERVICE* चुनें और उसका Number भेजें।\n\n📢 *OUR SERVICES* 📢\n━━━━━━━━━━━━━━\n" +
  Object.entries(S).map(([k, v]) => k + "️⃣ " + v).join("\n\n") +
  "\n━━━━━━━━━━━━━━\n📍 Service Area: Motihari & Nearby Area\n\n_Status लिखें = मेरी बुकिंग | Call लिखें = संपर्क_";

// ---------- Chat state machine ----------
const SESS = new Map(); // jid -> {st, d}
const sess = (j) => { if (!SESS.has(j)) SESS.set(j, { st: "start", d: {} }); return SESS.get(j); };

async function handle(sock, jid, text) {
  const s = sess(jid), x = text.trim(), q = x.toLowerCase();
  const say = (t) => sock.sendMessage(jid, { text: t });
  const askLang = async () => { s.st = "lang"; s.d = {}; return say("भाषा चुनें / Select Language\n\n1️⃣ हिन्दी\n2️⃣ English"); };
  const showMenu = async () => { s.st = "menu"; s.d = {}; return say(menuText()); };

  if (["hi", "hello", "hii", "hey", "namaste", "नमस्ते", "start", "0"].includes(q)) return askLang();
  if (["menu", "मेन्यू"].includes(q)) return showMenu();
  if (["cancel", "रद्द"].includes(q)) { s.st = "menu"; s.d = {}; return say(T(jid, "बुकिंग रद्द की गई। *Menu* लिखें।", "Booking cancelled. Type *Menu*.")); }
  if (["call", "contact", "number", "फोन"].includes(q)) return say("📞 Call: 8207581060\n💬 WhatsApp: 8235867775\n📍 Motihari & Nearby Area");
  if (["status", "track", "बुकिंग", "मेरी बुकिंग"].includes(q)) {
    const all = (await fb("GET", "/bookings")) || {};
    const mine = Object.values(all).filter((b) => b && b.wa === jid).slice(-3);
    if (!mine.length) return say(T(jid, "अभी कोई बुकिंग नहीं मिली।", "No bookings found."));
    return say("📋 *Your bookings*\n\n" + mine.map((b) => `🆔 ${b.id}\n${nm(b.svc)}\n${b.date} • ${b.slot}\nStatus: ${b.status || "Pending"}`).join("\n\n"));
  }

  switch (s.st) {
    case "lang":
      if (["2", "english", "en"].includes(q)) L[jid] = "en";
      else if (["1", "hindi", "हिन्दी", "हिंदी"].includes(q)) L[jid] = "hi";
      else return askLang();
      return showMenu();

    case "menu": case "done": case "start":
      if (S[q]) {
        s.d = { svc: nm(S[q]), k: +q }; s.st = "name";
        return say(T(jid, `आपने चुना: *${s.d.svc}*\n\n👤 कृपया अपना *नाम* बताइए:`, `You selected: *${s.d.svc}*\n\n👤 Please tell us your *name*:`));
      }
      return askLang();

    case "name":
      if (x.length < 2) return say(T(jid, "कृपया सही नाम लिखें:", "Please enter a valid name:"));
      s.d.name = x; s.st = "area";
      return say(T(jid, `धन्यवाद ${x} जी 🙏\n\n📍 आपका *एरिया* चुनें (नंबर) या लिखें:\n\n`, `Thank you ${x}!\n\n📍 Select (number) or type your *area*:\n\n`) + list(AREAS));

    case "area":
      s.d.area = pickOpt(AREAS, x); s.st = "addr";
      return say(T(jid, "🏠 अपना *पूरा पता / लैंडमार्क* लिखिए:", "🏠 Enter your *full address / landmark*:"));

    case "addr":
      if (x.length < 4) return say(T(jid, "कृपया पूरा पता लिखें:", "Please enter the full address:"));
      s.d.addr = x; s.st = "date";
      return say(T(jid, "📅 सर्विस *कब* चाहिए?\n\n", "📅 *When* do you need the service?\n\n") + list(days(jid)));

    case "date":
      s.d.date = pickOpt(days(jid), x); s.st = "slot";
      return say(T(jid, "⏰ कौन सा *समय* ठीक रहेगा?\n\n", "⏰ Which *time slot* suits you?\n\n") + list(slots(jid)));

    case "slot":
      s.d.slot = pickOpt(slots(jid), x); s.st = "prob";
      return say(T(jid, "🔧 *समस्या* क्या है? (नंबर चुनें या लिखें)\n\n", "🔧 What is the *problem*? (number or type)\n\n") + list(probs(jid)));

    case "prob":
      s.d.prob = pickOpt(probs(jid), x); s.st = "phone";
      return say(T(jid, "📱 अपना *मोबाइल नंबर* (10 अंक) भेजिए:", "📱 Send your *mobile number* (10 digits):"));

    case "phone": {
      const p = x.replace(/\D/g, "").slice(-10);
      if (p.length !== 10) return say(T(jid, "⚠️ कृपया सही 10 अंकों का नंबर लिखें:", "⚠️ Please enter a valid 10-digit number:"));
      s.d.phone = p; s.st = "confirm"; const d = s.d;
      return say(T(jid, "✅ *कृपया जांच लें:*", "✅ *Please check:*") +
        `\n\n🔧 ${d.svc}\n👤 ${d.name}\n📱 ${d.phone}\n📍 ${d.area}, ${d.addr}\n📅 ${d.date} • ${d.slot}\n⚠️ ${d.prob}\n\n` +
        T(jid, "Booking Confirm करें?\n1️⃣ हाँ, कन्फर्म\n2️⃣ नहीं, रद्द", "Confirm booking?\n1️⃣ Yes, Confirm\n2️⃣ No, Cancel"));
    }

    case "confirm": {
      if (["1", "yes", "y", "haan", "हाँ", "हां", "ok", "confirm"].includes(q)) {
        const d = s.d; d.id = "HX" + Date.now().toString().slice(-6);
        const b = { ...d, ts: Date.now(), status: "Pending", wa: jid, sid: jid };
        fb("PUT", "/bookings/" + d.id, b);
        s.st = "done";
        sock.sendMessage(OWNER, { text: `🆕 *Naya Booking ${d.id}*\n🔧 ${d.svc}\n👤 ${d.name} • ${d.phone}\n📍 ${d.area}, ${d.addr}\n📅 ${d.date} • ${d.slot}\n⚠️ ${d.prob}` }).catch(() => {});
        return say(T(jid, "🎉 *बुकिंग Confirm हो गई!*", "🎉 *Booking confirmed!*") +
          `\n\n🆔 Booking ID: *${d.id}*\n🔧 ${d.svc}\n📅 ${d.date} • ${d.slot}\n\n` +
          T(jid, "हमारी टीम जल्दी आपसे संपर्क करेगी।\n\n🙏 धन्यवाद!", "Our team will contact you shortly.\n\n🙏 Thank you!") +
          "\n*HOMEXA* — " + T(jid, "आपके भरोसे, हमारी सेवा", "Better Service, Better Result") + "\n\n_Menu | Status_");
      }
      if (["2", "no", "n", "nahi", "नहीं"].includes(q)) { s.st = "menu"; s.d = {}; return say(T(jid, "ठीक है, बुकिंग रद्द। *Menu* लिखें।", "Okay, cancelled. Type *Menu*.")); }
      return say(T(jid, "कृपया 1 (हाँ) या 2 (नहीं) भेजें।", "Please send 1 (Yes) or 2 (No)."));
    }
  }
  return askLang();
}


// ---------- Session Firebase me (restart/redeploy par QR dobara nahi) ----------
async function useFirebaseAuth() {
  const base = "/wa_auth";
  const enc = (v) => JSON.parse(JSON.stringify(v, BufferJSON.replacer));
  const dec = (v) => JSON.parse(JSON.stringify(v), BufferJSON.reviver);
  const k = (id) => String(id).replace(/[.#$\/\[\]]/g, "_");
  const stored = await fb("GET", base + "/creds");
  const creds = stored ? dec(stored) : initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const out = {};
          await Promise.all(ids.map(async (id) => {
            let v = await fb("GET", `${base}/keys/${type}/${k(id)}`);
            if (v) { v = dec(v); if (type === "app-state-sync-key") v = proto.Message.AppStateSyncKeyData.fromObject(v); }
            out[id] = v || undefined;
          }));
          return out;
        },
        set: async (data) => {
          const upd = {};
          for (const type in data) for (const id in data[type]) { const v = data[type][id]; upd[`${type}/${k(id)}`] = v ? enc(v) : null; }
          if (Object.keys(upd).length) await fb("PATCH", base + "/keys", upd);
        },
      },
    },
    saveCreds: () => fb("PUT", base + "/creds", enc(creds)),
  };
}
async function getAuth() {
  if (FB_SECRET) return useFirebaseAuth();
  console.log("⚠️ FB_SECRET nahi mila — session local ./auth me rahega (free hosting par restart me mit sakta hai).");
  return useMultiFileAuthState("./auth");
}

// ---------- WhatsApp connection ----------
let qrDataUrl = null, status = "starting", pairCode = null;

async function connect() {
  const { state, saveCreds } = await getAuth();
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({ version, auth: state, logger: pino({ level: "silent" }), browser: ["HOMEXA Bot", "Chrome", "1.0"], printQRInTerminal: false });
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      status = "scan";
      qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 1 });
      if (PAIR_PHONE && !sock.authState.creds.registered && !pairCode) {
        try { pairCode = await sock.requestPairingCode(PAIR_PHONE); console.log("PAIR CODE:", pairCode); } catch (e) { console.log("pair err", e.message); }
      }
    }
    if (connection === "open") { status = "connected"; qrDataUrl = null; pairCode = null; console.log("✅ WhatsApp connected"); refreshServices(); }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) { status = "logged_out"; console.log("Logged out. ./auth folder delete karke dubara chalayein."); }
      else { status = "reconnecting"; setTimeout(connect, 3000); }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const m of messages) {
      try {
        const jid = m.key.remoteJid;
        if (!m.message || m.key.fromMe || !jid || jid.endsWith("@g.us") || jid === "status@broadcast") continue;
        const text = m.message.conversation || m.message.extendedTextMessage?.text || "";
        if (!text.trim()) continue;
        await sock.sendPresenceUpdate("composing", jid);
        await handle(sock, jid, text);
      } catch (e) { console.log("msg error:", e.message); }
    }
  });
}

// ---------- QR page ----------
const app = express();
app.get("/ping", (_, r) => r.send("ok"));
app.get("/status", (_, r) => r.json({ status, qr: qrDataUrl, pairCode }));
app.get("/", (_, r) => r.send(`<!doctype html><html lang="hi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HOMEXA • WhatsApp Setup</title>
<style>body{font-family:system-ui,sans-serif;background:#efeae2;margin:0;display:grid;place-items:center;min-height:100vh;color:#111b21}
.c{background:#fff;border-radius:16px;padding:24px;max-width:380px;width:92%;text-align:center;box-shadow:0 4px 18px rgba(0,0,0,.12)}
h2{margin:0 0 6px;color:#008069}ol{text-align:left;font-size:14.5px;line-height:1.7;padding-left:20px}
img{width:260px;max-width:100%}.ok{font-size:48px}.code{font-size:30px;letter-spacing:4px;font-weight:700;background:#f0f2f5;border-radius:10px;padding:10px}</style>
<div class="c"><h2>HOMEXA WhatsApp Setup</h2><div id="box">Loading…</div></div>
<script>
const steps='<ol><li>अपने फोन में <b>WhatsApp</b> खोलें</li><li><b>Settings → Linked Devices</b></li><li><b>Link a Device</b> दबाएँ</li><li>इस QR को स्कैन करें</li></ol>';
async function tick(){try{const o=await (await fetch("/status")).json(),b=document.getElementById("box");
if(o.status=="connected")b.innerHTML='<div class="ok">✅</div><p><b>Setup हो गया!</b><br>अब बॉट आपके WhatsApp पर चल रहा है।</p>';
else if(o.qr)b.innerHTML='<img src="'+o.qr+'">'+(o.pairCode?'<p>या <b>Link with phone number</b> में यह कोड डालें:</p><div class="code">'+o.pairCode+'</div>':'')+steps;
else if(o.status=="logged_out")b.innerHTML='<p>Logged out. <code>auth</code> फोल्डर delete करके बॉट दोबारा चलाएँ।</p>';
else b.textContent="QR बन रहा है… ("+o.status+")"}catch(e){}}
tick();setInterval(tick,2500);
</script></html>`));

app.listen(PORT, () => console.log("QR page: http://localhost:" + PORT));
connect();
setInterval(refreshServices, 10 * 60 * 1000);
// free hosting par sone se bachane ke liye khud ko ping (Render URL deta hai)
const SELF = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL;
if (SELF) setInterval(() => fetch(SELF + "/ping").catch(() => {}), 10 * 60 * 1000);
