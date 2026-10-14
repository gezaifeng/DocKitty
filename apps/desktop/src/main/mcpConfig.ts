export function mcpConfiguration(executable: string, serverPath: string, repoRoot: string) {
  const server = { type: 'stdio', command: executable, args: [serverPath, '--repo', repoRoot], env: { ELECTRON_RUN_AS_NODE: '1' } }
  return {
    server,
    codex: `[mcp_servers.dockitty]\ncommand = ${JSON.stringify(server.command)}\nargs = ${JSON.stringify(server.args)}\nstartup_timeout_sec = 30\ntool_timeout_sec = 120\n\n[mcp_servers.dockitty.env]\nELECTRON_RUN_AS_NODE = "1"\n`,
    claude: JSON.stringify({ mcpServers: { dockitty: server } }, null, 2),
    cursor: JSON.stringify({ mcpServers: { dockitty: server } }, null, 2),
    dsh: '在此开启本机连接，再到 DSH 的 MCP 面板选择 Streamable HTTP，填写下方服务地址与 Bearer Token。无需移动项目文件。连接期间请保持稿喵打开。',
  }
}
