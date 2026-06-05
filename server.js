const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const webpush = require("web-push");
const { createClient } = require("@supabase/supabase-js");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const PRIVATE_DIR = path.join(ROOT, "private");
const DATA_FILE = path.join(ROOT, "data", "clients.json");

const sseClients = new Set();

// Load environment variables from .env file if it exists (for local development)
const fsSync = require("fs");
try {
  const envPath = path.join(ROOT, ".env");
  if (fsSync.existsSync(envPath)) {
    const envContent = fsSync.readFileSync(envPath, "utf8");
    envContent.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) return;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      // Only set from .env if not already defined in environment (e.g. Vercel project settings)
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    });
  }
} catch (err) {
  console.warn("Could not load local .env file:", err.message);
}

// Guarantee secure authentication credentials are initialized in .env
function ensureAuthEnv() {
  // If we already have the variables in process.env (e.g. on Vercel), do nothing
  if (process.env.CRM_USERNAME && process.env.CRM_PASSWORD_HASH && process.env.SESSION_SECRET) {
    return;
  }

  const envPath = path.join(ROOT, ".env");
  let envContent = "";
  try {
    if (fsSync.existsSync(envPath)) {
      envContent = fsSync.readFileSync(envPath, "utf8");
    }
  } catch (err) {
    console.error("Could not read .env for auth verification:", err);
  }

  const hasUsername = !!process.env.CRM_USERNAME || envContent.includes("CRM_USERNAME=");
  const hasPasswordHash = !!process.env.CRM_PASSWORD_HASH || envContent.includes("CRM_PASSWORD_HASH=");
  const hasSessionSecret = !!process.env.SESSION_SECRET || envContent.includes("SESSION_SECRET=");

  if (!hasUsername || !hasPasswordHash || !hasSessionSecret) {
    const lines = [];
    if (!hasUsername) {
      lines.push('CRM_USERNAME="admin"');
      process.env.CRM_USERNAME = "admin";
    }
    if (!hasPasswordHash) {
      const defaultPassword = "sterlingcrm123";
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = crypto.scryptSync(defaultPassword, salt, 64).toString("hex");
      const hashVal = `scrypt$${salt}$${hash}`;
      lines.push(`CRM_PASSWORD_HASH="${hashVal}"`);
      process.env.CRM_PASSWORD_HASH = hashVal;
      console.log("--------------------------------------------------");
      console.log("DEFAULT LOGIN CREDENTIALS CREATED:");
      console.log("Username: admin");
      console.log("Password: sterlingcrm123");
      console.log("Password is stored securely in .env using scrypt.");
      console.log("--------------------------------------------------");
    }
    if (!hasSessionSecret) {
      const secret = crypto.randomBytes(32).toString("hex");
      lines.push(`SESSION_SECRET="${secret}"`);
      process.env.SESSION_SECRET = secret;
    }

    try {
      const separator = envContent && !envContent.endsWith("\n") ? "\n" : "";
      fsSync.appendFileSync(envPath, separator + lines.join("\n") + "\n", "utf8");
    } catch (err) {
      console.error("Could not write authentication defaults to .env:", err.message);
    }
  }
}
ensureAuthEnv();

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach((cookie) => {
    const parts = cookie.split("=");
    if (parts.length === 2) {
      cookies[parts[0].trim()] = parts[1].trim();
    }
  });
  return cookies;
}

function signToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
  return `${data}.${signature}`;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [data, signature] = parts;
  const expectedSignature = crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
  
  const sigBuffer = Buffer.from(signature);
  const expBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
    return null;
  }
  
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (payload.expires && payload.expires < Date.now()) {
      return null;
    }
    return payload;
  } catch (e) {
    return null;
  }
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  if (!storedHash.startsWith("scrypt$")) {
    return password === storedHash;
  }
  const parts = storedHash.split("$");
  if (parts.length !== 3) return false;
  const [, salt, hash] = parts;
  const verifyHash = crypto.scryptSync(password, salt, 64).toString("hex");
  const hashBuffer = Buffer.from(hash, "hex");
  const verifyBuffer = Buffer.from(verifyHash, "hex");
  
  if (hashBuffer.length !== verifyBuffer.length || !crypto.timingSafeEqual(hashBuffer, verifyBuffer)) {
    return false;
  }
  return true;
}


