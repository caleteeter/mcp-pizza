# Pizza via MCP server

This is a demonstration of using an MCP server for a fictious pizza business.

## Prerequisites

- NodeJS - [LatestLTS](https://nodejs.org)

## Build

```
npm run build
```

## Testing via MCP Inspector

```
npx @modelcontextprotocol/inspector node build/index.js
```

## Using with Claude Desktop

Add the following to the Claude Desktop configuration

```
{
  "mcpServers": {
    "pizza": {
      "command": "node",
      "args": ["/Users/caleteeter/Source/Public/mcp-pizza/build/index.js"]
    }
  }
}
```