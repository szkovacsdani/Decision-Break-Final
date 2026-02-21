const fs = require("fs");

const data = JSON.parse(
  fs.readFileSync("./public/questions.json", "utf8")
);

const questions = data.questions;

console.log("TOTAL QUESTIONS:", questions.length);

// Difficulty count
const difficultyCount = {};
questions.forEach(q => {
  difficultyCount[q.difficulty] =
    (difficultyCount[q.difficulty] || 0) + 1;
});

console.log("\nBY DIFFICULTY:");
console.log(difficultyCount);

// Category count
const categoryCount = {};
questions.forEach(q => {
  categoryCount[q.category] =
    (categoryCount[q.category] || 0) + 1;
});

console.log("\nBY CATEGORY:");
console.log(categoryCount);

// Duplicate check by question text
const questionTextMap = {};
const duplicates = [];

questions.forEach(q => {
  if (questionTextMap[q.question]) {
    duplicates.push(q.question);
  } else {
    questionTextMap[q.question] = true;
  }
});

console.log("\nDUPLICATES FOUND:", duplicates.length);
if (duplicates.length > 0) {
  console.log(duplicates);
}