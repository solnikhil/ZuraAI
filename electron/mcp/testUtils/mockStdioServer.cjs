const readline = require('readline')

const protocolVersion = process.env.MCP_MOCK_PROTOCOL_VERSION || '2025-06-18'
const serverName = process.env.MCP_MOCK_SERVER_NAME || 'Mock MCP Server'
const serverVersion = process.env.MCP_MOCK_SERVER_VERSION || '1.0.0'
const initializeDelayMs = Number(process.env.MCP_MOCK_INITIALIZE_DELAY_MS || '0')
const toolsDelayMs = Number(process.env.MCP_MOCK_TOOLS_DELAY_MS || '0')
const exitAfterInitialize = process.env.MCP_MOCK_EXIT_AFTER_INITIALIZE === '1'
const exitImmediately = process.env.MCP_MOCK_EXIT_IMMEDIATELY === '1'
const stderrLine = process.env.MCP_MOCK_STDERR_LINE || ''

const capabilities = {
  ...(process.env.MCP_MOCK_TOOLS_CAPABILITY === 'false' ? {} : { tools: {} }),
  ...(process.env.MCP_MOCK_RESOURCES_CAPABILITY === 'true' ? { resources: {} } : {}),
  ...(process.env.MCP_MOCK_PROMPTS_CAPABILITY === 'true' ? { prompts: {} } : {}),
}

const tools = safeJsonParse(process.env.MCP_MOCK_TOOLS_JSON, [
  {
    name: 'read_file',
    description: 'Read a file from disk',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
    },
  },
])

if (stderrLine) {
  process.stderr.write(`${stderrLine}\n`)
}

if (exitImmediately) {
  process.exit(0)
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
})

rl.on('line', (line) => {
  let message

  try {
    message = JSON.parse(line)
  } catch {
    process.stderr.write('mock-stdio-server: failed to parse JSON input\n')
    return
  }

  if (message.method === 'initialize') {
    return delayedWrite(
      initializeDelayMs,
      {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion,
          capabilities,
          serverInfo: {
            name: serverName,
            version: serverVersion,
          },
        },
      },
      () => {
        if (exitAfterInitialize) {
          process.exit(0)
        }
      }
    )
  }

  if (message.method === 'notifications/initialized') {
    return
  }

  if (message.method === 'tools/list') {
    return delayedWrite(toolsDelayMs, {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        tools,
      },
    })
  }

  if (message.id !== undefined) {
    writeMessage({
      jsonrpc: '2.0',
      id: message.id,
      error: {
        code: -32601,
        message: `Method not found: ${String(message.method)}`,
      },
    })
  }
})

function delayedWrite(delayMs, payload, afterWrite) {
  setTimeout(() => {
    writeMessage(payload)
    if (typeof afterWrite === 'function') {
      afterWrite()
    }
  }, delayMs)
}

function writeMessage(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

function safeJsonParse(value, fallback) {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}
