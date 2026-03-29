import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = process.env.REACT_APP_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY, { apiVersion: "v1" });

/**
 * Generates a network topology (nodes and links) based on a description.
 * @param {string} prompt - User description of the desired network.
 */
export async function generateTopology(prompt) {
  if (!API_KEY) throw new Error("Missing API Key. Add REACT_APP_GEMINI_API_KEY to .env");

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
    1. Nodes should be spread out naturally within the bounds (x: 50-850, y: 50-450).
    2. IDs must be unique strings (e.g., 'n1', 'n2').
    3. Ensure connectivity based on the user's description.
    4. Provide exactly the JSON object, NO markdown formatting, NO extra text.
  `;

  const modelNames = ["gemini-pro", "gemini-1.5-flash", "gemini-1.5-flash-latest"];
  let lastError;

  for (const modelName of modelNames) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: "v1" });
      const result = await model.generateContent([systemPrompt, `User Request: ${prompt}`]);
      const responseText = result.response.text();
      
      const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(cleanJson);
    } catch (err) {
      lastError = err;
      console.warn(`Model ${modelName} failed, trying next...`);
    }
  }

  throw lastError;
}

/**
 * Analyzes the results of a network simulation.
 * @param {object} networkData - Current nodes, links, and results like convergence time.
 */
export async function analyzeNetwork(networkData) {
  if (!API_KEY) throw new Error("Missing API Key.");

  const modelNames = ["gemini-pro", "gemini-1.5-flash"];
  const prompt = `
    You are NetAudit AI, a senior network performance analyzer.
    Analyze this network simulation result for a Smart City project:
    
    Topology: ${networkData.nodes.length} nodes, ${networkData.links.length} links.
    Simulation Metrics:
    - Protocol: ${networkData.protocol}
    - Convergence Time: ${networkData.time}
    - Total Control Messages: ${networkData.messages}
    
    Provide a concise, professional analysis (2 sentences) of this performance. Mention if this is efficient for a smart city or where the bottleneck might be.
    Keep it high-tech and insightful.
  `;

  for (const modelName of modelNames) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: "v1" });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      console.warn(`Audit model ${modelName} failed.`);
    }
  }

  return "Calibration required: Performance Audit engine currently offline.";
}
