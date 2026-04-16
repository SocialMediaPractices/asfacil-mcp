# @asfacil/mcp

MCP server for live US-Mexico border crossing wait times. Plug into Claude Desktop, Cursor, Windsurf, or any MCP-compatible AI tool and ask about San Ysidro, PedWest, and Otay Mesa in plain language.

## Tools

| Tool | What it does |
|------|-------------|
| `get_wait_times` | Live northbound wait times by lane — General, Ready Lane, SENTRI |
| `predict_wait` | Predicted wait 1–6 hours from now with trend + best window |
| `get_history` | Historical data + stats (avg/min/max/best hour) up to 7 days |
| `get_best_times` | Day × hour heatmap — find the best crossing slot of the week |
| `get_southbound` | Southbound (to Tijuana) estimates via Google Maps + community |

## Quick Start

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "asfacil": {
      "command": "npx",
      "args": ["-y", "@asfacil/mcp"],
      "env": {
        "ASFACIL_API_KEY": "your_key_here"
      }
    }
  }
}
```

### Cursor / Windsurf

Add to your `.cursor/mcp.json` or `mcp.json`:

```json
{
  "mcpServers": {
    "asfacil": {
      "command": "npx",
      "args": ["-y", "@asfacil/mcp"],
      "env": {
        "ASFACIL_API_KEY": "your_key_here"
      }
    }
  }
}
```

### Local install

```bash
npm install -g @asfacil/mcp
ASFACIL_API_KEY=your_key asfacil-mcp
```

## API Key

Get a free key at **[asfacil.com](https://www.asfacil.com)**. Without a key, the server returns an error on every call.

## Example Prompts

Once connected to Claude Desktop or Cursor:

- "What's the wait at San Ysidro right now?"
- "When is the best time to cross Otay Mesa on a Friday by vehicle?"
- "Predict the pedestrian wait at PedWest in 2 hours"
- "How bad was San Ysidro yesterday morning?"
- "What's the southbound wait to Tijuana?"
- "I'm leaving downtown San Diego now — what's my total trip time to the US including border wait?"

## Crossings

| ID | Name | Hours | Modes |
|----|------|-------|-------|
| `san_ysidro` | San Ysidro Port of Entry | 24h | Vehicle + Pedestrian |
| `pedwest` | PedWest (El Chaparral) | 6am–2pm PT | Pedestrian only |
| `otay_mesa` | Otay Mesa Port of Entry | 6am–10pm PT | Vehicle + Pedestrian |

## Data Sources

- **Northbound:** US Customs & Border Protection (CBP) official API, updated every 5 min
- **Southbound:** Google Maps live traffic + community reports + historical patterns
- **Predictions:** Asfacil proprietary historical dataset
- **Heatmap:** Asfacil proprietary dataset (not available from CBP)

## License

MIT
