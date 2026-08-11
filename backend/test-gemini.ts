import { askGemini } from "./src/agent/gemini.js";

async function main() {
  const reponse = await askGemini("Réponds juste avec le mot OK.");
  console.log(reponse);
}

main();