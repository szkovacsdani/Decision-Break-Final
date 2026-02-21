const fs = require("fs");

// Load converted questions
const questions = JSON.parse(
  fs.readFileSync("./data/questions_converted.json", "utf8")
);

// Shuffle
for (let i = questions.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [questions[i], questions[j]] = [questions[j], questions[i]];
}

const total = questions.length;

const easyCount = Math.floor(total * 0.35);
const normalCount = Math.floor(total * 0.40);
const hardCount = total - easyCount - normalCount;

// Assign difficulty
questions.forEach((q, index) => {
  if (index < easyCount) {
    q.difficulty = "easy";
  } else if (index < easyCount + normalCount) {
    q.difficulty = "normal";
  } else {
    q.difficulty = "hard";
  }
});

// Save back
fs.writeFileSync(
  "./data/questions_converted.json",
  JSON.stringify(questions, null, 2)
);

console.log("Difficulty assigned.");
console.log({
  total,
  easy: easyCount,
  normal: normalCount,
  hard: hardCount,
});