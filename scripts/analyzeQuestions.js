const fs = require("fs");

const questions = JSON.parse(
  fs.readFileSync("./data/questions_converted.json", "utf8")
);

const byCategory = {};
const byDifficulty = {};
const combo = {};

questions.forEach((q) => {
  // category count
  byCategory[q.category] = (byCategory[q.category] || 0) + 1;

  // difficulty count
  byDifficulty[q.difficulty] = (byDifficulty[q.difficulty] || 0) + 1;

  // category + difficulty
  const key = `${q.category} - ${q.difficulty}`;
  combo[key] = (combo[key] || 0) + 1;
});

console.log("=== TOTAL ===");
console.log(questions.length);

console.log("\n=== BY CATEGORY ===");
console.log(byCategory);

console.log("\n=== BY DIFFICULTY ===");
console.log(byDifficulty);

console.log("\n=== CATEGORY + DIFFICULTY ===");
console.log(combo);
