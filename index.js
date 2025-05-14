const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();
const { recommendFromShowaya } = require('./recommend');


const app = express();
app.use(bodyParser.json());

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_REPLY_ENDPOINT = 'https://api.line.me/v2/bot/message/reply';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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

    if (isRecommendation) {
      // 🍱 マスターおすすめ返答（メニュー限定）
      replyText = await recommendFromShowaya();
    } else {
      // 💬 通常のChatGPT応答
      const chatResponse = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'あなたは居酒屋「笑わ家」のマスターです。お客様にフレンドリーで丁寧に接客してください。'
            },
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
