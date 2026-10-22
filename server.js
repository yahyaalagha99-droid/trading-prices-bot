import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const APP_NAME = "Yahya AI";
const DEVELOPER_NAME = "Yahya Kurdish";
const API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-20b";

// ================== [إضافة جديدة #1] إعدادات الوقت والطقس ==================
// عدّل هنا فقط لو تريد تغيّر المدينة أو المنطقة الزمنية أو توقف الطقس
const DEFAULT_CITY = "بغداد";            // المدينة الافتراضية للطقس
const DEFAULT_TZ = "Asia/Baghdad";       // بغداد / أربيل / البصرة / الموصل = UTC+3
const TZ_LABEL = "بغداد";                // الاسم اللي يظهر للمستخدم
const USE_CLIENT_IP = true;              // true = يعرف مدينة المستخدم من IP تلقائياً
const ENABLE_QUICK_COMMANDS = true;      // true = تشغيل /وقت /تاريخ /طقس
const CACHE_TTL = 600 * 1000;            // كاش الطقس: 10 دقائق
const HTTP_TIMEOUT = 6000;               // مهلة طلب الطقس: 6 ثواني
// ==========================================================================

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "Frontend")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Frontend", "index.html"), (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, "index.html"));
    }
  });
});

const DEV_QUESTIONS = [
  "who created you", "who made you", "who is your developer", "who built you",
  "منو صانعك", "منو المطور", "من هو المطور", "من هو صانعك",
  "کێ دروستت کرد", "کێ داهاتووە", "کێ پەرەی پێداوی"
];

function isIdentityQuestion(text = "") {
  const t = String(text).toLowerCase().trim();
  return DEV_QUESTIONS.some((q) => t.includes(q));
}

// ======== [إضافة جديدة #2] وحدة المعلومات الحيّة (وقت + طقس) ========
// كلها بلا أي مكتبة خارجية وبلا API Key.

const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const KU_DAYS = ["یەکشەممە", "دووشەممە", "سێشەممە", "چوارشەممە", "پێنجشەممە", "هەینی", "شەممە"];
const EN_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const EN_DAY_IDX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const AR_MONTHS = [null, "كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران",
  "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"];
const KU_MONTHS = [null, "کانونی دووەم", "شوبات", "ئازار", "نیسان", "ئایار", "حوزەیران",
  "تەمموز", "ئاب", "ئەیلوول", "تشرینی یەکەم", "تشرینی دووەم", "کانونی یەکەم"];
