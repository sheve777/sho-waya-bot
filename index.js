const express = require('express');
const app = express(); // ← 忘れずに追加！
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const fs = require('fs');
const path = require('path');

// メニュー読み込み
const menu = JSON.parse(fs.readFileSync(path.join(__dirname, 'menu.json'), 'utf-8'));

// 値段検索
function searchPriceFromMenu(userText) {
  for (const item of menu) {
    if (userText.includes(item.品名)) {
      return `${item.品名} は ${item.価格}円です。`;
    }
  }
  return null;
}

// おすすめ生成（カテゴリを絞る）
function recommendFromShowaya() {
  const recommendCategories = [
    "焼き物", "刺し", "揚げ物", "煮込み", "一品料理",
    "炭火串焼き（豚肉）", "炭火串焼き（鶏肉）", "野菜串焼き", "うなぎ串焼き"
  ];
  const filtered = menu.filter(item => recommendCategories.includes(item.カテゴリ));
  const randomItems = [...filtered].sort(() => 0.5 - Math.random()).slice(0, 3);
  return `今日のおすすめはこちらです！\n・${randomItems.map(i => `${i.品名}（${i.価格}円）`).join('\n・')}`;
}

app.use(bodyParser.json());

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LINE_REPLY_ENDPOINT = 'https://api.line.me/v2/bot/message/reply';

// 会話履歴（ユーザーIDごと）
const conversationMap = new Map();

// Webhook受信
app.post('/webhook', async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userMessage = event.message.text;
      const replyToken = event.replyToken;
      const userId = event.source.userId;

      // 履歴用意
      if (!conversationMap.has(userId)) {
        conversationMap.set(userId, []);
      }
      const history = conversationMap.get(userId);

      // 最初の人格指定
      if (history.length === 0) {
        history.push({
          role: 'system',
          content: 'あなたは居酒屋「笑わ家（しょうわや）」のマスターです。昭和の雰囲気で丁寧に、フレンドリーにお客様と会話してください。'
        });
      }

      const priceAnswer = searchPriceFromMenu(userMessage);
      const triggers = ["おすすめ", "何食べ", "何飲む", "迷ってる", "今日のおすすめ"];
      const isRecommendation = triggers.some(word => userMessage.includes(word));

      let replyText = '';

      try {
        if (priceAnswer) {
          // 値段検索結果を返信
          replyText = priceAnswer;
        } else if (isRecommendation) {
          // GPTでおすすめ（ただし明示的にmenuから抽出）
          replyText = recommendFromShowaya();
        } else {
          // 通常のChatGPT応答
          history.push({ role: 'user', content: userMessage });

          const chatResponse = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
              model: 'gpt-4',
              messages: history
            },
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${OPENAI_API_KEY}`
              }
            }
          );

          replyText = chatResponse.data.choices[0].message.content;
          history.push({ role: 'assistant', content: replyText });
        }

        // 応答をLINEに返す（空の場合を除外）
        if (replyText) {
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
        }
      } catch (error) {
        console.error('エラー:', error.response?.data || error.message);
      }
    }
  }

  res.sendStatus(200);
});

// 起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`マスターのサーバーが起動しました！ポート: ${PORT}`);
});
