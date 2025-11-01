import { config as loadEnv } from "dotenv";
import { createVeloCloudTool } from "../lib/agent/tools/velocloud";
import type { AgentToolFactoryParams } from "../lib/agent/tools/shared";

function bootstrapEnv() {
  loadEnv();
  loadEnv({ path: ".env.local", override: true });
}

async function main() {
  bootstrapEnv();

  const params: AgentToolFactoryParams = {
    messages: [],
    caseNumbers: [],
    updateStatus: (status) => console.log(`STATUS: ${status}`),
  };

  const tool = createVeloCloudTool(params);

  console.log("🔍 Running queryVelocloud → list_edges");
  const edges = await tool.execute({ query: "list_edges" });
  console.dir(edges, { depth: null });

  if (edges && Array.isArray(edges.edges) && edges.edges.length > 0) {
    const preferredEdge = edges.edges.find((edge) => edge.edgeState === "CONNECTED") ?? edges.edges[0];
    const edgeId = preferredEdge?.id;
    const enterpriseId = preferredEdge?.enterpriseId;

    if (!edgeId) {
      console.log("Edges array returned but no edgeId found; skipping link/event checks.");
      return;
    }

    console.log(`\n🔍 Running queryVelocloud → edge_links for edge ${edgeId}`);
    const links = await tool.execute({ query: "edge_links", edgeId, enterpriseId });
    console.dir(links, { depth: null });

    console.log(`\n🔍 Running queryVelocloud → enterprise_events for edge ${edgeId}`);
    const events = await tool.execute({
      query: "enterprise_events",
      edgeId,
      enterpriseId,
      lookbackMinutes: 60,
      limit: 20,
    });
    console.dir(events, { depth: null });
  } else {
    console.log("No edges returned; skipping link/event checks.");
  }
}

main().catch((error) => {
  console.error("VeloCloud test failed:", error);
  process.exitCode = 1;
});