const EN_MONTHS = [null, "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

// رموز WMO للطقس: [عربي، كردي، إنجليزي]
const WMO = {
  0: ["صحو", "ساف", "Clear sky"], 1: ["صحو غالباً", "زۆربەی ساف", "Mainly clear"],
  2: ["غائم جزئياً", "هەوری بەشەکی", "Partly cloudy"], 3: ["غائم", "هەور", "Overcast"],
  45: ["ضباب", "تەم", "Fog"], 48: ["ضباب متجمّد", "تەمی سەهۆڵ", "Rime fog"],
  51: ["رشّ خفيف", "نمەبارانی کەم", "Light drizzle"], 53: ["رشّ", "نمەباران", "Drizzle"],
  55: ["رشّ كثيف", "نمەبارانی زۆر", "Dense drizzle"],
  56: ["رشّ متجمّد", "نمەبارانی سەهۆڵ", "Light freezing drizzle"],
  57: ["رشّ متجمّد كثيف", "نمەبارانی سەهۆڵی زۆر", "Dense freezing drizzle"],
  61: ["مطر خفيف", "بارانی سووک", "Slight rain"], 63: ["مطر", "باران", "Moderate rain"],
  65: ["مطر غزير", "بارانی توند", "Heavy rain"],
  66: ["مطر متجمّد", "بارانی سەهۆڵ", "Light freezing rain"],
  67: ["مطر متجمّد غزير", "بارانی سەهۆڵی توند", "Heavy freezing rain"],
  71: ["ثلج خفيف", "بەفری سووک", "Slight snow"], 73: ["ثلج", "بەفر", "Moderate snow"],
  75: ["ثلج غزير", "بەفری زۆر", "Heavy snow"], 77: ["ثلج حبيبي", "دەنکە بەفر", "Snow grains"],
  80: ["زخات مطر خفيفة", "نمەبارانی سووک", "Slight rain showers"],
  81: ["زخات مطر", "نمەباران", "Moderate rain showers"],
  82: ["زخات مطر غزيرة", "نمەبارانی توند", "Violent rain showers"],
  85: ["زخات ثلج", "بەفرباران", "Slight snow showers"],
  86: ["زخات ثلج غزيرة", "بەفربارانی زۆر", "Heavy snow showers"],
  95: ["عاصفة رعدية", "ڕەشەبا", "Thunderstorm"],
  96: ["عاصفة رعدية مع برد", "ڕەشەبا لەگەڵ تەرزە", "Thunderstorm with hail"],
  99: ["عاصفة رعدية شديدة", "ڕەشەبای توند", "Severe thunderstorm"]
};
const WMO_IDX = { ar: 0, ku: 1, en: 2 };

const L10N = {
  ar: { wIn: "الطقس في", now: "الحرارة الآن", feels: "محسوسة", hum: "الرطوبة", wind: "الريح",
        today: "اليوم", from: "من", to: "إلى", unit: "كم/س", dir: "بتوقيت", clock: "الساعة",
        morning: "صباحاً", evening: "مساءً", noCity: (c) => `ما لكيت مدينة باسم «${c}»`, err: (e) => `تعذّر جلب الطقس حالياً (${e})` },
  ku: { wIn: "کەشوهەوا لە", now: "پلەی گەرمی ئێستا", feels: "هەست پێدەکرێت", hum: "شێ", wind: "با",
        today: "ئەمڕۆ", from: "لە", to: "بۆ", unit: "کم/ک", dir: "به کاتی", clock: "کاتژمێر",
        morning: "بەیانی", evening: "ئێوارە", noCity: (c) => `شارێک به ناوی «${c}» نەدۆزرایەوە`, err: (e) => `نەتوانرا کەشوهەوا بهێنرێت (${e})` },
  en: { wIn: "Weather in", now: "Temperature", feels: "feels like", hum: "Humidity", wind: "Wind",
        today: "Today", from: "from", to: "to", unit: "km/h", dir: "timezone", clock: "at",
        morning: "AM", evening: "PM", noCity: (c) => `City "${c}" not found`, err: (e) => `Weather unavailable (${e})` }
};

const CITY_NAMES = [
  // العراق
  "بغداد", "أربيل", "البصرة", "الموصل", "النجف", "كربلاء", "السليمانية", "دهوك", "كركوك",
  "الناصرية", "السماوة", "الديوانية", "الحلة", "الرمادي", "بعقوبة", "تكريت", "سامراء",
  "الكوت", "العمارة", "الزبير", "الفلوجة", "هيت", "زاخو", "حلبجة", "جمجمال", "عقرة", "سنجار",
  // الخليج والجزيرة
  "مكة", "المدينة المنورة", "الرياض", "جدة", "الدمام", "أبها", "دبي", "أبوظبي", "الشارقة",
  "العين", "الدوحة", "الكويت", "مسقط", "صلالة", "المنامة", "صنعاء", "عدن", "تعز", "الحديدة",
  // الشام ومصر والسودان
  "دمشق", "حلب", "حمص", "اللاذقية", "بيروت", "طرابلس", "صيدا", "عمان", "الزرقاء", "إربد",
  "القدس", "غزة", "رام الله", "نابلس", "الخليل", "القاهرة", "الإسكندرية", "الجيزة", "أسوان",
  "المنصورة", "طنطا", "الخرطوم", "بورتسودان", "بنغازي", "مصراتة",
  // إيران وتركيا والقوقاز
  "طهران", "أصفهان", "مشهد", "تبريز", "شيراز", "إسطنبول", "أنقرة", "إزمير", "بورصة", "أنطاكية",
  "باكو", "يريفان", "تبليسي",
  // أوروبا
  "لندن", "مانشستر", "برمنغهام", "باريس", "مارسيليا", "ليون", "برلين", "ميونخ", "هامبورغ",
  "فرانكفورت", "كولونيا", "أمستردام", "روتردام", "بروكسل", "روما", "ميلانو", "نابولي",
  "مدريد", "برشلونة", "لشبونة", "ستوكهولم", "أوسلو", "كوبنهاغن", "هلسنكي", "فيينا",
  "زيوريخ", "جنيف", "أثينا", "دبلن", "براغ", "بودابست", "وارسو", "بوخارست", "صوفيا",
  "موسكو", "سانت بطرسبرغ", "كييف", "أوديسا", "مينسك", "بلغراد", "زغرب",
  // أمريكا الشمالية
  "نيويورك", "واشنطن", "بوسطن", "لوس أنجلوس", "سان فرانسيسكو", "شيكاغو", "هيوستن",
  "دالاس", "ميامي", "أورلاندو", "سياتل", "لاس فيغاس", "فينيكس", "أتلانتا", "ديترويت",
  "تورونتو", "فانكوفر", "مونتريال", "كالجاري", "مكسيكو سيتي",
  // آسيا وأوقيانوسيا
  "طوكيو", "أوساكا", "سيول", "بكين", "شنغهاي", "هونغ كونغ", "تايبيه", "سنغافورة",
  "بانكوك", "جاكرتا", "كوالالمبور", "مانيلا", "دلهي", "مومباي", "بنغالور", "كراتشي",
  "لاهور", "إسلام آباد", "كابول", "طشقند", "ألماتي", "سيدني", "ملبورن", "بيرث", "أوكلاند"
];

const cityCache = new Map();
const ipCache = new Map();

/** توحيد النص العربي/الكردي (حذف التشكيل، توحيد الحروف) */
function norm(s) {
  return String(s || "")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/\u0643/g, "\u06A9")                 // ك -> ک
    .replace(/[\u064A\u0649\u0626]/g, "\u06CC")   // ي ى ئ -> ی
    .replace(/\u0624/g, "و")                      // ؤ -> و
    .replace(/[\u0629\u06D5]/g, "ه")              // ة ە -> ه
    .replace(/\u06BE/g, "ه")                      // ھ -> ه
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** يكتشف لغة الرسالة (كردي / إنجليزي / عربي) */
function detectLang(text) {
  const t = String(text || "");
  if (/[a-zA-Z]/.test(t) && !/[\u0600-\u06FF]/.test(t)) return "en";
  if (/[\u06D5\u06CE\u06C6\u0695\u06B5\u06A4\u06C0]/.test(t)) return "ku";
  return "ar";
}

function cachedGet(store, key) {
  const hit = store.get(key);
  if (hit && Date.now() - hit.t < CACHE_TTL) return hit.v;
  return null;
}

function fetchJson(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), HTTP_TIMEOUT);
  return fetch(url, { signal: ctl.signal })
    .then((r) => r.json())
    .finally(() => clearTimeout(timer));
}

