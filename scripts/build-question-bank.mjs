import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const INPUT_DIR = path.join(ROOT, "data", "questions");
const OUTPUT_FILE = path.join(ROOT, "public", "questions.json");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function validateQuestion(q, fileName) {
  assert(q.id, `Missing id in ${fileName}`);
  assert(q.category, `Missing category in ${fileName}`);
  assert(["easy", "medium", "hard"].includes(q.difficulty), `Invalid difficulty in ${fileName}`);
  assert(q.question, `Missing question text in ${fileName}`);
  assert(q.answers, `Missing answers in ${fileName}`);
  assert(q.correct, `Missing correct answer in ${fileName}`);
}

function main() {
  const files = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith(".json"));
  const all = [];
  const ids = new Set();

  for (const file of files) {
    const filePath = path.join(INPUT_DIR, file);
    const json = readJson(filePath);

    for (const q of json.questions) {
      validateQuestion(q, file);

      if (ids.has(q.id)) {
        throw new Error(`Duplicate ID found: ${q.id}`);
      }

      ids.add(q.id);
      all.push(q);
    }
  }

  const shuffled = shuffleArray(all);

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify({ questions: shuffled }, null, 2),
    "utf8"
  );

  console.log(`Question bank built successfully: ${shuffled.length} questions`);
}

main();
 