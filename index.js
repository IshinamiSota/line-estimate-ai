import express from "express";
import { Client, middleware } from "@line/bot-sdk";
import OpenAI from "openai";

const app = express();

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const client = new Client(config);
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const userData = new Map();

app.get("/", (req, res) => {
  res.send("AI estimate LINE bot is working!");
});

app.post("/webhook", middleware(config), async (req, res) => {
  try {
    await Promise.all(req.body.events.map(handleEvent));
    res.status(200).end();
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  if (event.type !== "message") return;

  const userId = event.source.userId;

  if (!userData.has(userId)) {
    userData.set(userId, {
      texts: [],
      images: []
    });
  }

  const data = userData.get(userId);

  if (event.message.type === "text") {
    data.texts.push(event.message.text);

    const reply = await createEstimateReply(data);

    return client.replyMessage(event.replyToken, {
      type: "text",
      text: reply
    });
  }

  if (event.message.type === "image") {
    const stream = await client.getMessageContent(event.message.id);

    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    const base64Image = buffer.toString("base64");

    data.images.push(base64Image);

    return client.replyMessage(event.replyToken, {
      type: "text",
      text: "写真を受け取りました。次に、建物の種類・階数・築年数・坪数・希望工事内容を送ってください。"
    });
  }

  return client.replyMessage(event.replyToken, {
    type: "text",
    text: "写真または文章で送ってください。"
  });
}

async function createEstimateReply(data) {
  const textInfo = data.texts.join("\n");

  const imageContent = data.images.slice(-3).map((base64) => ({
    type: "input_image",
    image_url: `data:image/jpeg;base64,${base64}`
  }));

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: "あなたは不動産会社・リフォーム会社の概算見積もり補助AIです。写真と文章から、現地調査前の概算見積もりを短く日本語で返してください。不明点が多い場合は、無理に金額を出さず追加質問してください。確定見積もりではないことを必ず伝えてください。"
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `お客様情報:\n${textInfo}\n\n形式:\n【概算見積もり】\n○○万円〜○○万円\n\n【理由】\n・\n・\n\n【追加確認】\n・\n・\n\n【注意】\n現地調査前の概算です。`
          },
          ...imageContent
        ]
      }
    ]
  });

return response.output_text + `

━━━━━━━━━━━━━━

【無料現地調査予約】

概算見積もり後、
正式なお見積りは現地確認後にご案内いたします。

ご希望の方はこちらからご予約ください。

https://forms.gle/VgUruwEaboRBUbrE9

━━━━━━━━━━━━━━`;
}

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