/** أجزاء الوقت الحقيقي بتوقيت بغداد (بدون أي مكتبة) */
function nowParts(tz = DEFAULT_TZ) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  const p = {};
  for (const part of dtf.formatToParts(new Date())) p[part.type] = part.value;
  let hour = parseInt(p.hour, 10);
  if (hour === 24) hour = 0;
  return {
    year: +p.year, month: +p.month, day: +p.day, hour,
    minute: +p.minute, second: +p.second,
    weekday: EN_DAY_IDX[p.weekday] ?? new Date().getDay()
  };
}

function pad(n) { return String(n).padStart(2, "0"); }

/** نص عربي فيه اليوم والتاريخ والساعة الحقيقية (بالثانية) */
function getNowText() {
  const n = nowParts();
  const h12 = n.hour % 12 || 12;
  const period = n.hour < 12 ? "صباحاً" : "مساءً";
  return `${AR_DAYS[n.weekday]} ${n.day} ${AR_MONTHS[n.month]} ${n.year} — ` +
         `الساعة ${h12}:${pad(n.minute)}:${pad(n.second)} ${period} (توقيت ${TZ_LABEL})`;
}

/** الطابع الزمني الدقيق ISO مع فرق التوقيت — يفهمه الموديل بأي لغة */
function getNowIso() {
  const n = nowParts();
  // حساب فرق التوقيت بين UTC وتوقيت المنطقة
  const utc = Date.now();
  const local = new Date(`${n.year}-${pad(n.month)}-${pad(n.day)}T${pad(n.hour)}:${pad(n.minute)}:${pad(n.second)}Z`).getTime();
  const diffMin = Math.round((local - utc) / 60000);
  const sign = diffMin >= 0 ? "+" : "-";
  const abs = Math.abs(diffMin);
  return `${n.year}-${pad(n.month)}-${pad(n.day)}T${pad(n.hour)}:${pad(n.minute)}:${pad(n.second)}` +
         `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** وصف مختصر للوقت حسب اللغة (للأوامر السريعة) */
function getNowShort(lang = "ar") {
  const n = nowParts();
  const h12 = n.hour % 12 || 12;
  const time = `${h12}:${pad(n.minute)}`;
  if (lang === "en") {
    return `${EN_DAYS[n.weekday]}, ${n.day} ${EN_MONTHS[n.month]} ${n.year} — ${time} ${n.hour < 12 ? "AM" : "PM"} (${TZ_LABEL})`;
  }
  if (lang === "ku") {
    return `${KU_DAYS[n.weekday]} ${n.day} ${KU_MONTHS[n.month]} ${n.year} — کاتژمێر ${time} ${n.hour < 12 ? "بەیانی" : "ئێوارە"} (${TZ_LABEL})`;
  }
  return `${AR_DAYS[n.weekday]} ${n.day} ${AR_MONTHS[n.month]} ${n.year} — الساعة ${time} ${n.hour < 12 ? "صباحاً" : "مساءً"} (${TZ_LABEL})`;
}

/** الطقس المباشر من Open-Meteo (مجاني وبلا API Key) */
async function getWeather(city = DEFAULT_CITY, lang = "ar") {
  const L = L10N[lang] || L10N.ar;
  const key = norm(city) + "|" + lang;
  const hit = cachedGet(cityCache, key);
  if (hit) return hit;

  let loc;
  try {
    const g = await fetchJson(
      "https://geocoding-api.open-meteo.com/v1/search?count=1&language=ar&name=" +
      encodeURIComponent(city)
    );
    loc = g && g.results && g.results[0];
  } catch (e) {
    return L.err(e.message);
  }
  if (!loc) return L.noCity(city);

  try {
    const d = await fetchJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code` +
      `&daily=temperature_2m_max,temperature_2m_min&timezone=${encodeURIComponent(DEFAULT_TZ)}&forecast_days=1`
    );
    const c = d.current || {};
    const day = d.daily || {};
    const desc = (WMO[c.weather_code] || ["غير معروف", "نەزانراو", "Unknown"])[WMO_IDX[lang] ?? 0];

    let txt = `${L.wIn} ${loc.name}: ${desc}\n` +
      `• ${L.now}: ${c.temperature_2m}° (${L.feels} ${c.apparent_temperature}°)\n` +
      `• ${L.hum}: ${c.relative_humidity_2m}%\n` +
      `• ${L.wind}: ${c.wind_speed_10m} ${L.unit}`;
    if (day.temperature_2m_max && day.temperature_2m_min) {
      txt += `\n• ${L.today}: ${L.from} ${day.temperature_2m_min[0]}° ${L.to} ${day.temperature_2m_max[0]}°`;
    }
    cityCache.set(key, { v: txt, t: Date.now() });
    return txt;
  } catch (e) {
    return L.err(e.message);
  }
}

