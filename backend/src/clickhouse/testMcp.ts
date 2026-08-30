import "dotenv/config";
import { getTitleMetadata } from "./queries.js";

async function main() {
  const result = await getTitleMetadata();
  console.log(`${result.length} titles`);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});