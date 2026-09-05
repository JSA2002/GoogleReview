const SHOP = {
  name: "Specta Quartz",
  city: "Sohna, Gurugram (NCR), Haryana", // ← your exact city / area
  products: "quartz surfaces, marble, granite and custom kitchen countertops",
  services: "showroom visit, slab selection, custom sizes, delivery and installation",
  audience: "homeowners, interior designers, architects and contractors"
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    if (request.method === "GET") {
      return new Response(
        "Specta review backend is running. POST {\"stars\":5,\"keywords\":[\"Price\"]} to generate reviews.",
        { headers: { ...CORS, "Content-Type": "text/plain" } }
      );
    }

    if (request.method !== "POST") return json({ error: "Use POST" }, 405);

    try {
      if (!env.GEMINI_API_KEY) {
        return json({ error: "GEMINI_API_KEY secret is not set on the Worker" }, 500);
      }

      const body = await request.json();
      const stars = Math.min(5, Math.max(1, parseInt(body.stars, 10) || 5));
      const keywords = Array.isArray(body.keywords)
        ? body.keywords.filter(k => typeof k === "string" && k.trim()).slice(0, 7)
        : [];

      const aiRes = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: buildPrompt(stars, keywords) }] }],
            generationConfig: { temperature: 1.2, responseMimeType: "application/json" }
          })
        }
      );

      if (!aiRes.ok) {
        const detail = await aiRes.text();
        return json({ error: "Gemini API error " + aiRes.status, detail: detail.slice(0, 300) }, 502);
      }

      const data = await aiRes.json();
      const text = (data.candidates?.[0]?.content?.parts?.[0]?.text) || "";
      let parsed = null;
      try { parsed = JSON.parse(text); } catch (e) { /* fall through */ }

      let reviews = Array.isArray(parsed) ? parsed : (parsed && parsed.reviews) || [];
      reviews = reviews.filter(r => typeof r === "string" && r.trim()).slice(0, 5);
      if (!reviews.length) return json({ error: "Model returned no usable reviews" }, 502);

      return json({ reviews });
    } catch (err) {
      return json({ error: String((err && err.message) || err) }, 500);
    }
  }
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...CORS }
  });
}

function buildPrompt(stars, keywords) {
  const kwLine = keywords.length
    ? "The customer wants the review to talk about these areas: " + keywords.join(", ") + "."
    : "The customer did not pick specific areas, so cover the overall experience.";

  const tone = {
    5: "Very happy and enthusiastic, but still believable",
    4: "Very good; great positive",
    3: "Good overall; honest and balanced but still positive",
    2: "Polite and fair; mixed feelings",
    1: "Disappointed but respectful"
  }[stars];

  return "You write Google reviews for a real shop. Write exactly 5 DIFFERENT review suggestions.\n\n" +
"SHOP FACTS (use only these facts very strictly; never invent other facts):\n" +
"- Name: " + SHOP.name + "\n" +
"- Location: " + SHOP.city + "\n" +
"- Sells: " + SHOP.products + "\n" +
"- Services: " + SHOP.services + "\n" +
"- Typical customers: " + SHOP.audience + "\n\n" +
"CUSTOMER INPUT:\n" +
"- Star rating they will give: " + stars + " out of 5 (tone: " + tone + ").\n" +
"- " + kwLine + "\n\n" +
"OUTPUT FORMAT:\n" +
'Return ONLY valid JSON: {"reviews": ["review1", "review2", "review3", "review4", "review5"]}\n' +
"- Exactly 5 reviews, each 35-75 words.\n" +
"- Each must sound like a different real person wrote it (different ages and purposes: new homeowner, renovation, contractor, interior designer, second purchase, etc.).\n\n" +
"WRITING RULES (very important):\n" +
"- Human and conversational. Use contractions (I'm, didn't, it's). Vary sentence lengths.\n" +
"- 100% unique wording, no copied review templates, no plagiarism.\n" +
"- No AI traces: never use \"hidden gem\", \"game-changer\", \"seamless\", \"elevate\", \"look no further\", \"world-class\", \"state-of-the-art\", \"testament\", \"delve\". Maximum ONE exclamation mark per review. No em dashes. No hashtags. No emojis. No bullet points. Never start two reviews with the same word.\n" +
"- Mention the shop name at most once per review, naturally.\n" +
"- For local visibility, 2 or 3 of the 5 reviews should naturally mention the city/area the way a real customer would (e.g. \"one of the better quartz showrooms around " + SHOP.city + "\").\n" +
"- Naturally use product words people search for (quartz, marble, granite, countertop, kitchen) where they fit; never keyword-stuff.\n" +
"- Weave in the requested areas with small concrete details (a slab colour, a staff member explaining maintenance, a measurement done on the spot).\n" +
"- Keep the " + stars + "-star tone exactly.";
}