// كلمات تُطابق كلمة كاملة فقط (تجنّباً لالتقاط جُمَل عادية مثل «الجواب»)
const WEATHER_WORDS = ["طقس", "الطقس", "جو", "الجو", "حراره", "الحراره", "درجه الحراره",
  "مطر", "امطار", "برد", "رطوبه", "ثلج", "رياح", "weather", "temperature",
  "کهشوههوا", "کەشوهەوا", "گەرمی", "باران", "بەفر", "تەمپەراتور"];
const TIME_WORDS = ["وقت", "الوقت", "ساعه", "الساعه", "کاتژمێر", "time", "clock"];
const DATE_WORDS = ["تاريخ", "التاريخ", "يوم", "اليوم", "بهروار", "بەروار", "ڕۆژ", "date", "today"];
// عبارات صريحة (تحتوي مسافة داخلها)
const PHRASES = {
  time: ["كم الساعه", "كم الوقت", "كم الساعه الان", "what time", "چەند کاتژمێر"],
  date: ["كم التاريخ", "شنو اليوم", "ما هو اليوم", "اليوم كم", "what date", "چەند ڕۆژە"],
  weather: ["درجه الحراره", "حاله الطقس", "شلون الجو", "شلون الطقس"]
};

/** مطابقة كلمات كاملة */
function matchWords(n, keys) {
  const words = new Set(n.split(" "));
  return keys.some((k) => words.has(norm(k)));
}
/** مطابقة عبارات صريحة */
function matchPhrases(n, list) {
  return list.some((p) => n.includes(norm(p)));
}

