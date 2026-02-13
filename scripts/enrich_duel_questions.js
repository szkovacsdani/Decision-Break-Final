const fs = require("fs");

const INPUT = "data/questions/duel_estimates_en_v3.json";
const OUTPUT = "data/questions/duel_estimates_en_v3_structured.json";

const questions = JSON.parse(fs.readFileSync(INPUT, "utf8"));

// kategória heuristika egyszerű kulcsszavas alapon
function detectCategory(q) {
  const text = q.toLowerCase();

  if (text.includes("year") || text.includes("war") || text.includes("revolution"))
    return "history";

  if (text.includes("country") || text.includes("continent") || text.includes("border"))
    return "geography";

  if (text.includes("player") || text.includes("world cup") || text.includes("olympic") || text.includes("match"))
    return "sport";

  if (text.includes("satellite") || text.includes("space") || text.includes("genome"))
    return "science";

  if (text.includes("iphone") || text.includes("tesla") || text.includes("playstation") || text.includes("computer"))
    return "technology";

  if (text.includes("judge") || text.includes("court") || text.includes("congress") || text.includes("parliament"))
    return "institutions";

  if (text.includes("episodes") || text.includes("harry potter"))
    return "popculture";

  if (text.includes("how many") && text.includes("minutes"))
    return "math";

  return "general";
}

// difficulty 30/50/20
function assignDifficulty(index, total) {
  const ratio = index / total;

  if (ratio < 0.3) return "easy";
  if (ratio < 0.8) return "medium";
  return "hard";
}

const total = questions.length;

const enriched = questions.map((q, i) => ({
  ...q,
  category: detectCategory(q.q),
  difficulty: assignDifficulty(i, total)
}));

fs.writeFileSync(OUTPUT, JSON.stringify(enriched, null, 2));

console.log("DONE. Structured file created:");
console.log(OUTPUT);
