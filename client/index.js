/**
 * Expensory Client
 *
 * Demonstrates the full stack:
 *   Claude (Anthropic API) → MCP Server → REST API → SQLite DB
 *
 * The client:
 *   1. Spawns the REST API server
 *   2. Connects to the MCP server over stdio
 *   3. Fetches all available MCP tools
 *   4. Runs an interactive agentic loop where Claude manages expenses
 *      exclusively through the MCP tools
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node client/index.js
 *
 * Optional env vars:
 *   DEMO_MODE=true   Run a scripted demo instead of interactive chat
 *   API_PORT=3001    Override the REST API port
 */

import Anthropic from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const API_PORT = process.env.API_PORT || 3001;

// ---------------------------------------------------------------------------
// Boot the REST API server
// ---------------------------------------------------------------------------

function startApiServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['api/server.js'], {
      cwd: ROOT,
      env: { ...process.env, API_PORT },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', (d) => {
      const msg = d.toString();
      process.stderr.write(`[API] ${msg}`);
      if (msg.includes('Running on')) resolve(proc);
    });

    proc.stderr.on('data', (d) => process.stderr.write(`[API ERR] ${d}`));
    proc.on('error', reject);

    // Give it 5 s to start even if we miss the log line
    setTimeout(() => resolve(proc), 5000);
  });
}

// ---------------------------------------------------------------------------
// Connect to the MCP server
// ---------------------------------------------------------------------------

async function connectMcp() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['mcp/server.js'],
    cwd: ROOT,
    env: { ...process.env, API_BASE: `http://localhost:${API_PORT}` },
  });

  const client = new Client({ name: 'expensory-client', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

// ---------------------------------------------------------------------------
// Convert MCP tool list → Anthropic tool definitions
// ---------------------------------------------------------------------------

function mcpToolsToAnthropicTools(mcpTools) {
  return mcpTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}

// ---------------------------------------------------------------------------
// Execute a tool call via the MCP client
// ---------------------------------------------------------------------------

async function callMcpTool(mcpClient, name, input) {
  const result = await mcpClient.callTool({ name, arguments: input });

  // MCP returns content as an array; extract text
  if (result.isError) {
    return `Error: ${result.content.map((c) => c.text).join('\n')}`;
  }
  return result.content.map((c) => c.text ?? JSON.stringify(c)).join('\n');
}

// ---------------------------------------------------------------------------
// Agentic loop: Claude ↔ MCP tools
// ---------------------------------------------------------------------------

async function agentLoop(anthropic, mcpClient, tools, messages) {
  while (true) {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system: `You are Expensory, an intelligent expense management assistant.
You help users track, categorize, and analyze their expenses through a set of MCP tools
that interact with a live database.

When answering questions about spending, always use the tools to fetch real data.
Format currency as $X.XX. Use markdown tables for summaries when appropriate.
Be concise but informative.`,
      tools,
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      // Extract text from content blocks
      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');
      return { response, text };
    }

    if (response.stop_reason === 'tool_use') {
      // Append assistant message
      messages.push({ role: 'assistant', content: response.content });

      // Execute all tool calls in parallel
      const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          console.error(`[MCP] Calling ${block.name} with`, JSON.stringify(block.input));
          const result = await callMcpTool(mcpClient, block.name, block.input);
          return {
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          };
        })
      );

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Unexpected stop reason
    break;
  }
}

// ---------------------------------------------------------------------------
// Demo: seed data + run preset queries
// ---------------------------------------------------------------------------

async function runDemo(anthropic, mcpClient, tools) {
  console.log('\n' + '═'.repeat(60));
  console.log('  EXPENSORY — MCP-Driven Expense Manager (Demo Mode)');
  console.log('═'.repeat(60) + '\n');

  const queries = [
    // Seed some data
    'Add these expenses for me:\n' +
    '- Grocery run at Whole Foods, $87.43, Food & Dining, today\n' +
    '- Monthly Netflix, $15.99, Entertainment, today\n' +
    '- Uber to airport, $34.50, Transportation, today\n' +
    '- New running shoes, $129.99, Shopping, today\n' +
    '- Dentist visit, $250.00, Health & Medical, today',

    // Budget check
    `Set a monthly budget of $200 for Food & Dining and $50 for Entertainment for ${new Date().toISOString().slice(0, 7)}.`,

    // Summary
    'Give me a summary of all my expenses grouped by category. Include totals and how many I have.',

    // Budget status
    'How am I doing against my budgets this month? Am I over in any category?',

    // Insight
    'What was my most expensive single purchase? And what category has been my biggest spend?',
  ];

  for (const query of queries) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`You: ${query}`);
    console.log('─'.repeat(60));

    const messages = [{ role: 'user', content: query }];
    const { text } = await agentLoop(anthropic, mcpClient, tools, messages);
    console.log(`\nExpensory: ${text}\n`);
  }
}

// ---------------------------------------------------------------------------
// Interactive REPL
// ---------------------------------------------------------------------------

async function runInteractive(anthropic, mcpClient, tools) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (prompt) => new Promise((res) => rl.question(prompt, res));

  console.log('\n' + '═'.repeat(60));
  console.log('  EXPENSORY — MCP-Driven Expense Manager');
  console.log('═'.repeat(60));
  console.log('  Type your expense queries. Type "exit" to quit.\n');

  const conversationHistory = [];

  while (true) {
    const input = (await ask('You: ')).trim();
    if (!input || input.toLowerCase() === 'exit') break;

    conversationHistory.push({ role: 'user', content: input });

    try {
      const messages = [...conversationHistory];
      const { response, text } = await agentLoop(anthropic, mcpClient, tools, messages);

      // Keep only the final assistant turn in history (not intermediate tool calls)
      conversationHistory.push({
        role: 'assistant',
        content: response.content.filter((b) => b.type === 'text'),
      });

      console.log(`\nExpensory: ${text}\n`);
    } catch (err) {
      console.error('Error:', err.message);
    }
  }

  rl.close();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required');
    process.exit(1);
  }

  console.error('[Expensory] Starting REST API server...');
  const apiProc = await startApiServer();

  console.error('[Expensory] Connecting to MCP server...');
  const mcpClient = await connectMcp();

  // Fetch available MCP tools
  const { tools: mcpTools } = await mcpClient.listTools();
  const anthropicTools = mcpToolsToAnthropicTools(mcpTools);
  console.error(`[Expensory] Loaded ${anthropicTools.length} MCP tools:`,
    anthropicTools.map((t) => t.name).join(', '));

  const anthropic = new Anthropic({ apiKey });

  try {
    if (process.env.DEMO_MODE === 'true') {
      await runDemo(anthropic, mcpClient, anthropicTools);
    } else {
      await runInteractive(anthropic, mcpClient, anthropicTools);
    }
  } finally {
    await mcpClient.close();
    apiProc.kill();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
