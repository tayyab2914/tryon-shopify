import { GoogleGenAI } from "@google/genai";

// Switch between Vertex AI and the Gemini Developer API via env.
// USE_VERTEX=true  -> Vertex AI (service account auth)
// USE_VERTEX unset -> Gemini Developer API (auth via GEMINI_API_KEY)

function serviceAccountCredentials(): Record<string, unknown> | undefined {
  const raw = process.env.GCP_SERVICE_ACCOUNT_KEY;
  if (!raw) return undefined;
  const json = raw.trim().startsWith("{")
    ? raw
    : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(json) as Record<string, unknown>;
}

// Lazy so importing this module during build doesn't require credentials.
let client: GoogleGenAI | undefined;

function getClient(): GoogleGenAI {
  if (client) return client;
  const useVertex = process.env.USE_VERTEX === "true";
  if (useVertex) {
    const credentials = serviceAccountCredentials();
    client = new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT!,
      location: process.env.GOOGLE_CLOUD_LOCATION ?? "global",
      googleAuthOptions: credentials ? { credentials } : undefined,
    });
  } else {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }
  return client;
}

const TRYON_PROMPT = `You are a virtual fashion try-on AI.

I am giving you exactly two images:
  Image 1 — a person (the customer). They may be standing, facing front or at a slight angle.
  Image 2 — a garment product photo from a clothing brand store.

Your task: Generate ONE photorealistic output image showing the person from Image 1 wearing the garment from Image 2.

Strict rules:
1. Preserve the person's face, skin tone, hair, and body proportions exactly.
2. Keep the person's original pose and background.
3. The garment must fit the person's body naturally — account for body shape and pose.
4. Maintain the garment's color, texture, pattern, and design details faithfully.
5. Match the garment's lighting to the lighting in the person's photo.
6. The result must look like a real, professional fashion photograph — not a collage or cut-paste.
7. Do NOT add text, watermarks, frames, or any UI elements.
8. Output only the composite image, nothing else.`;

const PRICE_PER_1M = {
  inputText: Number(process.env.PRICE_INPUT_TEXT_PER_1M ?? 0.5),
  inputImage: Number(process.env.PRICE_INPUT_IMAGE_PER_1M ?? 0.5),
  outputText: Number(process.env.PRICE_OUTPUT_TEXT_PER_1M ?? 3.0),
  outputImage: Number(process.env.PRICE_OUTPUT_IMAGE_PER_1M ?? 60.0),
};

interface ModalityTokenCount {
  modality?: string;
  tokenCount?: number;
}

function tokensFor(
  details: ModalityTokenCount[] | undefined,
  modality: string,
): number {
  return (details ?? [])
    .filter((d) => d.modality === modality)
    .reduce((sum, d) => sum + (d.tokenCount ?? 0), 0);
}

function logCost(
  usage:
    | {
        promptTokensDetails?: ModalityTokenCount[];
        candidatesTokensDetails?: ModalityTokenCount[];
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        thoughtsTokenCount?: number;
        totalTokenCount?: number;
      }
    | undefined,
): void {
  if (!usage) return;

  const inImageTok = tokensFor(usage.promptTokensDetails, "IMAGE");
  const inTextTok = usage.promptTokensDetails?.length
    ? tokensFor(usage.promptTokensDetails, "TEXT")
    : (usage.promptTokenCount ?? 0);

  const outImageTok = usage.candidatesTokensDetails?.length
    ? tokensFor(usage.candidatesTokensDetails, "IMAGE")
    : (usage.candidatesTokenCount ?? 0);
  const outTextTok = tokensFor(usage.candidatesTokensDetails, "TEXT");
  const thoughtsTok = usage.thoughtsTokenCount ?? 0;

  const cost = (tok: number, rate: number) => (tok / 1_000_000) * rate;

  const inputCost =
    cost(inTextTok, PRICE_PER_1M.inputText) +
    cost(inImageTok, PRICE_PER_1M.inputImage);
  const outputCost =
    cost(outTextTok + thoughtsTok, PRICE_PER_1M.outputText) +
    cost(outImageTok, PRICE_PER_1M.outputImage);
  const total = inputCost + outputCost;

  console.log(
    `[TryOn][cost] in: ${inTextTok}t+${inImageTok}i=$${inputCost.toFixed(6)} | ` +
      `out: ${outTextTok}t+${thoughtsTok}th+${outImageTok}i=$${outputCost.toFixed(6)} | ` +
      `TOTAL=$${total.toFixed(6)} (${usage.totalTokenCount ?? 0} tok)`,
  );
}

export interface TryOnInput {
  personBase64: string;
  personMimeType: string;
  garmentBase64: string;
  garmentMimeType: string;
}

export async function runTryOn({
  personBase64,
  personMimeType,
  garmentBase64,
  garmentMimeType,
}: TryOnInput): Promise<{ imageBase64: string; mimeType: string }> {
  const response = await getClient().models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: personMimeType, data: personBase64 } },
          { inlineData: { mimeType: garmentMimeType, data: garmentBase64 } },
          { text: TRYON_PROMPT },
        ],
      },
    ],
    config: { responseModalities: ["IMAGE", "TEXT"] },
  });

  logCost(response.usageMetadata);

  const candidates = response.candidates;
  if (!candidates?.length) throw new Error("Gemini returned no candidates");

  for (const part of candidates[0].content?.parts ?? []) {
    if (part.inlineData?.data) {
      return {
        imageBase64: part.inlineData.data,
        mimeType: part.inlineData.mimeType ?? "image/png",
      };
    }
  }

  throw new Error("Gemini response contained no image data");
}
