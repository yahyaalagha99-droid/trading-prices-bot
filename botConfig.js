// ملف إعدادات وشخصية MAi Bot الاحترافية مع دعم الطقس والوقت
export const APP_CONFIG = {
  appName: "MAi Bot",
  developerName: "Yahya Kurdish",
  
  // الأسئلة الخاصة بالمطور
  devQuestions: [
    "منو صانعك", "منو مطورك", "منو بناك", "من هو المطور", "من هو صانعك",
    "kê çêkiriye", "کێ دروستی کردووی", "کێ پەرەی پێداوی",
    "who is your developer", "who created you", "who built you"
  ],

  // دالة لجلب الطقس (يمكنك تعديل المدينة حسب رغبتك مثل Erbil, Baghdad, Berlin)
  getWeatherInfo: async () => {
    try {
      // كمثال جلب طقس مدينة أربيل/بغداد أو برلين (تستطيع تغيير اسم المدينة بالإنجليزية)
      const city = "Erbil"; 
      const res = await fetch(`https://wttr.in/${city}?format=%t+%C`);
      if (res.ok) {
        const weatherText = await res.text();
        return `Current weather in ${city}: ${weatherText.trim()}`;
      }
    } catch (e) {
      // في حال عدم توفر الإنترنت مؤقتاً للطقس
      return "Weather data temporarily unavailable";
    }
    return "";
  },

  // دالة لتوليد تعليمات النظام شاملة الوقت والتاريخ والطقس
  getSystemPrompt: async () => {
    const now = new Date();
    const optionsTime = { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hour12: true };
    const currentDate = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
    const currentTime = now.toLocaleTimeString('ar-EG', optionsTime);
    const currentDayName = now.toLocaleDateString('ar-EG', { timeZone: 'Europe/Berlin', weekday: 'long' });

    // جلب الطقس
    const weatherInfo = await APP_CONFIG.getWeatherInfo();

    return `You are MAi Bot, a smart, professional, and advanced AI assistant created by Yahya Kurdish.
Current real-world info: Today is ${currentDayName}, date is ${currentDate}, local time is ${currentTime}.
${weatherInfo}

CORE CAPABILITIES & RULES:
1. Always detect and respond exclusively in the EXACT same language used by the user in their latest message (Arabic, Kurdish, English, German). Do not mix languages.
2. Be concise, accurate, helpful, and polite. 
3. If asked about the weather or temperature, use the provided weather info above.
4. If asked about your identity or creator, proudly state that you were created by Yahya Kurdish.`;
  }
};
