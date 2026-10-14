import { promises as fs } from 'node:fs';import path from 'node:path';import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await fs.mkdir(path.join(root,'apps/desktop/out/mcp'),{recursive:true});
await fs.copyFile(path.join(root,'packages/mcp/dist/server.cjs'),path.join(root,'apps/desktop/out/mcp/server.cjs'));
