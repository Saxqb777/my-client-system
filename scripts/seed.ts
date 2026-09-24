import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { seedDemoData } from "../src/lib/demo/seed";

seedDemoData()
  .then((r) => {
    console.log(`Demo data loaded: ${r.inserted} rows`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