const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const isUrlValid = supabaseUrl && (supabaseUrl.startsWith("http://") || supabaseUrl.startsWith("https://"));

if (!supabaseUrl || !supabaseKey) {
  console.warn("WARNING: SUPABASE_URL or SUPABASE_KEY environment variables are missing! Database operations will fail.");
} else if (!isUrlValid) {
  console.error("FATAL ERROR: SUPABASE_URL must be a valid URL starting with http:// or https:// (e.g. https://your-project.supabase.co). Found a key/token instead: " + supabaseUrl);
}

const supabase = createClient(
  isUrlValid ? supabaseUrl : "https://placeholder.supabase.co",
  supabaseKey || "placeholder"
);

function checkSupabaseConfig() {
  if (!supabaseUrl || !supabaseKey || !isUrlValid) {
    throw new Error("Supabase database is not configured. Please set a valid SUPABASE_URL (e.g. https://your-project.supabase.co) and SUPABASE_KEY in your environment.");
  }
}

async function readSettings() {
  try {
    checkSupabaseConfig();
    const { data, error } = await supabase
      .from("settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  } catch (err) {
    console.error("Failed to read settings from Supabase, returning defaults:", err.message);
  }
  return {
    whatsappEnabled: false,
    whatsappApiUrl: "http://localhost:2785/api",
    whatsappSessionId: "default",
    whatsappApiKey: "",
    whatsappRecipientPhone: ""
  };
}

async function writeSettings(settings) {
  checkSupabaseConfig();
  const { error } = await supabase
    .from("settings")
    .upsert({ id: "default", ...settings });
  if (error) throw error;
}

async function sendWhatsAppMessage(settings, text) {
  if (!settings.whatsappEnabled || !settings.whatsappRecipientPhone) return false;
  
  const endpoint = `${settings.whatsappApiUrl}/sessions/${settings.whatsappSessionId}/messages/send-text`;
  const headers = {
    "Content-Type": "application/json"
  };
  if (settings.whatsappApiKey) {
    headers["X-API-Key"] = settings.whatsappApiKey;
  }
  
  const recipient = settings.whatsappRecipientPhone.trim();
  const chatId = recipient.endsWith("@c.us") ? recipient : `${recipient}@c.us`;
  
  const payload = JSON.stringify({
    chatId: chatId,
    text: text
  });
  
  console.log(`Sending WhatsApp message to ${chatId} via OpenWA...`);
  
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(endpoint);
      const isHttps = urlObj.protocol === "https:";
      const protocolLib = isHttps ? require("https") : require("http");
      
      const options = {
        method: "POST",
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        headers: headers
      };
      
      const req = protocolLib.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log("WhatsApp message sent successfully!");
            resolve(true);
          } else {
            console.error(`WhatsApp send failed with code ${res.statusCode}:`, data);
            resolve(false);
          }
        });
      });
      
      req.on("error", (err) => {
        console.error("WhatsApp send network error:", err.message);
        resolve(false);
      });
      
      req.write(payload);
      req.end();
    } catch (err) {
      console.error("Error preparing WhatsApp request:", err.message);
      resolve(false);
    }
  });
}

let vapidKeys = null;

