# Wayfarer

An AI travel-planning agent. Describe a trip and Wayfarer builds a day-by-day itinerary, then lets you change it by asking.

It is a real agent, not a single prompt. The configured model decides which tools to call, reads the results, and keeps working until it submits a plan that passes validation.

**What the agent does**

| Tool | Source | Purpose |
|---|---|---|
| `geocode_place` | Open-Meteo geocoding | Find the destination, timezone, coordinates |
| `get_weather` | Open-Meteo forecast / archive | Real forecast within ~15 days, otherwise observed weather for the same dates last year (labelled as such) |
| `locate_places` | Photon (OpenStreetMap), Nominatim, Wikimedia coordinates fallback | Pin every stop to real coordinates |
| `estimate_travel` | Built-in maths | Check each leg of the day is realistic |
| `convert_currency` | Frankfurter (ECB rates) | Budget in your currency |
| `web_search` | Anthropic server tool | Current opening days, closures, events (optional) |
| `submit_itinerary` | Validated by Zod | The only way to deliver a plan. Wrong day count, dates, currency, missing coordinates, duplicate ids or out-of-order times are sent back to the model to fix |

**What you get**

- Planner form, live view of the agent working, saved trips
- Day tabs, timeline with costs and tips, travel legs, weather per day, budget breakdown, map with numbered stops
- Ask for changes in plain language ("make day 2 more relaxed"). Only the necessary parts change
- Add to calendar (.ics), print / save as PDF, read-only share links
- Anonymous per-browser accounts via a cookie, rate limiting, daily cost cap, security headers, health check

## Run it locally

```bash
cp .env.example .env.local      # then add your ANTHROPIC_API_KEY
npm install
npm run dev                     # http://localhost:3000
```

Needs Node 20+. No compiler needed: the SQLite driver uses bundled prebuilt binaries (see `.npmrc`). Checks: `npm run typecheck`, `npm test`, `npm run build`.

### Use a free local model with Ollama

Ollama runs the model on your computer, so there is no per-request model API charge. It needs enough memory and processing power, and itinerary generation may be slower than a hosted model.

1. Install [Ollama](https://ollama.com/download) and start it.
2. From the project directory, create Wayfarer's smaller local model:

   ```bash
   ollama pull qwen3:1.7b
   ollama create wayfarer-qwen3:1.7b -f Modelfile.ollama
   ```

3. In `.env.local`, set:

   ```dotenv
   AI_PROVIDER=ollama
   OLLAMA_BASE_URL=http://127.0.0.1:11434
   OLLAMA_MODEL=wayfarer-qwen3:1.7b
   ```

4. Start (or restart) Wayfarer with `npm run dev`. Local mode supports Indian destinations, uses INR, requests a compact structured list of places from Ollama, then checks each stop against map data and validates the finished itinerary. It plans two map-checked stops per day; prices are explicitly left unestimated.

When Ollama is selected, `ANTHROPIC_API_KEY` is not needed, and Anthropic-hosted web search is disabled. The other research tools (weather, places, and currency) still use their respective services and require internet access. To switch back, set `AI_PROVIDER=anthropic` and configure `ANTHROPIC_API_KEY`.

## Deploy

**Docker (recommended, because trips live in a SQLite file)**

```bash
cp .env.example .env            # add ANTHROPIC_API_KEY
docker compose up -d --build    # http://your-server:3000
```

Data is stored in the `wayfarer-data` volume. Put it behind HTTPS (Caddy, nginx, Cloudflare, or your platform's load balancer). Back up the volume to keep trips.

**Any Node host (Railway, Render, Fly.io, a VPS)**: `npm ci && npm run build && node .next/standalone/server.js`. You need a persistent disk for `DATABASE_PATH`.

**Vercel / serverless**: not as-is. The filesystem is ephemeral there, so swap `src/lib/db.ts` for a hosted database (Postgres, Turso). It is a single file with six functions. Planning also needs up to 5 minutes, so check your plan's function timeout.

## Configuration

See `.env.example`. Set `AI_PROVIDER` to `anthropic` (default) or `ollama`. Use `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` for Anthropic; use `OLLAMA_BASE_URL` and `OLLAMA_MODEL` for Ollama. `ENABLE_WEB_SEARCH` applies only to Anthropic. `RATE_LIMIT_PER_HOUR` and `DAILY_PLAN_CAP` configure rate limits.

## Layout

```
src/lib/agent/    index.ts (the loop)  tools.ts  prompts.ts  geo.ts  weather.ts  currency.ts
src/lib/          schemas.ts (types + validation)  db.ts  ics.ts  sse.ts  ratelimit.ts
src/app/api/      plan, trips, trips/[id]/{refine,share,ics}, health
src/components/   PlannerForm, AgentLog, ItineraryView, TripMap, TripWorkspace
tests/            schemas, tools, ics
```

## Known limits

- Rate limits are in memory, so they are per instance. Use Redis if you run several.
- Anonymous cookie identity means trips are tied to one browser. Add real auth if you need accounts.
- Free geocoding services (Photon, Nominatim) are fair-use. For heavy traffic, switch `locatePlace` in `geo.ts` to Google Places or Mapbox.
- Map tiles come from openstreetmap.org, which is fine for modest traffic. Use a tile provider for more.
- Prices and opening hours are the model's estimates unless web search verified them. The UI says so.

## Building the multi-agent system next

`runAgent()` is the single-agent building block. Natural splits: a **researcher** (web search, venues), a **logistics** agent (routes, timing, weather), a **budget** agent, and a **coordinator** that merges their output into `submit_itinerary`. Each tool in `tools.ts` can move to the agent that owns it.
