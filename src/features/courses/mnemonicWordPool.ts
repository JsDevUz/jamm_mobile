const BASE_WORDS = [
  { en: "river", uz: "daryo", ru: "река" },
  { en: "mountain", uz: "tog'", ru: "гора" },
  { en: "sun", uz: "quyosh", ru: "солнце" },
  { en: "moon", uz: "oy", ru: "луна" },
  { en: "wind", uz: "shamol", ru: "ветер" },
  { en: "stone", uz: "tosh", ru: "камень" },
  { en: "forest", uz: "o'rmon", ru: "лес" },
  { en: "garden", uz: "bog'", ru: "сад" },
  { en: "city", uz: "shahar", ru: "город" },
  { en: "village", uz: "qishloq", ru: "деревня" },
  { en: "school", uz: "maktab", ru: "школа" },
  { en: "market", uz: "bozor", ru: "рынок" },
  { en: "road", uz: "yo'l", ru: "дорога" },
  { en: "sea", uz: "dengiz", ru: "море" },
  { en: "cloud", uz: "bulut", ru: "облако" },
  { en: "snow", uz: "qor", ru: "снег" },
  { en: "spring", uz: "bahor", ru: "весна" },
  { en: "autumn", uz: "kuz", ru: "осень" },
  { en: "winter", uz: "qish", ru: "зима" },
  { en: "summer", uz: "yoz", ru: "лето" },
  { en: "book", uz: "kitob", ru: "книга" },
  { en: "bread", uz: "non", ru: "хлеб" },
  { en: "tea", uz: "choy", ru: "чай" },
  { en: "song", uz: "qo'shiq", ru: "песня" },
  { en: "dream", uz: "orzu", ru: "мечта" },
  { en: "house", uz: "uy", ru: "дом" },
  { en: "room", uz: "xona", ru: "комната" },
  { en: "door", uz: "eshik", ru: "дверь" },
  { en: "window", uz: "oyna", ru: "окно" },
  { en: "table", uz: "stol", ru: "стол" },
  { en: "chair", uz: "stul", ru: "стул" },
  { en: "tree", uz: "daraxt", ru: "дерево" },
  { en: "flower", uz: "gul", ru: "цветок" },
  { en: "fruit", uz: "meva", ru: "фрукт" },
  { en: "bridge", uz: "ko'prik", ru: "мост" },
  { en: "lake", uz: "ko'l", ru: "озеро" },
  { en: "island", uz: "orol", ru: "остров" },
  { en: "meadow", uz: "o'tloq", ru: "луг" },
  { en: "star", uz: "yulduz", ru: "звезда" },
  { en: "lamp", uz: "chiroq", ru: "лампа" },
  { en: "box", uz: "quti", ru: "коробка" },
  { en: "key", uz: "kalit", ru: "ключ" },
  { en: "clock", uz: "soat", ru: "часы" },
  { en: "bell", uz: "qo'ng'iroq", ru: "колокол" },
  { en: "child", uz: "bola", ru: "ребёнок" },
  { en: "friend", uz: "do'st", ru: "друг" },
  { en: "harbor", uz: "bandargoh", ru: "гавань" },
  { en: "bird", uz: "qush", ru: "птица" },
  { en: "horse", uz: "ot", ru: "лошадь" },
  { en: "cat", uz: "mushuk", ru: "кошка" },
  { en: "dog", uz: "it", ru: "собака" },
  { en: "apple", uz: "olma", ru: "яблоко" },
  { en: "pear", uz: "nok", ru: "груша" },
  { en: "grape", uz: "uzum", ru: "виноград" },
  { en: "melon", uz: "qovun", ru: "дыня" },
  { en: "watermelon", uz: "tarvuz", ru: "арбуз" },
  { en: "carrot", uz: "sabzi", ru: "морковь" },
  { en: "potato", uz: "kartoshka", ru: "картофель" },
  { en: "tomato", uz: "pomidor", ru: "помидор" },
  { en: "pepper", uz: "qalampir", ru: "перец" },
  { en: "onion", uz: "piyoz", ru: "лук" },
  { en: "garlic", uz: "sarimsoq", ru: "чеснок" },
  { en: "pencil", uz: "qalam", ru: "карандаш" },
  { en: "notebook", uz: "daftar", ru: "тетрадь" },
  { en: "letter", uz: "maktub", ru: "письмо" },
  { en: "newspaper", uz: "gazeta", ru: "газета" },
  { en: "magazine", uz: "jurnal", ru: "журнал" },
  { en: "picture", uz: "rasm", ru: "картина" },
  { en: "camera", uz: "kamera", ru: "камера" },
  { en: "phone", uz: "telefon", ru: "телефон" },
  { en: "computer", uz: "kompyuter", ru: "компьютер" },
  { en: "screen", uz: "ekran", ru: "экран" },
  { en: "battery", uz: "batareya", ru: "батарея" },
  { en: "pillow", uz: "yostiq", ru: "подушка" },
  { en: "blanket", uz: "ko'rpa", ru: "одеяло" },
  { en: "mirror", uz: "oyna", ru: "зеркало" },
  { en: "bucket", uz: "chelak", ru: "ведро" },
  { en: "basket", uz: "savat", ru: "корзина" },
  { en: "wallet", uz: "hamyon", ru: "кошелёк" },
  { en: "coin", uz: "tanga", ru: "монета" },
  { en: "ticket", uz: "chipta", ru: "билет" },
  { en: "rocket", uz: "raketa", ru: "ракета" },
  { en: "planet", uz: "sayyora", ru: "планета" },
  { en: "engine", uz: "dvigatel", ru: "двигатель" },
  { en: "ship", uz: "kema", ru: "корабль" },
  { en: "train", uz: "poyezd", ru: "поезд" },
  { en: "station", uz: "bekat", ru: "станция" },
  { en: "airport", uz: "aeroport", ru: "аэропорт" },
  { en: "tower", uz: "minora", ru: "башня" },
  { en: "square", uz: "maydon", ru: "площадь" },
  { en: "museum", uz: "muzey", ru: "музей" },
  { en: "theater", uz: "teatr", ru: "театр" },
  { en: "library", uz: "kutubxona", ru: "библиотека" },
  { en: "hospital", uz: "shifoxona", ru: "больница" },
  { en: "factory", uz: "zavod", ru: "завод" },
  { en: "office", uz: "idora", ru: "офис" },
  { en: "teacher", uz: "ustoz", ru: "учитель" },
  { en: "student", uz: "talaba", ru: "студент" },
  { en: "driver", uz: "haydovchi", ru: "водитель" },
  { en: "doctor", uz: "shifokor", ru: "врач" },
  { en: "farmer", uz: "dehqon", ru: "фермер" },
  { en: "actor", uz: "aktyor", ru: "актёр" },
  { en: "painter", uz: "rassom", ru: "художник" },
  { en: "singer", uz: "xonanda", ru: "певец" },
  { en: "worker", uz: "ishchi", ru: "рабочий" },
  { en: "captain", uz: "kapitan", ru: "капитан" },
  { en: "pilot", uz: "uchuvchi", ru: "пилот" },
  { en: "soldier", uz: "askar", ru: "солдат" },
  { en: "farmland", uz: "ekinzor", ru: "пашня" },
  { en: "valley", uz: "vodiy", ru: "долина" },
  { en: "desert", uz: "sahro", ru: "пустыня" },
  { en: "beach", uz: "sohil", ru: "пляж" },
  { en: "waterfall", uz: "sharshara", ru: "водопад" },
  { en: "candle", uz: "sham", ru: "свеча" },
  { en: "ring", uz: "uzuk", ru: "кольцо" },
  { en: "necklace", uz: "marjon", ru: "ожерелье" },
  { en: "button", uz: "tugma", ru: "пуговица" },
  { en: "bottle", uz: "shisha", ru: "бутылка" },
  { en: "plate", uz: "likop", ru: "тарелка" },
  { en: "spoon", uz: "qoshiq", ru: "ложка" },
  { en: "fork", uz: "sanchqi", ru: "вилка" },
  { en: "knife", uz: "pichoq", ru: "нож" },
];

