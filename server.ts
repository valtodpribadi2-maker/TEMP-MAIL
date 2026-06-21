import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Enable JSON body parsing
app.use(express.json());

// Cloudflare Configuration from environment variables
const CF_API_TOKEN = process.env.CF_API_TOKEN || "";
const CF_ZONE_ID = process.env.CF_ZONE_ID || "";
const CF_DOMAIN = process.env.CF_DOMAIN || "";
const CF_DEST_EMAIL = process.env.CF_DEST_EMAIL || "";

// Check if credentials are properly configured
const isConfigured = (): boolean => {
  if (!CF_API_TOKEN || CF_API_TOKEN.trim() === "" || CF_API_TOKEN.includes("your_cloudflare")) return false;
  if (!CF_ZONE_ID || CF_ZONE_ID.trim() === "" || CF_ZONE_ID.includes("your_cloudflare")) return false;
  if (!CF_DOMAIN || CF_DOMAIN.trim() === "" || CF_DOMAIN.includes("your_domain")) return false;
  if (!CF_DEST_EMAIL || CF_DEST_EMAIL.trim() === "" || CF_DEST_EMAIL.includes("your_destination")) return false;
  return true;
};

// Simulated state if we are running in simulation/demo mode
interface RouteRule {
  id: string;
  name: string;
  enabled: boolean;
  matchers: Array<{ type: string; field: string; value: string }>;
  actions: Array<{ type: string; value: string[] }>;
}

let simulatedRules: RouteRule[] = [
  {
    id: "rule_sim_9a8b7c6d",
    name: "Temp Mail Alpha",
    enabled: true,
    matchers: [{ type: "literal", field: "to", value: "admin_f3k8d9s2" + (CF_DOMAIN ? `@${CF_DOMAIN}` : "@example.com") }],
    actions: [{ type: "forward", value: [CF_DEST_EMAIL || "development@gmail.com"] }]
  },
  {
    id: "rule_sim_3e4f5g6h",
    name: "Temp Mail Beta",
    enabled: true,
    matchers: [{ type: "literal", field: "to", value: "newsletter_7g8h9i0j" + (CF_DOMAIN ? `@${CF_DOMAIN}` : "@example.com") }],
    actions: [{ type: "forward", value: [CF_DEST_EMAIL || "development@gmail.com"] }]
  }
];

// Helper to generate a random local part (10 characters, alphanumeric)
function generateRandomLocalPart(length: number = 10): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 1. GET /api/config
app.get("/api/config", (req, res) => {
  const configured = isConfigured();
  res.json({
    configured,
    mode: configured ? "production" : "simulation",
    domain: CF_DOMAIN || "demo-temp-mail.com",
    destinationEmail: CF_DEST_EMAIL || "demo-recipient@gmail.com",
    details: {
      hasToken: !!CF_API_TOKEN,
      hasZoneId: !!CF_ZONE_ID,
      hasDomain: !!CF_DOMAIN,
      hasDestEmail: !!CF_DEST_EMAIL,
    }
  });
});

// 2. GET /api/list
app.get("/api/list", async (req, res) => {
  if (!isConfigured()) {
    // Return simulated rules
    return res.json({
      success: true,
      result: simulatedRules,
      mode: "simulation"
    });
  }

  try {
    const url = `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/email/routing/rules`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Cloudflare list rules error:", errorText);
      return res.status(response.status).json({
        success: false,
        error: `Cloudflare API returned error status: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    return res.json({
      success: true,
      result: data.result || [],
      mode: "production"
    });
  } catch (error: any) {
    console.error("Fetch list rules exception:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error connecting to Cloudflare"
    });
  }
});

// 3. POST /api/create
app.post("/api/create", async (req, res) => {
  const customLocalPart = req.body.localPart;
  const localPart = customLocalPart ? customLocalPart.toLowerCase() : generateRandomLocalPart();
  const domain = CF_DOMAIN || "demo-temp-mail.com";
  const address = `${localPart}@${domain}`;
  const ruleName = `CF Temp Mail - ${localPart}`;
  const destEmail = CF_DEST_EMAIL || "demo-recipient@gmail.com";

  if (!isConfigured()) {
    // Handle simulated rule creation
    const newRule: RouteRule = {
      id: "rule_sim_" + Math.random().toString(36).substring(2, 10),
      name: ruleName,
      enabled: true,
      matchers: [{ type: "literal", field: "to", value: address }],
      actions: [{ type: "forward", value: [destEmail] }]
    };
    simulatedRules.unshift(newRule);

    return res.json({
      success: true,
      mode: "simulation",
      rule: newRule,
      address,
      id: newRule.id
    });
  }

  try {
    const url = `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/email/routing/rules`;
    const bodyPayload = {
      matchers: [{ type: "literal", field: "to", value: address }],
      actions: [{ type: "forward", value: [destEmail] }],
      enabled: true,
      name: ruleName
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(bodyPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Cloudflare create rule error:", errorText);
      return res.status(response.status).json({
        success: false,
        error: `Failed to create routing rule on Cloudflare API: status ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    if (!data.success) {
      return res.status(400).json({
        success: false,
        error: "Cloudflare API rejected creation",
        details: data.errors
      });
    }

    return res.json({
      success: true,
      mode: "production",
      rule: data.result,
      address,
      id: data.result.id
    });

  } catch (error: any) {
    console.error("Fetch create rule exception:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to communicate with Cloudflare service"
    });
  }
});

// 4. DELETE /api/delete/:id
app.delete("/api/delete/:id", async (req, res) => {
  const ruleId = req.params.id;

  if (!isConfigured()) {
    // Simulator route deletion
    const initialLength = simulatedRules.length;
    simulatedRules = simulatedRules.filter(r => r.id !== ruleId);
    
    if (simulatedRules.length === initialLength) {
      return res.status(404).json({
        success: false,
        error: `Simulated rule with ID ${ruleId} not found`
      });
    }

    return res.json({
      success: true,
      mode: "simulation",
      message: `Simulated rule ${ruleId} deleted successfully`
    });
  }

  try {
    const url = `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/email/routing/rules/${ruleId}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Cloudflare delete rule error:", errorText);
      return res.status(response.status).json({
        success: false,
        error: `Failed to delete routing rule: status ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    return res.json({
      success: true,
      mode: "production",
      result: data.result,
      message: `Rule ${ruleId} deleted from Cloudflare`
    });

  } catch (error: any) {
    console.error("Fetch delete rule exception:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to communicate with Cloudflare service during deletion"
    });
  }
});

// Implement Vite or Static Middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
