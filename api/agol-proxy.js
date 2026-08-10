const PORTAL_URL = "https://vignevin.maps.arcgis.com";
const USERNAME = "STAGE_IFV";

export default async function handler(req, res) {
  // ── Headers CORS ──
  res.setHeader("Access-Control-Allow-Origin", "https://compilebsv.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const body = req.body;
  const { action } = body;

  try {
    let result;

    switch (action) {
      case "upload":
        result = await handleUpload(body);
        break;
      case "analyze":
        result = await handleAnalyze(body);
        break;
      case "publish":
        result = await handlePublish(body);
        break;
      default:
        return res.status(400).json({ error: "Action inconnue : " + action });
    }

    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// ── Génère un token de session utilisateur classique ────────────────────
async function getUserToken() {
  const username = process.env.AGOL_USERNAME;
  const password = process.env.AGOL_PASSWORD;

  const params = new URLSearchParams({
    username,
    password,
    referer: PORTAL_URL,
    expiration: "60",
    f: "json"
  });

  const resp = await fetch(`${PORTAL_URL}/sharing/rest/generateToken`, {
    method: "POST",
    body: params
  });
  const data = await resp.json();
  if (data.error) throw new Error("generateToken : " + JSON.stringify(data.error));
  return data.token;
}

// ── addItem ──────────────────────────────────────────────────────────
async function handleUpload({ fileName, fileContent }) {
  const token = await getUserToken();
  const buffer = Buffer.from(fileContent, "base64");
  const blob = new Blob([buffer], { type: "text/csv" });

  const formData = new FormData();
  formData.append("file", blob, fileName);
  formData.append("title", "upload_sppr_" + Date.now());
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
async function handleAnalyze({ csvText }) {
  const token = await getUserToken();
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

// ── publish ──────────────────────────────────────────────────────────
async function handlePublish({ itemId, publishParameters }) {
  const token = await getUserToken();

  publishParameters.name = "couche_" + Date.now();
  publishParameters.locationType = "none";
  delete publishParameters.geometryType;

  if (publishParameters.layerInfo) {
    delete publishParameters.layerInfo.geometryType;
    publishParameters.layerInfo.name = publishParameters.name;
    publishParameters.layerInfo.type = "Table";
  }

  const params = new URLSearchParams({
    itemId,
    filetype: "csv",
    publishParameters: JSON.stringify(publishParameters),
    token,
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

  return {
    success: true,
    itemId: data.services[0].serviceItemId,
    serviceUrl: data.services[0].serviceurl
  };
}
