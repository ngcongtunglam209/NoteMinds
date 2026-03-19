import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(__dirname, '../../.env');
const serverEnvPath = path.resolve(__dirname, '../.env');

// Primary source: repo root .env (single file setup)
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

// Backward compatibility: allow server/.env if present
if (fs.existsSync(serverEnvPath)) {
  dotenv.config({ path: serverEnvPath });
}
