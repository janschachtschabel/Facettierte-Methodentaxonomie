import fs from 'node:fs';
import path from 'node:path';

const MODEL_ID = 'JanSchachtschabel/m2v-qwen3-4b-256-edu';
const TARGET_DIR = path.resolve(process.env.FMT_M2V_MODEL_DIR || path.join('models', 'm2v-qwen3-4b-256-edu'));
const FILES = ['config.json', 'tokenizer.json', 'model.safetensors'];

fs.mkdirSync(TARGET_DIR, { recursive: true });

console.log(`Lade statisches Model2Vec-Embedding-Modell (${MODEL_ID}, Apache-2.0) nach:\n  ${TARGET_DIR}`);

for (const name of FILES) {
  const dest = path.join(TARGET_DIR, name);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 50) {
    console.log(`✓ bereits vorhanden: ${name}`);
    continue;
  }
  const url = `https://huggingface.co/${MODEL_ID}/resolve/main/${name}`;
  console.log(`⬇ Lade ${name} …`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} beim Laden von ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  console.log(`✓ gespeichert: ${name} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
}

console.log('\nFertig! Der Server lädt das Modell beim nächsten Start automatisch (oder über FMT_M2V_MODEL_DIR).');
