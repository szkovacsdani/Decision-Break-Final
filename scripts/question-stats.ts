import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {

  const { data, error } = await supabase
    .from("questions")
    .select("category,difficulty");

  if (error) {
    console.error(error);
    return;
  }

  const total = data.length;

  const categoryStats: Record<string, number> = {};
  const difficultyStats: Record<string, number> = {};

  data.forEach(q => {

    categoryStats[q.category] =
      (categoryStats[q.category] || 0) + 1;

    difficultyStats[q.difficulty] =
      (difficultyStats[q.difficulty] || 0) + 1;
  });

  console.log("\nTOTAL QUESTIONS:");
  console.log(total);

  console.log("\nBY CATEGORY:");
  console.log(categoryStats);

  console.log("\nBY DIFFICULTY:");
  console.log(difficultyStats);
}

run();