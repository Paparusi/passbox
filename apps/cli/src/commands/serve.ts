import { Command } from 'commander';
import { printSuccess, printError } from '../lib/output.js';

export const serveCommand = new Command('serve')
  .description('Start PassBox MCP server for AI agents')
  .option('-p, --port <port>', 'Port for HTTP/SSE mode')
  .action(async (options) => {
    try {
      // Dynamic import to avoid loading MCP deps unless needed
      const { startMcpServer } = await import('@passbox/mcp-server');

      if (options.port) {
        printSuccess(`Starting MCP server on port ${options.port}`);
        await startMcpServer({ mode: 'sse', port: parseInt(options.port) });
      } else {
        // Default: stdio mode for direct integration
        await startMcpServer({ mode: 'stdio' });
      }
    } catch (err: any) {
      printError(`Failed to start MCP server: ${err.message}`);
      process.exit(1);
    }
  });