async function initVapid() {
  try {
    if (!supabaseUrl || !supabaseKey || !isUrlValid) {
      console.warn("Supabase not configured. Using local/in-memory VAPID keys.");
      vapidKeys = webpush.generateVAPIDKeys();
    } else {
      const settings = await readSettings();
      if (settings.vapidPublicKey && settings.vapidPrivateKey) {
        vapidKeys = {
          publicKey: settings.vapidPublicKey,
          privateKey: settings.vapidPrivateKey
        };
      } else {
        vapidKeys = webpush.generateVAPIDKeys();
        await supabase
          .from("settings")
          .upsert({
            id: "default",
            vapidPublicKey: vapidKeys.publicKey,
            vapidPrivateKey: vapidKeys.privateKey
          });
      }
    }
  } catch (err) {
    console.error("Failed to load VAPID keys from Supabase, falling back to local generate:", err.message);
    vapidKeys = webpush.generateVAPIDKeys();
  }
  
  webpush.setVapidDetails(
    "mailto:sterling@crm.example",
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
}

async function readSubscriptions() {
  try {
    checkSupabaseConfig();
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*");
    if (error) throw error;
    return data.map(sub => ({
      endpoint: sub.endpoint,
      keys: sub.keys
    }));
  } catch (err) {
    console.error("Error reading subscriptions:", err.message);
    return [];
  }
}

async function removeSubscription(endpoint) {
  try {
    checkSupabaseConfig();
    const { error } = await supabase
      .from("subscriptions")
      .delete()
      .eq("endpoint", endpoint);
    if (error) throw error;
  } catch (err) {
    console.error("Error deleting subscription:", err.message);
  }
}

async function checkUpcomingMeetings() {
  try {
    checkSupabaseConfig();
    const now = new Date();
    
    const { data: clients, error } = await supabase
      .from("clients")
      .select("*")
      .not("nextMeeting", "is", null);
      
    if (error) throw error;
    if (!clients || clients.length === 0) return;
    
    const subs = await readSubscriptions();
    
    for (const client of clients) {
      if (!client.nextMeeting) continue;
      
      const meetingTime = new Date(client.nextMeeting);
      if (isNaN(meetingTime.getTime())) continue;
      
      const diffMs = meetingTime.getTime() - now.getTime();
      const diffMins = diffMs / (1000 * 60);
      
      if (diffMins > 0 && diffMins <= 30) {
        const { data: notifiedData, error: notifiedError } = await supabase
          .from("notified")
          .select("*")
          .eq("clientId", client.id)
          .eq("nextMeeting", client.nextMeeting)
          .maybeSingle();
          
        if (notifiedError) throw notifiedError;
        if (notifiedData) continue;
        
        const payload = JSON.stringify({
          title: "Meeting Reminder",
          body: `Meeting with ${client.name} (${client.company || "No company"}) starts in ${Math.round(diffMins)} minutes!`,
          data: {
            clientId: client.id
          }
        });
        
        console.log(`Sending meeting push notification for client ${client.name} (starts in ${Math.round(diffMins)} mins)`);
        
        const failedSubs = [];
        for (const sub of subs) {
          try {
            await webpush.sendNotification(sub, payload);
          } catch (pushErr) {
            console.error("Push delivery failed:", pushErr.message);
            if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
              failedSubs.push(sub.endpoint);
            }
          }
        }
        
        for (const ep of failedSubs) {
          await removeSubscription(ep);
        }
        
        const settings = await readSettings();
        if (settings.whatsappEnabled && settings.whatsappRecipientPhone) {
          const waText = `Meeting Reminder: Your meeting with ${client.name} (${client.company || "No company"}) starts in ${Math.round(diffMins)} minutes!`;
          await sendWhatsAppMessage(settings, waText);
        }

        await supabase
          .from("notified")
          .upsert({
            clientId: client.id,
            nextMeeting: client.nextMeeting
          });
      } else if (diffMins <= -10) {
        console.log(`Meeting with ${client.name} has passed buffer time. Marking as done.`);
        const { error: updateError } = await supabase
          .from("clients")
          .update({
            stage: "meeting_done",
            nextMeeting: null,
            meetingDoneDate: now.toISOString()
          })
          .eq("id", client.id);
          
        if (updateError) {
          console.error("Error auto-marking meeting as done:", updateError.message);
        } else {
          broadcastUpdate();
        }
      }
    }
  } catch (err) {
    console.error("Scheduler error checking meetings:", err);
  }
}