function hasWeatherWord(text) {
  const n = norm(text);
  return matchWords(n, WEATHER_WORDS) || matchPhrases(n, PHRASES.weather);
}

/** يستخرج اسم مدينة من رسالة المستخدم (أو null) */
function extractCity(text) {
  const n = " " + norm(text) + " ";
  let best = null;
  for (const c of CITY_NAMES) {
    const nc = norm(c);
    if (nc && n.includes(nc) && (!best || nc.length > norm(best).length)) best = c;
  }
  if (best) return best;
  if (hasWeatherWord(text)) {
    const m = n.match(/(?:فی|في|له|لە|in)\s+([A-Za-z\u0600-\u06FF-]{3,20})/);
    if (m) return m[1];
  }
  return null;
}

/** يعرف مدينة المستخدم من IP (بلا مفتاح، ويُخزّن مؤقتاً) */
async function cityFromIp(ip) {
  if (!USE_CLIENT_IP || !ip) return null;
  ip = String(ip).split(",")[0].trim();
  if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|0\.)/.test(ip) || ip.length > 45) return null;
  const hit = cachedGet(ipCache, ip);
  if (hit) return hit;
  try {
    const r = await fetchJson(`https://ipwho.is/${ip}`);
    if (r && r.success && r.city) {
      ipCache.set(ip, { v: r.city, t: Date.now() });
      return r.city;
    }
  } catch (e) { /* تجاهل — نرجع للمدينة الافتراضية */ }
  return null;
}

/** هل الرسالة أمر سريع؟ (شرط صارم حتى لا يسرق ردود المحادثة العادية) */
function isQuickCommand(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (t.startsWith("/") || t.startsWith("\\")) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 4) return false;      // الرسائل الطويلة تروح للموديل، ما نسرقها
  const n = norm(t);
  return matchWords(n, TIME_WORDS) || matchWords(n, DATE_WORDS) || matchWords(n, WEATHER_WORDS)
      || matchPhrases(n, PHRASES.time) || matchPhrases(n, PHRASES.date) || matchPhrases(n, PHRASES.weather);
}

