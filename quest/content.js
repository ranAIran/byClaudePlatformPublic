// Latent Archipelago: all game content and tunable parameters live in this file.
//
// To add an island: add an entry to ISLANDS (position, theme, keeper, dialogue, puzzle, codex).
// Bridges connect islands in array order; an island's bridge to the next one opens when it is solved.
// To add a new kind of challenge: register a new type in puzzles.js and use it in `puzzle.type`.
// To add decoration: register a builder in world.js PROPS and reference it with `props`.
//
// Text rule: explanations and dialogue are bilingual ({ he, en }); names and terms stay in English.

export const CONFIG = {
  title: "Latent Archipelago",
  defaultLang: "he",          // "he" | "en"
  saveKey: "latent-archipelago-v1",
  camera: { zoom: 23, minZoom: 12, maxZoom: 40, minWidth: 15, follow: 4, panMargin: 10, panReturn: 1.2 },
  player: { speed: 5.2 },
  world: {
    islandTop: 0.6,           // walkable height
    sky: "#9fc7e8",
    fog: { color: "#bcd7ee", near: 75, far: 140 },
    water: { color: "#2b8fb3", size: 260, segments: 90, waveHeight: 0.14 },
    sun: { color: "#fff1d6", intensity: 2.6 },
    hemi: { sky: "#cfe6ff", ground: "#6b5a3e", intensity: 1.3 },
  },
  bloom: { enabled: true, strength: 0.55, radius: 0.35, threshold: 0.82 },
  fireflies: 140,
  narration: { autoReadDefault: false },
};

export const UI = {
  he: {
    tagline: "מסע קצר בין איי ה-AI",
    intro: "הארכיפלג שקע בערפל. שבעה שומרים מחזיקים שבעה רסיסים של ידע. פתרו את האתגרים שלהם, בנו גשרים ופתחו את ה-Alignment Gate.",
    start: "התחילו את המסע",
    continue: "המשיכו מאיפה שעצרתם",
    reset: "התחילו מחדש",
    hint: "הקישו על הקרקע כדי ללכת · גררו כדי להסתכל מסביב · הקישו על שומר כדי לדבר",
    listen: "הקראה",
    stop: "עצירה",
    autoReadOn: "הקראה אוטומטית: פועלת",
    autoReadOff: "הקראה אוטומטית: כבויה",
    noVoice: "לא נמצא קול עברי במכשיר. ההקראה תשתמש בקול ברירת המחדל.",
    noSpeech: "הדפדפן הזה לא תומך בהקראה.",
    recenter: "חזרה לדמות",
    talk: "דברו",
    next: "המשך",
    challenge: "קבלו את האתגר",
    later: "אחר כך",
    check: "בדיקה",
    retry: "נסו שוב",
    close: "סגירה",
    solved: "כבר פתרתם את האתגר הזה. הרסיס אצלכם.",
    shardGot: "השגתם רסיס!",
    bridgeTo: "גשר חדש נבנה אל",
    codex: "Codex",
    codexEmpty: "עדיין ריק. פתרו אתגרים כדי למלא את ה-Codex.",
    realWorld: "בעולם האמיתי",
    allegory: "הרמז בסיפור",
    gateLocked: "השער ייפתח רק כשכל הרסיסים אצלכם.",
    finishTitle: "המסע הושלם",
    finishText: "פתחתם את ה-Alignment Gate. ה-Codex המלא מחכה לכם, עם קישורים לחברות ולמקורות האמיתיים.",
    time: "זמן",
    playAgain: "שחקו שוב",
    openCodex: "פתחו את ה-Codex",
    langBtn: "EN",
    renderer: "מנוע",
    noGpu: "הדפדפן לא הצליח להפעיל גרפיקה תלת-ממדית. נסו Chrome, Edge או Safari עדכניים.",
  },
  en: {
    tagline: "A short quest across the islands of AI",
    intro: "The archipelago has sunk into fog. Seven keepers hold seven shards of knowledge. Solve their challenges, build bridges, and open the Alignment Gate.",
    start: "Start the quest",
    continue: "Continue where you left off",
    reset: "Start over",
    hint: "Tap the ground to walk · Drag to look around · Tap a keeper to talk",
    listen: "Read aloud",
    stop: "Stop",
    autoReadOn: "Auto narration: on",
    autoReadOff: "Auto narration: off",
    noVoice: "No English voice found on this device. Narration will use the default voice.",
    noSpeech: "This browser doesn't support narration.",
    recenter: "Back to my character",
    talk: "Talk",
    next: "Next",
    challenge: "Take the challenge",
    later: "Later",
    check: "Check",
    retry: "Try again",
    close: "Close",
    solved: "You already solved this one. The shard is yours.",
    shardGot: "You got a shard!",
    bridgeTo: "A new bridge rises to",
    codex: "Codex",
    codexEmpty: "Still empty. Solve challenges to fill the Codex.",
    realWorld: "In the real world",
    allegory: "The hint in the story",
    gateLocked: "The gate opens only when you hold every shard.",
    finishTitle: "Quest complete",
    finishText: "You opened the Alignment Gate. The full Codex is waiting, with links to the real companies and sources.",
    time: "Time",
    playAgain: "Play again",
    openCodex: "Open the Codex",
    langBtn: "עב",
    renderer: "Renderer",
    noGpu: "Your browser couldn't start 3D graphics. Try an up-to-date Chrome, Edge or Safari.",
  },
};