function startMeetingScheduler() {
  setInterval(checkUpcomingMeetings, 30000);
}

function broadcastUpdate() {
  const payload = JSON.stringify({ type: "update" });
  for (const client of sseClients) {
    client.write(`data: ${payload}\n\n`);
  }
}

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

const allowedClientFields = new Set([
  "name",
  "company",
  "email",
  "phone",
  "service",
  "stage",
  "priority",
  "monthlyValue",
  "setupFee",
  "contractMonths",
  "probability",
  "lastTouch",
  "nextMeeting",
  "meetingDoneDate",
  "owner",
  "source",
  "notes",
  "tasks"
]);

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function badRequest(res, message) {
  sendJson(res, 400, { error: message });
}

async function readClients() {
  try {
    checkSupabaseConfig();
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("createdAt", { ascending: false });
    if (error) throw error;
    return data.map(client => ({
      ...client,
      createdAt: client.createdAt ? new Date(client.createdAt).toISOString() : null,
      updatedAt: client.updatedAt ? new Date(client.updatedAt).toISOString() : null,
      nextMeeting: client.nextMeeting ? new Date(client.nextMeeting).toISOString() : ""
    }));
  } catch (err) {
    console.error("Failed to read clients from Supabase:", err.message);
    return [];
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
    if (Buffer.concat(chunks).length > 1_000_000) {
      throw new Error("Request body is too large");
    }
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function publicPathFor(urlPath, baseDir = PUBLIC_DIR) {
  const safePath = urlPath === "/" ? "/index.html" : urlPath;
  const resolved = path.normalize(path.join(baseDir, safePath));
  if (!resolved.startsWith(baseDir)) return null;
  return resolved;
}

function cleanClientInput(input, isCreate = false) {
  const cleaned = {};
  for (const [key, value] of Object.entries(input)) {
    if (!allowedClientFields.has(key)) continue;
    cleaned[key] = value;
  }

  if (isCreate) {
    cleaned.name = String(cleaned.name || "New client").trim();
    cleaned.company = String(cleaned.company || "").trim();
    cleaned.stage = cleaned.stage || "outreach_done";
    cleaned.service = cleaned.service || "Real Estate VA";
    cleaned.priority = cleaned.priority || "Warm";
    cleaned.monthlyValue = Number(cleaned.monthlyValue || 0);
    cleaned.setupFee = Number(cleaned.setupFee || 0);
    cleaned.contractMonths = Number(cleaned.contractMonths || 1);
    cleaned.probability = Number(cleaned.probability || 25);
    cleaned.tasks = Array.isArray(cleaned.tasks) ? cleaned.tasks : [];
  }

  if ("monthlyValue" in cleaned) {
    cleaned.monthlyValue = Math.max(0, Number(cleaned.monthlyValue) || 0);
  }
  if ("setupFee" in cleaned) {
    cleaned.setupFee = Math.max(0, Number(cleaned.setupFee) || 0);
  }
  if ("contractMonths" in cleaned) {
    cleaned.contractMonths = Math.max(1, Number(cleaned.contractMonths) || 1);
  }
  if ("probability" in cleaned) {
    const val = Number(cleaned.probability);
    cleaned.probability = Number.isNaN(val) ? 25 : Math.min(100, Math.max(0, val));
  }

  if ("tasks" in cleaned && !Array.isArray(cleaned.tasks)) {
    cleaned.tasks = String(cleaned.tasks)
      .split("\n")
      .map((task) => task.trim())
      .filter(Boolean);
  }

  for (const dateField of ["nextMeeting", "meetingDoneDate", "lastTouch"]) {
    if (dateField in cleaned) {
      const val = cleaned[dateField];
      if (val === "" || val === null || val === undefined) {
        cleaned[dateField] = null;
      }
    }
  }

  cleaned.updatedAt = new Date().toISOString();
  return cleaned;
}

async function handleApi(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/login") {
    try {
      const { username, password } = await readBody(req);
      const expectedUsername = process.env.CRM_USERNAME || "admin";
      const expectedHash = process.env.CRM_PASSWORD_HASH;

      if (!username || !password) {
        return sendJson(res, 400, { error: "Username and password are required" });
      }

      const userBuffer = Buffer.from(username);
      const expectedUserBuffer = Buffer.from(expectedUsername);
      let isUsernameValid = false;
      if (userBuffer.length === expectedUserBuffer.length) {
        isUsernameValid = crypto.timingSafeEqual(userBuffer, expectedUserBuffer);
      }

      const isPasswordValid = verifyPassword(password, expectedHash);

      if (isUsernameValid && isPasswordValid) {
        const expires = Date.now() + 8 * 60 * 60 * 1000; // 8 hours
        const token = signToken({ username, expires });

        res.writeHead(200, {
          "Content-Type": "application/json",
          "Set-Cookie": `crm_session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=28800`
        });
        return res.end(JSON.stringify({ success: true }));
      } else {
        return sendJson(res, 401, { error: "Invalid username or password" });
      }
    } catch (err) {
      console.error("Login API error:", err);
      return sendJson(res, 500, { error: "Internal server error" });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Set-Cookie": "crm_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0"
    });
    return res.end(JSON.stringify({ success: true }));
  }

  if (req.method === "GET" && url.pathname === "/api/status") {
    // Check meetings asynchronously in background on user visit
    checkUpcomingMeetings().catch(err => console.error("Background cron error:", err));

    return sendJson(res, 200, {
      supabaseConfigured: !!(supabaseUrl && supabaseKey && isUrlValid),
      supabaseUrlValid: !!isUrlValid,
      supabaseUrl: supabaseUrl || null,
      error: !isUrlValid && supabaseUrl ? "SUPABASE_URL must be a valid URL starting with http:// or https://. Found a key/token instead: " + supabaseUrl : null
    });
  }

  if (req.method === "GET" && url.pathname === "/api/cron/check-meetings") {
    try {
      await checkUpcomingMeetings();
      return sendJson(res, 200, { success: true });
    } catch (err) {
      console.error("Cron check failed:", err);
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/vapid-public-key") {
    return sendJson(res, 200, { publicKey: vapidKeys.publicKey });
  }

  if (req.method === "GET" && url.pathname === "/api/settings") {
    const settings = await readSettings();
    return sendJson(res, 200, settings);
  }

  if (req.method === "PATCH" && url.pathname === "/api/settings") {
    const body = await readBody(req);
    const settings = await readSettings();
    const updated = { ...settings, ...body };
    await writeSettings(updated);
    return sendJson(res, 200, updated);
  }

  if (req.method === "POST" && url.pathname === "/api/test-whatsapp") {
    const settings = await readSettings();
    if (!settings.whatsappEnabled || !settings.whatsappRecipientPhone) {
      return sendJson(res, 200, { success: false, message: "WhatsApp is not enabled or recipient phone is missing." });
    }
    
    try {
      const success = await sendWhatsAppMessage(
        settings,
        "Test Message from Sterling CRM: WhatsApp integration is set up and working perfectly!"
      );
      if (success) {
        return sendJson(res, 200, { success: true });
      } else {
        return sendJson(res, 200, { success: false, message: "OpenWA API returned an error. Check server logs." });
      }
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/subscribe") {
    const subscription = await readBody(req);
    if (!subscription || !subscription.endpoint) {
      return badRequest(res, "Invalid subscription");
    }
    
    try {
      checkSupabaseConfig();
      const { error } = await supabase
        .from("subscriptions")
        .upsert({
          endpoint: subscription.endpoint,
          keys: subscription.keys
        }, { onConflict: "endpoint" });
      if (error) throw error;
      return sendJson(res, 200, { success: true });
    } catch (err) {
      console.error("Failed to save subscription:", err.message);
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/test-push") {
    const subs = await readSubscriptions();
    if (subs.length === 0) {
      return sendJson(res, 200, { success: false, message: "No active push subscriptions found." });
    }
    
    const payload = JSON.stringify({
      title: "CRM Notifications Active",
      body: "Real-time CRM notifications are connected and working perfectly on your device!",
      data: {
        clientId: ""
      }
    });
    
    const failedSubs = [];
    let successCount = 0;
    
    for (const sub of subs) {
      try {
        await webpush.sendNotification(sub, payload);
        successCount++;
      } catch (pushErr) {
        console.error("Test push failed:", pushErr.message);
        if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
          failedSubs.push(sub.endpoint);
        }
      }
    }
    
    for (const ep of failedSubs) {
      await removeSubscription(ep);
    }
    
    return sendJson(res, 200, { success: true, delivered: successCount });
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });
    res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
    sseClients.add(res);
    req.on("close", () => {
      sseClients.delete(res);
    });
    return;
  }

  const parts = url.pathname.split("/").filter(Boolean);

  if (req.method === "GET" && url.pathname === "/api/clients") {
    // Check meetings asynchronously in background on clients load
    checkUpcomingMeetings().catch(err => console.error("Background cron error:", err));

    const clients = await readClients();
    return sendJson(res, 200, clients);
  }

  if (req.method === "POST" && url.pathname === "/api/clients") {
    const body = await readBody(req);
    const client = cleanClientInput(body, true);
    
    try {
      checkSupabaseConfig();
      const { data, error } = await supabase
        .from("clients")
        .insert([client])
        .select()
        .single();
      if (error) throw error;
      
      broadcastUpdate();
      return sendJson(res, 201, {
        ...data,
        createdAt: data.createdAt ? new Date(data.createdAt).toISOString() : null,
        updatedAt: data.updatedAt ? new Date(data.updatedAt).toISOString() : null,
        nextMeeting: data.nextMeeting ? new Date(data.nextMeeting).toISOString() : ""
      });
    } catch (err) {
      console.error("Failed to create client in Supabase:", err.message);
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (parts[0] === "api" && parts[1] === "clients" && parts[2]) {
    const clientId = parts[2];

    if (req.method === "GET") {
      try {
        checkSupabaseConfig();
        const { data, error } = await supabase
          .from("clients")
          .select("*")
          .eq("id", clientId)
          .maybeSingle();
        if (error) throw error;
        if (!data) return sendJson(res, 404, { error: "Client not found" });
        return sendJson(res, 200, {
          ...data,
          createdAt: data.createdAt ? new Date(data.createdAt).toISOString() : null,
          updatedAt: data.updatedAt ? new Date(data.updatedAt).toISOString() : null,
          nextMeeting: data.nextMeeting ? new Date(data.nextMeeting).toISOString() : ""
        });
      } catch (err) {
        console.error("Failed to get client:", err.message);
        return sendJson(res, 500, { error: err.message });
      }
    }

    if (req.method === "PATCH") {
      const body = await readBody(req);
      const cleaned = cleanClientInput(body);
      
      try {
        checkSupabaseConfig();
        const { data, error } = await supabase
          .from("clients")
          .update(cleaned)
          .eq("id", clientId)
          .select()
          .single();
        if (error) throw error;
        if (!data) return sendJson(res, 404, { error: "Client not found" });
        
        broadcastUpdate();
        return sendJson(res, 200, {
          ...data,
          createdAt: data.createdAt ? new Date(data.createdAt).toISOString() : null,
          updatedAt: data.updatedAt ? new Date(data.updatedAt).toISOString() : null,
          nextMeeting: data.nextMeeting ? new Date(data.nextMeeting).toISOString() : ""
        });
      } catch (err) {
        console.error("Failed to update client:", err.message);
        return sendJson(res, 500, { error: err.message });
      }
    }

    if (req.method === "DELETE") {
      try {
        checkSupabaseConfig();
        const { error } = await supabase
          .from("clients")
          .delete()
          .eq("id", clientId);
        if (error) throw error;
        
        broadcastUpdate();
        return sendJson(res, 200, { success: true });
      } catch (err) {
        console.error("Failed to delete client:", err.message);
        return sendJson(res, 500, { error: err.message });
      }
    }
  }

  sendJson(res, 404, { error: "API route not found" });
}

async function handleStatic(req, res, url, isAuthenticated) {
  const PUBLIC_UNAUTH_PATHS = new Set([
    "/login.html",
    "/favicon.ico",
    "/manifest.json",
    "/sw.js",
    "/api/cron/check-meetings"
  ]);

  const isPublicFile = PUBLIC_UNAUTH_PATHS.has(url.pathname);
  
  if (!isPublicFile && !isAuthenticated) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  const baseDir = isPublicFile ? PUBLIC_DIR : PRIVATE_DIR;
  const filePath = publicPathFor(url.pathname, baseDir);
  if (!filePath) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  try {
    const ext = path.extname(filePath);
    const content = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
    res.end(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      if (isAuthenticated) {
        try {
          const fallback = await fs.readFile(path.join(PRIVATE_DIR, "index.html"));
          res.writeHead(200, { "Content-Type": contentTypes[".html"] });
          return res.end(fallback);
        } catch (fallbackErr) {
          res.writeHead(404);
          return res.end("Not Found");
        }
      } else {
        try {
          const fallback = await fs.readFile(path.join(PUBLIC_DIR, "login.html"));
          res.writeHead(200, { "Content-Type": contentTypes[".html"] });
          return res.end(fallback);
        } catch (fallbackErr) {
          res.writeHead(404);
          return res.end("Not Found");
        }
      }
    }
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    // Cookie-based Session Authentication Check
    const cookies = parseCookies(req.headers.cookie);
    const sessionToken = cookies.crm_session;
    const session = verifyToken(sessionToken);
    const isAuthenticated = !!session;
    
    // Allow login endpoint always
    if (url.pathname === "/api/login") {
      return await handleApi(req, res, url);
    }
    
    // Public paths allowed without authentication
    const PUBLIC_UNAUTH_PATHS = new Set([
      "/login.html",
      "/favicon.ico",
      "/manifest.json",
      "/sw.js",
      "/api/cron/check-meetings" // Exempt cron endpoint from authentication so trigger runs automatically
    ]);
    
    if (!isAuthenticated) {
      // If requesting API, return 401
      if (url.pathname.startsWith("/api/")) {
        return sendJson(res, 401, { error: "Unauthorized" });
      }
      
      // If requesting a non-public file, redirect to /login.html
      if (!PUBLIC_UNAUTH_PATHS.has(url.pathname)) {
        res.writeHead(302, { "Location": "/login.html" });
        return res.end();
      }
    } else {
      // If authenticated and trying to access login.html, redirect to /
      if (url.pathname === "/login.html") {
        res.writeHead(302, { "Location": "/" });
        return res.end();
      }
    }
    
    if (url.pathname.startsWith("/api/")) {
      return await handleApi(req, res, url);
    }
    return await handleStatic(req, res, url, isAuthenticated);
  } catch (error) {
    if (error instanceof SyntaxError) return badRequest(res, "Invalid JSON body");
    console.error(error);
    sendJson(res, 500, { error: "Server error" });
  }
});

if (!process.env.VERCEL) {
  (async () => {
    try {
      await initVapid();
      startMeetingScheduler();
      server.listen(PORT, () => {
        console.log(`Sterling Halberg CRM running at http://localhost:${PORT}`);
      });
    } catch (err) {
      console.error("Failed to initialize VAPID/Scheduler:", err);
      process.exit(1);
    }
  })();
} else {
  // Running on Vercel: run VAPID initialization once
  initVapid().catch(err => console.error("Vercel VAPID init error:", err));
}

module.exports = server;
