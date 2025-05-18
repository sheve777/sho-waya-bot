const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { recommendFromShowaya } = require('./recommend');

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

// Express 初期化
const app = express();
app.use(bodyParser.json());

// 環境変数
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_REPLY_ENDPOINT = 'https://api.line.me/v2/bot/message/reply';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// 会話履歴（userId ごと）
const conversationMap = new Map();

// Webhook エンドポイント
app.post('/webhook', async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userMessage = event.message.text;
      const replyToken = event.replyToken;
      const userId = event.source.userId;

      // 会話履歴の初期化
      if (!conversationMap.has(userId)) {
        conversationMap.set(userId, []);
      }

      const history = conversationMap.get(userId);

      // 最初のsystemプロンプト
      if (history.length === 0) {
        history.push({
          role: 'system',
          content: `
あなたは昭和の雰囲気が残る居酒屋「笑わ家（しょうわや）」のマスターです。
口調は丁寧で親しみやすく、お客様との会話を楽しみながら接客してください。
提案や案内は必ず「menu.json」のメニューにあるものだけにしてください。
飲み放題、コース、存在しない料理・ドリンクは提案してはいけません。
          `.trim()
        });
      }

      const priceAnswer = searchPriceFromMenu(userMessage);
      const triggers = ["おすすめ", "何食べ", "何飲む", "迷ってる", "今日のおすすめ"];
      const isRecommendation = triggers.some(word => userMessage.includes(word));

      let replyText = '';

      try {
        if (isRecommendation) {
          // ✅ おすすめは独立処理
          replyText = recommendFromShowaya();
        } else {
          // ✅ 値段だけの応答も事前に入れて文脈維持
          if (priceAnswer) {
            history.push({
              role: 'assistant',
              content: priceAnswer
            });
          }

          // ユーザー発話
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

          // GPT返答を履歴に保存
          history.push({ role: 'assistant', content: replyText });
        }

        // LINEに送信
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
