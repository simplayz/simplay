import { readFileSync } from "node:fs";
import { prepareGameState } from "../src/game/validate";

const raw = JSON.parse(readFileSync(process.argv[2]!, "utf8"));
const result = prepareGameState(raw);
console.log(result.ok ? "OK" : result.error);