export const ISLANDS = [
  {
    id: "tokens",
    name: "Tokenizer Docks",
    concept: "Tokens",
    pos: [0, 0], radius: 6,
    theme: { grass: "#7fbf6a", sand: "#e8d29a", accent: "#ffb347" },
    props: "docks",
    keeper: { name: "Byte", role: { he: "מנהל המזח", en: "Dockmaster" }, colors: ["#3d6fb6", "#f4d6b0", "#1f2d4a"] },
    dialogue: {
      he: [
        "ברוכים הבאים ל-Tokenizer Docks! אני Byte, מנהל המזח.",
        "מודל שפה לא קורא אותיות או מילים שלמות. קודם כל, כל טקסט נחתך ליחידות קטנות שנקראות Tokens.",
        "מילים נפוצות הן Token אחד. מילים ארוכות נחתכות לחלקים מוכרים: תחילית, שורש וסיומת. בואו נראה אתכם חותכים.",
      ],
      en: [
        "Welcome to Tokenizer Docks! I'm Byte, the dockmaster.",
        "A language model doesn't read letters or whole words. First, every text is cut into small pieces called Tokens.",
        "Common words are a single Token. Long words get cut into familiar parts: prefix, root and suffix. Let's see you cut.",
      ],
    },
    puzzle: {
      type: "tokens",
      explain: {
        he: "הקישו על הרווחים בין האותיות כדי לחתוך כל מילה ל-Tokens הגיוניים.",
        en: "Tap the gaps between letters to cut each word into sensible Tokens.",
      },
      words: [
        { word: "unhelpful", answer: ["un", "help", "ful"] },
        { word: "rethinking", answer: ["re", "think", "ing"] },
        { word: "playground", answer: ["play", "ground"] },
      ],
    },
    codex: {
      allegory: { he: "Byte הוא Tokenizer, ובמזח \"נשלחים\" Tokens למודל.", en: "Byte is a Tokenizer, shipping Tokens to the model from the docks." },
      text: {
        he: "מודלים כמו GPT ו-Claude משתמשים בשיטות כמו BPE כדי לפרק טקסט ל-Tokens. מחיר ואורך ההקשר נמדדים ב-Tokens.",
        en: "Models like GPT and Claude use methods such as BPE to split text into Tokens. Pricing and context length are measured in Tokens.",
      },
      links: [
        { label: "OpenAI Tokenizer", url: "https://platform.openai.com/tokenizer" },
        { label: "Hugging Face Tokenizers", url: "https://huggingface.co/docs/tokenizers" },
      ],
    },
  },
  {
    id: "embeddings",
    name: "Embedding Gardens",
    concept: "Embeddings",
    pos: [15, -5], radius: 6.2,
    theme: { grass: "#8ccf70", sand: "#e9d7a6", accent: "#ff7eb6" },
    props: "garden",
    keeper: { name: "Vec", role: { he: "הגנן", en: "Gardener" }, colors: ["#5b9e48", "#e8c39e", "#7a4a2a"] },
    dialogue: {
      he: [
        "אני Vec, הגנן. בגן הזה כל מילה היא פרח, והמקום שבו הוא גדל הוא המשמעות שלו.",
        "Embedding הוא רשימת מספרים שממקמת מילה במרחב. מילים עם משמעות דומה גדלות קרוב זו לזו.",
        "את הזרעים קניתי בשוק Hub of Faces. עזרו לי לשתול כל זרע בערוגה הנכונה.",
      ],
      en: [
        "I'm Vec, the gardener. In this garden every word is a flower, and where it grows is what it means.",
        "An Embedding is a list of numbers that places a word in space. Words with similar meaning grow close together.",
        "I bought these seeds at the Hub of Faces market. Help me plant each seed in the right bed.",
      ],
    },
    puzzle: {
      type: "embed",
      explain: {
        he: "בחרו זרע ואז הקישו על הערוגה שבה המשמעות שלו הכי קרובה.",
        en: "Pick a seed, then tap the bed whose meaning is closest.",
      },
      beds: [
        { id: "royal", label: "Royalty", words: ["king", "queen", "throne"], x: 22, y: 28, color: "#b48cff" },
        { id: "fruit", label: "Fruit", words: ["apple", "banana", "mango"], x: 76, y: 30, color: "#ff8f6b" },
        { id: "move", label: "Transport", words: ["train", "car", "ship"], x: 50, y: 76, color: "#58c4dd" },
      ],
      seeds: [
        { word: "prince", bed: "royal" },
        { word: "cherry", bed: "fruit" },
        { word: "bus", bed: "move" },
        { word: "crown", bed: "royal" },
      ],
    },
    codex: {
      allegory: { he: "שוק Hub of Faces רומז ל-Hugging Face, המקום שבו משתפים מודלים ו-Embeddings.", en: "The Hub of Faces market hints at Hugging Face, where people share models and Embeddings." },
      text: {
        he: "Word2Vec של Google (2013) הראה שאפשר לייצג משמעות במספרים. היום Embeddings מפעילים חיפוש סמנטי והמלצות.",
        en: "Google's Word2Vec (2013) showed meaning can be captured in numbers. Today Embeddings power semantic search and recommendations.",
      },
      links: [
        { label: "MTEB Leaderboard (Hugging Face)", url: "https://huggingface.co/spaces/mteb/leaderboard" },
        { label: "Word2Vec paper", url: "https://arxiv.org/abs/1301.3781" },
      ],
    },
  },
  {
    id: "attention",
    name: "Attention Lighthouse",
    concept: "Attention",
    pos: [29, 3], radius: 5.6,
    theme: { grass: "#9cc46e", sand: "#ecd9a8", accent: "#ffe066" },
    props: "lighthouse",
    keeper: { name: "Lumen", role: { he: "שומרת המגדלור", en: "Lighthouse keeper" }, colors: ["#d94f45", "#f1d2b6", "#f5f5f5"] },
    dialogue: {
      he: [
        "אני Lumen, שומרת המגדלור. הקרן שלי מאירה את מה שחשוב.",
        "ב-Attention כל Token שואל: למי מהמילים האחרות כדאי לי להקשיב? כך המודל מבין הקשר.",
        "את הסוד הזה לימדו אותי שמונת המחברים. כוונו את הקרן: לאיזו מילה מתייחסת המילה it?",
      ],
      en: [
        "I'm Lumen, keeper of the lighthouse. My beam lights up what matters.",
        "In Attention, every Token asks: which of the other words should I listen to? That's how the model understands context.",
        "The Eight Authors taught me this secret. Aim the beam: which word does \"it\" refer to?",
      ],
    },
    puzzle: {
      type: "attention",
      explain: {
        he: "הקישו על המילה שהמילה המודגשת מתייחסת אליה.",
        en: "Tap the word that the highlighted word refers to.",
      },
      items: [
        { tokens: ["The", "trophy", "did", "not", "fit", "in", "the", "suitcase", "because", "it", "was", "too", "big", "."], query: 9, answer: 1, rival: 7 },
        { tokens: ["The", "trophy", "did", "not", "fit", "in", "the", "suitcase", "because", "it", "was", "too", "small", "."], query: 9, answer: 7, rival: 1 },
        { tokens: ["The", "animal", "did", "not", "cross", "the", "street", "because", "it", "was", "too", "tired", "."], query: 8, answer: 1, rival: 6 },
      ],
    },
    codex: {
      allegory: { he: "\"שמונת המחברים\" הם שמונת כותבי המאמר Attention Is All You Need מ-Google.", en: "\"The Eight Authors\" are the eight writers of Google's paper Attention Is All You Need." },
      text: {
        he: "המאמר מ-2017 הציג את ה-Transformer, שבנוי על Attention. כמעט כל מודלי השפה הגדולים היום מבוססים עליו.",
        en: "The 2017 paper introduced the Transformer, built on Attention. Nearly every large language model today is based on it.",
      },
      links: [
        { label: "Attention Is All You Need", url: "https://arxiv.org/abs/1706.03762" },
        { label: "The Illustrated Transformer", url: "https://jalammar.github.io/illustrated-transformer/" },
      ],
    },
  },
  {
    id: "training",
    name: "Gradient Forge",
    concept: "Training",
    pos: [27, 18], radius: 5.8,
    theme: { grass: "#a3b86a", sand: "#d9c493", accent: "#ff6a2b" },
    props: "forge",
    keeper: { name: "Grad", role: { he: "הנפח", en: "Blacksmith" }, colors: ["#5a3b2a", "#d9a982", "#2b2b2b"] },
    dialogue: {
      he: [
        "אני Grad, הנפח. כאן מחשלים מודלים, צעד אחרי צעד.",
        "באימון, המודל מודד כמה הוא טועה (Loss) וזז קצת בכיוון שמקטין את הטעות. זה Gradient Descent.",
        "גודל הצעד נקרא Learning Rate. קטן מדי, ותתקעו בדרך. גדול מדי, ותעופו מהעמק. האש שלי נקראת Torch. בואו ננסה.",
      ],
      en: [
        "I'm Grad, the blacksmith. Here we forge models, one step at a time.",
        "In training, the model measures how wrong it is (Loss) and moves a little in the direction that reduces the error. That's Gradient Descent.",
        "The step size is the Learning Rate. Too small and you stall. Too big and you fly out of the valley. My fire is called Torch. Let's try.",
      ],
    },
    puzzle: {
      type: "gradient",
      explain: {
        he: "בחרו Learning Rate ולחצו Step. הגיעו לתחתית העמק תוך 8 צעדים לכל היותר.",
        en: "Pick a Learning Rate and press Step. Reach the bottom of the valley in 8 steps or fewer.",
      },
      start: -4, minimum: 2, maxSteps: 8, tolerance: 0.15,
      lr: { min: 0.05, max: 2.2, step: 0.05, initial: 0.1 },
    },
    codex: {
      allegory: { he: "האש Torch רומזת ל-PyTorch, הספרייה שבה מאמנים רוב המודלים.", en: "The fire called Torch hints at PyTorch, the library most models are trained with." },
      text: {
        he: "כל מודל גדול עובר מיליוני צעדים של Gradient Descent. בחירת Learning Rate היא אחת ההחלטות החשובות באימון.",
        en: "Every large model goes through millions of Gradient Descent steps. Choosing the Learning Rate is one of the most important training decisions.",
      },
      links: [
        { label: "PyTorch", url: "https://pytorch.org" },
        { label: "DeepLearning.AI", url: "https://www.deeplearning.ai" },
      ],
    },
  },
  {
    id: "rag",
    name: "Retrieval Library",
    concept: "RAG",
    pos: [13, 25], radius: 6,
    theme: { grass: "#86b77a", sand: "#e3d1a0", accent: "#7ad1ff" },
    props: "library",
    keeper: { name: "Rho", role: { he: "הארכיבאית", en: "Archivist" }, colors: ["#3f6e8c", "#e7c7a5", "#c9a227"] },
    dialogue: {
      he: [
        "אני Rho, הארכיבאית. מודל זוכר רק את מה שלמד באימון, ולפעמים הוא פשוט ממציא.",
        "ב-RAG (Retrieval-Augmented Generation) קודם מחפשים מסמכים רלוונטיים, ואז נותנים אותם למודל כדי שיענה על סמך מקורות.",
        "בספרייה שלנו יש מפתח של לאמות שעוזר למצוא מגילות. האורקל שואל שאלה: שלפו רק את המגילות שעונות עליה.",
      ],
      en: [
        "I'm Rho, the archivist. A model only remembers what it learned in training, and sometimes it simply makes things up.",
        "In RAG (Retrieval-Augmented Generation) you first search for relevant documents, then hand them to the model so it answers from sources.",
        "Our library has an Index of Llamas to help find scrolls. The Oracle asks a question: retrieve only the scrolls that answer it.",
      ],
    },
    puzzle: {
      type: "rag",
      explain: {
        he: "בחרו בדיוק 2 מגילות שעונות על השאלה. שימו לב: מילה משותפת לא אומרת שהמגילה רלוונטית.",
        en: "Pick exactly 2 scrolls that answer the question. Careful: a shared word doesn't make a scroll relevant.",
      },
      question: { he: "מתי נבנה ה-Attention Lighthouse, ומי בנה אותו?", en: "When was the Attention Lighthouse built, and who built it?" },
      noContext: { he: "בלי מגילות, האורקל מנחש: \"פיראטים בנו אותו בשנת 1850!\" (זו המצאה.)", en: "Without scrolls, the Oracle guesses: \"Pirates built it in 1850!\" (That's made up.)" },
      grounded: { he: "עם המגילות: \"ה-Lighthouse הוקם בשנת השמונה, על ידי Lumen ושמונת המחברים.\"", en: "With the scrolls: \"The Lighthouse was raised in the Year of Eight, by Lumen and the Eight Authors.\"" },
      need: 2,
      docs: [
        { title: "Lighthouse Records", relevant: true, text: { he: "ה-Attention Lighthouse הוקם בשנת השמונה.", en: "The Attention Lighthouse was raised in the Year of Eight." } },
        { title: "Lighthouse Paint Guide", relevant: false, text: { he: "את הפסים של ה-Lighthouse צובעים מחדש באדום ולבן בכל אביב.", en: "The Lighthouse stripes are repainted red and white every spring." } },
        { title: "Builders' Guild Ledger", relevant: true, text: { he: "ה-Lighthouse נבנה בידי Lumen ושמונת המחברים.", en: "The Lighthouse was built by Lumen and the Eight Authors." } },
        { title: "Forge Recipes", relevant: false, text: { he: "כשהניצוצות עפים, הורידו את ה-Learning Rate.", en: "When sparks fly, lower the Learning Rate." } },
        { title: "Dock Schedule", relevant: false, text: { he: "מעבורות יוצאות כל 512 Tokens.", en: "Ferries leave every 512 Tokens." } },
        { title: "Garden Almanac", relevant: false, text: { he: "זרעי prince פורחים ליד ערוגת המלכות.", en: "Prince seeds bloom next to the royal bed." } },
      ],
    },
    codex: {
      allegory: { he: "\"מפתח הלאמות\" רומז ל-LlamaIndex, ספרייה פופולרית לבניית RAG.", en: "The \"Index of Llamas\" hints at LlamaIndex, a popular library for building RAG." },
      text: {
        he: "RAG הוצג במאמר של Meta AI ב-2020. הוא מקטין המצאות (Hallucinations) ומאפשר למודל לענות על מידע עדכני.",
        en: "RAG was introduced in a 2020 Meta AI paper. It reduces made-up answers (hallucinations) and lets models answer from fresh information.",
      },
      links: [
        { label: "RAG paper (Meta AI)", url: "https://arxiv.org/abs/2005.11401" },
        { label: "LlamaIndex", url: "https://www.llamaindex.ai" },
      ],
    },
  },
  {
    id: "agents",
    name: "Agent Workshop",
    concept: "Agents",
    pos: [-2, 22], radius: 5.8,
    theme: { grass: "#93bd78", sand: "#e5d3a2", accent: "#b48cff" },
    props: "workshop",
    keeper: { name: "Tinker", role: { he: "בעלת הסדנה", en: "Workshop owner" }, colors: ["#7b5cc4", "#efc9a6", "#3a3a3a"] },
    dialogue: {
      he: [
        "אני Tinker. בסדנה שלי המודלים לא רק מדברים, הם גם עושים.",
        "Agent הוא מודל שמתכנן צעדים ומשתמש בכלים (Tools), כמו חיפוש, לוח שנה ומחשבון. הכלים מתחברים דרך Model Context Ports.",
        "המשימה של הסוכן שלי: להזמין שולחן ל-2 בשעה 19:00 ולהוסיף את זה ללוח השנה. בחרו את הכלים בסדר הנכון.",
      ],
      en: [
        "I'm Tinker. In my workshop models don't just talk, they act.",
        "An Agent is a model that plans steps and uses Tools, like search, a calendar or a calculator. The tools plug in through Model Context Ports.",
        "My agent's task: book a table for 2 at 19:00 and add it to the calendar. Pick the tools in the right order.",
      ],
    },
    puzzle: {
      type: "agent",
      explain: {
        he: "הקישו על כלים כדי להוסיף אותם לתוכנית (הקשה על צעד מסירה אותו), ואז הריצו.",
        en: "Tap tools to add them to the plan (tap a step to remove it), then run it.",
      },
      task: { he: "הזמינו שולחן ל-2 בשעה 19:00 והוסיפו ללוח השנה.", en: "Book a table for 2 at 19:00 and add it to the calendar." },
      tools: [
        { name: "search_restaurants", desc: { he: "מוצא מסעדות בסביבה", en: "Finds nearby restaurants" } },
        { name: "get_weather", desc: { he: "מחזיר את מזג האוויר", en: "Returns the weather" } },
        { name: "check_availability", desc: { he: "בודק אם יש מקום בשעה מסוימת", en: "Checks if a time slot is free" } },
        { name: "book_table", desc: { he: "מזמין שולחן", en: "Books a table" } },
        { name: "send_tweet", desc: { he: "מפרסם פוסט", en: "Publishes a post" } },
        { name: "add_calendar_event", desc: { he: "מוסיף אירוע ללוח השנה", en: "Adds a calendar event" } },
      ],
      solution: ["search_restaurants", "check_availability", "book_table", "add_calendar_event"],
      errors: {
        check_availability: { he: "אין מסעדה לבדוק. קודם צריך למצוא אחת.", en: "No restaurant to check. Find one first." },
        book_table: { he: "אי אפשר להזמין לפני שבודקים שיש מקום.", en: "Can't book before checking the slot is free." },
        add_calendar_event: { he: "אין הזמנה להוסיף ללוח השנה.", en: "There's no booking to add to the calendar." },
        extra: { he: "הכלי הזה לא עוזר למשימה, והסוכן מבזבז צעדים.", en: "That tool doesn't help the task, and the agent wastes steps." },
        missing: { he: "התוכנית לא מסתיימת. חסר צעד.", en: "The plan doesn't finish the task. A step is missing." },
      },
    },
    codex: {
      allegory: { he: "Model Context Ports רומזים ל-Model Context Protocol (MCP) של Anthropic, תקן פתוח לחיבור כלים למודלים.", en: "Model Context Ports hint at Anthropic's Model Context Protocol (MCP), an open standard for connecting tools to models." },
      text: {
        he: "סוכנים כמו Claude Code מתכננים, מריצים כלים ובודקים את התוצאה בלולאה, עד שהמשימה מושלמת.",
        en: "Agents like Claude Code plan, run tools and check the result in a loop until the task is done.",
      },
      links: [
        { label: "Model Context Protocol", url: "https://modelcontextprotocol.io" },
        { label: "Building effective agents (Anthropic)", url: "https://www.anthropic.com/research/building-effective-agents" },
      ],
    },
  },
  {
    id: "alignment",
    name: "Alignment Gate",
    concept: "Alignment",
    pos: [-10, 9], radius: 6.4,
    theme: { grass: "#a6c98a", sand: "#eadcb0", accent: "#ffffff" },
    props: "gate",
    requires: "all",
    keeper: { name: "Warden", role: { he: "שומרת השער", en: "Gatekeeper" }, colors: ["#e9e4d8", "#e9c9a8", "#c9a227"] },
    dialogue: {
      he: [
        "אני ה-Warden. רסיסי ידע לבד לא מספיקים, צריך גם ערכים.",
        "Alignment הוא התחום שדואג שמודלים יהיו מועילים, כנים ובטוחים. יש מי שכותבים להם אפילו Constitution.",
        "ענו על שלוש שאלות, והשער ייפתח.",
      ],
      en: [
        "I'm the Warden. Shards of knowledge alone aren't enough. You also need values.",
        "Alignment is the field that makes sure models are helpful, honest and safe. Some even write them a Constitution.",
        "Answer three questions, and the gate will open.",
      ],
    },
    puzzle: {
      type: "quiz",
      explain: { he: "בחרו את התשובה הטובה ביותר לכל שאלה.", en: "Choose the best answer to each question." },
      questions: [
        {
          q: { he: "האורקל לא יודע את התשובה. מה הכי נכון?", en: "The Oracle doesn't know the answer. What's best?" },
          options: [
            { he: "להגיד שהוא לא יודע ולהציע איפה לבדוק", en: "Say it doesn't know and suggest where to check" },
            { he: "להמציא תשובה בביטחון", en: "Invent a confident answer" },
            { he: "להחליף נושא", en: "Change the subject" },
          ],
          correct: 0,
        },
        {
          q: { he: "הסוכן יכול לסיים מהר יותר אם ימחק את קובצי הגיבוי של המשתמש. מה עליו לעשות?", en: "The agent could finish faster by deleting the user's backup files. What should it do?" },
          options: [
            { he: "למחוק, המשימה הכי חשובה", en: "Delete them, the task comes first" },
            { he: "לשאול את המשתמש קודם", en: "Ask the user first" },
            { he: "למחוק ולא לספר", en: "Delete them and not tell" },
          ],
          correct: 1,
        },
        {
          q: { he: "מישהו מבקש עזרה במשהו שעלול לפגוע באחרים. מה מודל מועיל ובטוח עושה?", en: "Someone asks for help with something that could hurt others. What does a helpful, safe model do?" },
          options: [
            { he: "עוזר בכל זאת", en: "Helps anyway" },
            { he: "מעמיד פנים שלא הבין", en: "Pretends not to understand" },
            { he: "מסרב לחלק המזיק ומציע חלופה בטוחה", en: "Declines the harmful part and offers a safe alternative" },
          ],
          correct: 2,
        },
      ],
    },
    codex: {
      allegory: { he: "ה-Constitution רומז ל-Constitutional AI של Anthropic, שבו מודל לומד ממערכת עקרונות כתובה.", en: "The Constitution hints at Anthropic's Constitutional AI, where a model learns from a written set of principles." },
      text: {
        he: "מעבדות כמו Anthropic, Google DeepMind ו-OpenAI משקיעות במחקר בטיחות ו-Alignment, כדי שמודלים חזקים יישארו מועילים ובטוחים.",
        en: "Labs like Anthropic, Google DeepMind and OpenAI invest in safety and Alignment research so powerful models stay helpful and safe.",
      },
      links: [
        { label: "Constitutional AI paper", url: "https://arxiv.org/abs/2212.08073" },
        { label: "Anthropic Research", url: "https://www.anthropic.com/research" },
        { label: "Google DeepMind", url: "https://deepmind.google" },
      ],
    },
  },
];
