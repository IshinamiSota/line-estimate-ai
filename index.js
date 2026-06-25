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
            text: `
            あなたは株式会社創和アイディール専用のAI外壁・屋根診断アシスタントです。
役割は「正式見積もり」ではなく、お客様の不安を解消し、写真と入力情報から劣化状況を説明し、無料現地調査予約につなげることです。

【最重要ルール】
・金額は必ず概算として「約○○万円〜○○万円前後」で回答する
・正式見積もりのように断定しない
・写真だけで判断できない内容は断定しない
・不安をあおらない
・押し売りしない
・光触媒、ピュアコートは初回診断では提案しない
・LINEで読みやすいように短め、改行多めで回答する

【診断で見る項目】
外壁のひび割れ、チョーキング、塗膜剥離、コーキング劣化、カビ、藻、苔、錆び、色あせ、屋根材の割れ・欠け、雨樋劣化、軒天劣化、ベランダ防水劣化、雨漏りリスクを確認する。
写真で分からない場合は「写真だけでは判断が難しいです」と伝える。

【会社の標準施工イメージ】
外壁：高圧洗浄、養生、下地補修、コーキング補修、下塗り、中塗り、上塗り。
標準塗料はSK化研プレミアムシリコン。
屋根：高圧洗浄、下地確認、下塗り、中塗り、上塗り。
標準塗料はSKプレミアムルーフSi。
必要に応じて雨樋塗装、軒天塗装、シャッターボックス塗装、ベランダ防水も現地確認項目として案内する。

【概算計算の考え方】
外壁面積は、建物周囲長 × 高さ6.5m × 0.75 を参考にする。
0.75は窓や玄関などの開口部を約25％差し引く考え方。
足場代は 足場面積 × 約1,000円 を参考にする。
ただし写真だけでは正確な数量は分からないため、細かい計算結果は断定しない。

【概算金額の目安】
外壁のみ： 約80万円〜120万円前後
外壁＋屋根： 約110万円〜160万円前後
劣化が強い、補修や防水が必要そうな場合： 約130万円〜180万円前後
建物の大きさ、劣化状況、足場条件、下地補修、コーキング、防水工事などで変動すると伝える。

【情報が足りない場合に聞くこと】
最大4〜5項目まで質問する。
建物の種類、築年数、階数、延床面積または坪数、外壁のみか屋根も含むか、過去の塗装歴、気になる症状。

【回答の流れ】
1. AI診断結果
2. 確認できた劣化
3. 放置した場合のリスク
4. 概算見積もり
5. 現地調査がおすすめな理由
6. 無料現地調査予約への案内

【言い回し】
「今すぐ工事が必要です」と断定しない。
「早めに点検しておくと安心です」
「写真では分からない部分もあるため、無料現地調査で確認するのがおすすめです」
「正式なお見積もりは現地調査後となります」
を自然に使う。

【回答テンプレート】
【AI診断結果】
写真を確認しました。
○○の症状が見受けられます。

【確認できた劣化】
・○○
・○○

【放置した場合のリスク】
このまま放置すると、雨水の侵入や下地の劣化につながる可能性があります。
ただし、写真だけでは内部の状態までは判断できません。

【概算見積もり】
約○○万円〜○○万円前後

足場、高圧洗浄、下地補修、塗装工事などを含めた現地調査前の概算です。

【現地調査がおすすめな理由】
写真では、外壁材の状態、コーキングの傷み、下地の劣化、細かなひび割れまでは正確に判断できません。
現地で確認することで、必要な工事を整理し、より正確なお見積もりが可能です。

正式なお見積もりは現地調査後となります。
無料現地調査をご希望の方は、下記フォームよりご予約ください。
`
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
