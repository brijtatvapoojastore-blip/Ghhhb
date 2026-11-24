# HOMEXA WhatsApp Bot (QR se setup, mobile se deploy)

## 1) Firebase (ek baar)
- Firebase Console → Realtime Database → **Rules**: `wa_auth` ko public band karein:
  ```
  { "rules": { ".read": true, ".write": true, "wa_auth": { ".read": false, ".write": false } } }
  ```
- Project Settings → Service accounts → **Database secrets** → secret copy karein (ye `FB_SECRET` hai).
  Secret kisi ko na dein, kyunki isse session chura kar aapka WhatsApp use ho sakta hai.

## 2) Render par deploy (mobile browser se)
1. GitHub par repo banakar ye 3 files upload karein: server.js, package.json, README.md
2. render.com → New → **Web Service** → GitHub repo chunein
3. Build: `npm install` | Start: `npm start`
4. Environment Variables: `FB_SECRET=...` aur `PAIR_PHONE=919XXXXXXXXX`
5. Deploy ke baad Render ka link kholein → code/QR dikhega
6. WhatsApp → Settings → Linked Devices → Link a Device → (QR scan) ya **Link with phone number instead** me code daalein

## 3) 24x7 chalane ke liye
- Bot khud ko har 10 min ping karta hai. Saath me uptimerobot.com par free monitor banayein: `https://aapka-link/ping` har 5 min.
- Free plan ki shartein badalti rehti hain; pakka chahiye to paid instance lein.
- Bot ke liye alag SIM/number behtar hai; main phone kam se kam 14 din me ek baar internet se jude.
