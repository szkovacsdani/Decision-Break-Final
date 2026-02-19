import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const questions = JSON.parse(
  fs.readFileSync("./data/questions/duel_estimates_en_v3_structured.json", "utf8")
);

async function run() {
  const batchSize = 100;

  for (let i = 0; i < questions.length; i += batchSize) {
    const batch = questions.slice(i, i + batchSize).map((q: any) => ({
      external_id: q.id,
      question: q.q,
      correct_answer: q.a,
      unit: q.unit,
      category: q.category,
      difficulty: q.difficulty,
    }));

    const { error } = await supabase
      .from("duel_questions")
      .insert(batch);

    if (error) {
      console.error(error);
      return;
    }

    console.log(`Inserted batch ${i}`);
  }

  console.log("Import complete");
}

run();
