// Keep the plan hash identical to the independent Node audio audit.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { plan } from './audio-plan.mjs';

const entries = [...plan.values()];
const result = JSON.stringify({
  entries,
  planSHA256: createHash('sha256').update(JSON.stringify(entries)).digest('hex'),
});
if (process.argv[2]) writeFileSync(process.argv[2], result);
else process.stdout.write(result);