/** رد جاهز للأوامر السريعة (/وقت /تاريخ /طقس)، أو null */
async function handleQuickCommand(text, ip = null) {
  if (!text) return null;
  const lang = detectLang(text);
  // ننزع الشرطة \ و / قبل الفحص حتى يعمل الأمر مع السلاش وبدونه
  const clean = String(text).replace(/[/\\]/g, " ");
  const n = norm(clean);

  // الترتيب مهم: الطقس أولاً حتى لا تُسرق جملة مثل «شنو الطقس اليوم» كسؤال تاريخ
  if (hasWeatherWord(clean)) {
    const city = extractCity(clean) || (await cityFromIp(ip)) || DEFAULT_CITY;
    return "🌤️ " + (await getWeather(city, lang));
  }
  if (matchWords(n, TIME_WORDS) || matchPhrases(n, PHRASES.time)) return `🕐 ${getNowShort(lang)}`;
  if (matchWords(n, DATE_WORDS) || matchPhrases(n, PHRASES.date)) return `📅 ${getNowShort(lang)}`;
  return null;
}

/** [إضافة جديدة #3] البرومبت — يحسب الوقت من جديد عند كل رسالة */
async function buildSystemPrompt(userText = "", ip = null) {
  const live = [
    "",
    "LIVE REAL-TIME DATA (authoritative — never guess or invent any number, date or time):",
    `- Current date & time: ${getNowText()}`,
    `- Exact timestamp: ${getNowIso()}`,
    "- Use the data above for ANY question about today's date, the day name, the time or how many hours/days remain."
  ];

  if (hasWeatherWord(userText)) {
    const city = extractCity(userText) || (await cityFromIp(ip)) || DEFAULT_CITY;
    const w = await getWeather(city, detectLang(userText));
    live.push("- Current weather: " + w.replace(/\n/g, " | "));
  }

  live.push("- If asked about live data you were not given (news, prices, events), say clearly that you "
          + "do not have it right now instead of making it up. Never claim to have a clock or internet.");

  return `You are ${APP_NAME}, an advanced AI assistant created by ${DEVELOPER_NAME}.
You support Kurdish, Arabic, and English. Always answer in the same language the user wrote in.
If asked about identity -> say: "The developer is ${DEVELOPER_NAME}."
` + live.join("\n");
}

/** [إضافة جديدة #4] جلب IP المستخدم من رؤوس الطلب */
function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "";
}
// ==================================================================

function extractLastUserMessage(messages = []) {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      const content = messages[i].content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        const textItem = content.find((item) => item.type === "text");
        return textItem ? textItem.text : "";
      }
    }
  }
  return "";
}

app.post("/ask/stream", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY not set in Render" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.write(": connected\n\n");

  const messages = req.body?.messages || [];
  const lastUserText = extractLastUserMessage(messages);
  const clientIp = getClientIp(req);

  if (isIdentityQuestion(lastUserText)) {
    res.write(`data: ${JSON.stringify({ token: `The developer is ${DEVELOPER_NAME}.` })}\n\n`);
    res.write("data: [DONE]\n\n");
    return res.end();
  }

  // ===== [إضافة جديدة #5] الأوامر السريعة: /وقت /تاريخ /طقس =====
  if (ENABLE_QUICK_COMMANDS && isQuickCommand(lastUserText)) {
    try {
      const quick = await handleQuickCommand(lastUserText, clientIp);
      if (quick) {
        res.write(`data: ${JSON.stringify({ token: quick })}\n\n`);
        res.write("data: [DONE]\n\n");
        return res.end();
      }
    } catch (e) { /* نكمل للموديل لو صار خطأ */ }
  }
  // ============================================================

  const formattedMessages = [
    // [معدّل] صار async ويحسب الوقت الحقيقي الآن، مو مرة واحدة عند تشغيل السيرفر
    { role: "system", content: await buildSystemPrompt(lastUserText, clientIp) },
    ...messages
  ];

  try {
    const response = await globalThis.fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: formattedMessages,
        temperature: 0.7,
        max_tokens: 1500,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      res.write(`data: ${JSON.stringify({ error: `API Error ${response.status}:${errText.slice(0, 200)}` })}\n\n`);
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (trimmed.startsWith("data:")) {
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload);
            const token = parsed?.choices?.[0]?.delta?.content || "";
            if (token) {
              res.write(`data: ${JSON.stringify({ token })}\n\n`);
            }
          } catch {}
        }
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`${APP_NAME} running on port ${PORT} 🚀`);
});
