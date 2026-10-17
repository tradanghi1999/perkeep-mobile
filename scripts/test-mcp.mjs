import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['run', 'C:/Users/dfsg/Documents/perkeep-mobile/scripts/perkeep-mcp.mjs'],
  stderr: 'inherit',
  cwd: 'C:/Users/dfsg/Documents/perkeep-mobile'
});

const client = new Client({ name: 'test', version: '1.0.0' });
await client.connect(transport);
console.log('connected');

const tools = await client.listTools();
console.log('tools:', tools.tools.map((t) => t.name).join(', '));

const r = await client.callTool({ name: 'search', arguments: { expression: 'tag:video-link', limit: 2 } });
console.log('search:', JSON.stringify(r).slice(0, 800));

await client.close();
