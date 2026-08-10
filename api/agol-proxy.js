const PORTAL_URL = "https://vignevin.maps.arcgis.com";
const USERNAME = "STAGE_IFV";

export default async function handler(req, res) {
  // ── Headers CORS ──
  res.setHeader("Access-Control-Allow-Origin", "https://antoineifv.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const API_KEY = process.env.AGOL_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: "Clé API non configurée côté serveur" });
  }

  const body = req.body;
  const { action } = body;

  try {
    let result;

    switch (action) {
      case "upload":
        result = await handleUpload(body, API_KEY);
        break;
      case "analyze":
        result = await handleAnalyze(body, API_KEY);
        break;
      case "publish":
        result = await handlePublish(body, API_KEY);
        break;
      default:
        return res.status(400).json({ error: "Action inconnue : " + action });
    }

    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// ── addItem ──────────────────────────────────────────────────────────
async function handleUpload({ fileName, fileContent }, token) {
  const buffer = Buffer.from(fileContent, "base64");
  const blob = new Blob([buffer], { type: "text/csv" });

  const formData = new FormData();
  formData.append("file", blob, fileName);
  formData.append("title", "upload_" + Date.now());
  formData.append("type", "CSV");
  formData.append("token", token);
  formData.append("f", "json");

  const resp = await fetch(
    `${PORTAL_URL}/sharing/rest/content/users/${USERNAME}/addItem`,
    { method: "POST", body: formData }
  );
  const data = await resp.json();
  if (data.error) throw new Error("addItem : " + data.error.message);
  return data;
}

// ── analyze ──────────────────────────────────────────────────────────
async function handleAnalyze({ csvText }, token) {
  await new Promise(resolve => setTimeout(resolve, 2000));

  const params = new URLSearchParams({
    text: csvText,
    fileType: "csv",
    f: "json",
    token,
    analyzeParameters: JSON.stringify({ locationType: "none" })
  });

  const resp = await fetch(
    `${PORTAL_URL}/sharing/rest/content/features/analyze`,
    { method: "POST", body: params }
  );
  const data = await resp.json();
  if (data.error) throw new Error("analyze : " + data.error.message);
  return data;
}

// ── Génère un token OAuth2 via client_credentials ──────────────────────
async function getOAuthToken() {
  const clientId = process.env.AGOL_CLIENT_ID;
  const clientSecret = process.env.AGOL_CLIENT_SECRET;

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    f: "json"
  });

  const resp = await fetch("https://www.arcgis.com/sharing/rest/oauth2/token", {
    method: "POST",
    body: params
  });
  const data = await resp.json();
  if (data.error) throw new Error("oauth2/token : " + JSON.stringify(data.error));
  return data.access_token;
}

// ── publish (utilise un token OAuth2, pas la clé API) ──────────────────
async function handlePublish({ itemId, publishParameters }, token) {
  const oauthToken = await getOAuthToken();

  publishParameters.name = "couche_" + Date.now();
  publishParameters.locationType = "none";
  delete publishParameters.geometryType;

  if (publishParameters.layerInfo) {
    delete publishParameters.layerInfo.geometryType;
    publishParameters.layerInfo.name = publishParameters.name;
    publishParameters.layerInfo.type = "Table";
  }

  console.log("publishParameters envoyés à AGOL :", JSON.stringify(publishParameters));

  const params = new URLSearchParams({
    itemId,
    filetype: "csv",
    publishParameters: JSON.stringify(publishParameters),
    token: oauthToken,
    f: "json"
  });

  const resp = await fetch(
    `${PORTAL_URL}/sharing/rest/content/users/${USERNAME}/publish`,
    { method: "POST", body: params }
  );
  const data = await resp.json();
  console.log("Réponse AGOL publish :", JSON.stringify(data));
  if (data.error) throw new Error("publish : " + data.error.message);
  if (!data.services || !data.services[0] || data.services[0].success === false) {
    throw new Error("publish : " + JSON.stringify(data.services));
  }
  return data;
}