const isSingleWord = (value: string | undefined) =>
  typeof value === "string" && value.trim().length > 0 && !/\s/.test(value.trim());

const WORD_POOL = BASE_WORDS.filter(
  (item) => isSingleWord(item.en) && isSingleWord(item.uz) && isSingleWord(item.ru),
).reduce<Array<{ id: string; en: string; uz: string; ru: string }>>((acc, item, index) => {
  const duplicate = acc.some(
    (existing) =>
      existing.en.toLowerCase() === item.en.toLowerCase() ||
      existing.uz.toLowerCase() === item.uz.toLowerCase() ||
      existing.ru.toLowerCase() === item.ru.toLowerCase(),
  );

  if (duplicate) {
    return acc;
  }

  acc.push({
    ...item,
    en: item.en.trim(),
    uz: item.uz.trim(),
    ru: item.ru.trim(),
    id: `${item.en.trim().toLowerCase()}-${index}`,
  });

  return acc;
}, []);

const shuffle = <T,>(items: T[]) => {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
};

export const getMnemonicWords = (language: string, count: number) => {
  const normalizedLanguage = ["uz", "ru", "en"].includes(language) ? language : "en";

  return shuffle(WORD_POOL)
    .slice(0, count)
    .map((item) => item[normalizedLanguage as "uz" | "ru" | "en"] || item.en);
};

export const MNEMONIC_WORD_POOL_SIZE = WORD_POOL.length;
