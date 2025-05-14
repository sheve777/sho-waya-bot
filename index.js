const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();
const { recommendFromShowaya } = require('./recommend');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.json());

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_REPLY_ENDPOINT = 'https://api.line.me/v2/bot/message/reply';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// menu.json を読み込む
const menu = JSON.parse(fs.readFileSync(path.join(__dirname, 'menu.json'), 'utf-8'));

// 値段を検索する関数
function searchPriceFromMenu(userText) {
  for (const item of menu) {
    if (userText.includes(item.品名)) {
      return `${item.品名} は ${item.価格}円です。`;
    }
  }
  return null;
}

// LINEからメッセージ受信
app.post('/webhook', async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userMessage = event.message.text;
      const replyToken = event.replyToken;

      const triggers = ["おすすめ", "何食べ", "何飲む", "迷ってる", "今日のおすすめ"];
      const isRecommendation = triggers.some(word => userMessage.includes(word));

      try {
        let replyText;
        const priceAnswer = searchPriceFromMenu(userMessage);

        // システムメッセージ：マスター人格＋価格情報があれば補足
        let systemPrompt = 'あなたは居酒屋「笑わ家（しょうわや）」のマスターです。昭和の雰囲気で、フレンドリーかつ丁寧に接客してください。';
        if (priceAnswer) {
          systemPrompt += `\n以下の価格情報を参考にしてください：「${priceAnswer}」`;
        }

        if (isRecommendation) {
          // 🍱 GPTでおすすめ（メニュー限定）
          replyText = await recommendFromShowaya();
        } else {
          // 💬 GPTで応答（必要なら価格情報含める）
          const chatResponse = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
              model: 'gpt-4',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
              ]
            },
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${OPENAI_API_KEY}`
              }
            }
          );
          replyText = chatResponse.data.choices[0].message.content;
        }

        // LINEに返答
        await axios.post(
          LINE_REPLY_ENDPOINT,
          {
            replyToken: replyToken,
            messages: [{ type: 'text', text: replyText }]
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${LINE_ACCESS_TOKEN}`
            }
          }
        );
      } catch (error) {
        console.error('エラー:', error.response?.data || error.message);
      }
    }
  }

  res.sendStatus(200);
});

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`マスターのサーバーが起動しました！ポート: ${PORT}`);
});
