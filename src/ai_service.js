const API_KEY = process.env.REACT_APP_GROQ_API_KEY;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Common fetch utility for Groq API.
 */
async function callGroq(systemPrompt, userPrompt, modelName = "llama-3.3-70b-versatile") {
  if (!API_KEY || API_KEY.startsWith("gsk_pX")) {
    throw new Error("Missing or invalid Groq API Key. Please update REACT_APP_GROQ_API_KEY in your .env file.");
  }

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1, // low temp for structured output
      max_tokens: 1024,
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Groq API Error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

/**
 * Generates a network topology (nodes and links) based on a description.
 */
export async function generateTopology(prompt) {
  const systemPrompt = `
    You are a Smart City Network Architect. Your task is to generate a JSON representation of a network topology.
    Output ONLY valid JSON following this schema:
    {
      "nodes": [
        { "id": "string", "x": number (50-850), "y": number (50-450), "label": "string" }
      ],
      "links": [
        { "id": "string", "source": "node_id", "target": "node_id", "fails": boolean }
      ]
    }
    Rules:
    1. AESTHETICS: The network MUST be visually balanced and centered within the canvas. Calculate the center of mass of the nodes to be near (450, 250). Avoid clustering nodes in corners.
    2. LABELS: Use concise, professional labels (e.g., 'Router A', 'City Hub', 'Edge Node'). Keep labels short (1-2 words).
    3. IDs: Must be unique strings.
    4. TOPOLOGY: Choose a layout (Star, Mesh, Ring, Tree) that best fits the user's description.
    5. OUTPUT: Provide exactly the JSON object, NO markdown formatting, NO extra text.
  `;

  try {
    const responseText = await callGroq(systemPrompt, `User Request: ${prompt}`);
    
    // Clean potential markdown artifacts
    const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleanJson);
  } catch (err) {
    console.error("Topology generation failed:", err);
    throw err;
  }
}

/**
 * Analyzes the results of a network simulation.
 */
export async function analyzeNetwork(networkData) {
  const systemPrompt = "You are NetAudit AI, a senior network performance analyzer specialized in Smart City infrastructure.";
  const userPrompt = `
    Analyze this network simulation result:
    
    Topology: ${networkData.nodes.length} nodes, ${networkData.links.length} links.
    Simulation Metrics:
    - Protocol: ${networkData.protocol}
    - Convergence Time: ${networkData.time}
    - Total Control Messages: ${networkData.messages}
    
    Provide a concise, professional analysis (2 sentences) of this performance. Mention if this is efficient for a smart city or where the bottleneck might be.
    Keep it high-tech and insightful.
  `;

  try {
    return await callGroq(systemPrompt, userPrompt);
  } catch (err) {
    console.warn("Audit analysis failed:", err);
    return "Calibration required: Performance Audit engine currently offline.";
  }
}
