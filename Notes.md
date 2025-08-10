The Graph (subgraph)

- Indexes on-chain events (ERC‑20 Transfers) so you can query “all tokens and balances for this address” fast, without scanning the chain each time.
- Enables rich, historical and aggregated queries (balances over time, top tokens, pagination) via GraphQL.
- Reduces RPC load and latency with a purpose-built data model for your UI.


Alchemy (Rootstock Node + Token/NFT APIs)

- Reliable RPC for core reads (resolve RNS via contracts, get RBTC balance, call token contracts) and realtime updates (WebSocket).
- Token APIs for metadata (name, symbol, decimals, logo) and, when available, pricing—so you don’t maintain your own metadata/price pipeline.
- Complements The Graph: use Alchemy for live/raw node access and rich asset info; use The Graph for precomputed balances and fast list queries



# current requirements

- Use Alchemy’s Rootstock Token API + Node API to fetch balances/metadata directly. This likely covers your token list and pricing needs without custom indexing.
- If you need custom indexing/history/aggregations: Build your own subgraph and self-host a Graph Node connected to a Rootstock RPC. You’ll define a schema (Token, Account, Balance, Transfer), index ERC-20 Transfer events, and query via GraphQL.


# Requuirements for dashboard

**Dashboard Essentials (using Alchemy + The Graph):**

- **Resolved Address & RNS Domain:** Show the address tied to the RNS name (resolved via RNS contracts).
- **Native Token (RBTC) Balance:** Fetch and display Rootstock’s main balance.
- **ERC-20 Token Balances/Details**: Show all standard tokens held, including symbols, names, and logos
- **NFTs/assets**: List and visualize NFTs owned (images, metadata).


- **Transaction History**: Pull lists of recent transactions, including transfers and smart contract interactions.
  - Value comes as a string from the API; if you want formatted RBTC/units, I can add formatting logic.
  - We can expand columns later (timestamp, fee, status) or link from/to to the explorer as well.



- **Token Transfer Events & Activity**: Use The Graph for indexed queries, showing transfers and historical activity.

- **Portfolio Breakdown**: Visualize token allocations with simple charts (balances, percentages).
   
- **Domain Ownership/Status**: Show ownership info for the RNS name, sourced via registry lookups.