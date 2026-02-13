const fs = require("fs");

const FILE = "data/questions/duel_estimates_en_v3_structured.json";
const TARGET_TOTAL = 1000;

const categories = [
  { name: "history", weight: 0.2 },
  { name: "geography", weight: 0.15 },
  { name: "sport", weight: 0.15 },
  { name: "science", weight: 0.15 },
  { name: "technology", weight: 0.1 },
  { name: "institutions", weight: 0.1 },
  { name: "popculture", weight: 0.1 },
  { name: "math", weight: 0.05 }
];

function weightedPick() {
  const r = Math.random();
  let sum = 0;
  for (const c of categories) {
    sum += c.weight;
    if (r <= sum) return c.name;
  }
  return categories[0].name;
}

function difficultyPick(index, total) {
  const ratio = index / total;
  if (ratio < 0.3) return "easy";
  if (ratio < 0.8) return "medium";
  return "hard";
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateQuestion(id, category, difficulty) {
  const year = randomInt(1200, 2023);
  const quantity = randomInt(2, 500);

  switch (category) {
    case "history":
      return {
        id,
        q: `In which year did a major historical event occur around ${year}?`,
        a: year,
        unit: "year",
        category,
        difficulty
      };

    case "geography":
      return {
        id,
        q: `How many kilometers is a notable geographic distance near ${quantity * 10}?`,
        a: quantity * 10,
        unit: "kilometers",
        category,
        difficulty
      };

    case "sport":
      return {
        id,
        q: `How many points are typically needed in a sports context near ${quantity}?`,
        a: quantity,
        unit: "points",
        category,
        difficulty
      };

    case "science":
      return {
        id,
        q: `How many units are commonly measured in a scientific context around ${quantity}?`,
        a: quantity,
        unit: "units",
        category,
        difficulty
      };

    case "technology":
      return {
        id,
        q: `In which year was a major tech milestone reached around ${year}?`,
        a: year,
        unit: "year",
        category,
        difficulty
      };

    case "institutions":
      return {
        id,
        q: `How many members typically sit in an institutional body near ${quantity}?`,
        a: quantity,
        unit: "members",
        category,
        difficulty
      };

    case "popculture":
      return {
        id,
        q: `In which year was a major pop culture release around ${year}?`,
        a: year,
        unit: "year",
        category,
        difficulty
      };

    case "math":
      return {
        id,
        q: `What is a rounded mathematical quantity near ${quantity}?`,
        a: quantity,
        unit: "units",
        category,
        difficulty
      };

    default:
      return null;
  }
}

const questions = JSON.parse(fs.readFileSync(FILE, "utf8"));

let currentTotal = questions.length;
let lastId = parseInt(questions[questions.length - 1].id.split("-")[1]);

while (currentTotal < TARGET_TOTAL) {
  lastId++;
  const id = `DUEL-${lastId.toString().padStart(3, "0")}`;
  const category = weightedPick();
  const difficulty = difficultyPick(currentTotal, TARGET_TOTAL);

  const newQuestion = generateQuestion(id, category, difficulty);

  questions.push(newQuestion);
  currentTotal++;
}

fs.writeFileSync(FILE, JSON.stringify(questions, null, 2));

console.log(`DONE. Total questions: ${questions.length}`);
