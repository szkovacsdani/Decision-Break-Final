const fs = require("fs");

// Read original file
const raw = JSON.parse(
  fs.readFileSync("./data/questions/general.json", "utf8")
);

// Convert ALL questions
const converted = raw.questions.map((q, index) => {
  return {
    id: `GK_${String(index + 1).padStart(3, "0")}`,
    category: q.category || "General Knowledge",
    difficulty: "easy", // ideiglenesen mind easy
    question: q.question,
    answers: Object.values(q.answers),
    correctIndex: ["A", "B", "C", "D"].indexOf(q.correct),
  };
});

// Write new file
fs.writeFileSync(
  "./data/questions_converted.json",
  JSON.stringify(converted, null, 2)
);

console.log("Conversion complete.");
console.log("Total questions:", converted.length);
