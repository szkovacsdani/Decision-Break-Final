const data = require("../public/questions.json");

const q = data.questions;

const ids = q.map(x => parseInt(x.id.replace("q","")));
ids.sort((a,b)=>a-b);

const missing = [];

for (let i = 1; i <= ids[ids.length-1]; i++) {
  if (!ids.includes(i)) missing.push(i);
}

console.log("MAX ID:", ids[ids.length-1]);
console.log("TOTAL QUESTIONS:", ids.length);
console.log("MISSING IDS:", missing.length);
console.log(missing);