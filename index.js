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

// メニュー読み込み
const menu = JSON.parse(fs.readFileSync(path.join(__dirname, 'menu.json'), 'utf-8'));

// 値段検索関数
function searchPriceFromMenu(userText) {
  for (const item of menu) {
    if (userText.includes(item.品名)) {
      return `${item.品名} は ${item.価格}円です。`;
    }
  }
  return null;
}

// 会話履歴マップ（userIdごとに記録）
const conversationMap = new Map();

// Webhook受信
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

      // システムプロンプト（最初のみ）
      if (history.length === 0) {
        history.push({
          role: 'system',
          content: 'あなたは居酒屋「笑わ家（しょうわや）」のマスターです。昭和の雰囲気で丁寧に、フレンドリーにお客様と会話してください。'
        });
      }

      // 値段チェック（マスターに伝える用）
      const priceAnswer = searchPriceFromMenu(userMessage);
      if (priceAnswer) {
        history.push({
          role: 'system',
          content: `以下の情報はメニュー検索から得られた価格です：「${priceAnswer}」。それを参考にマスターとして返答してください。`
        });
      }

      // 「おすすめ」ワードチェック
      const triggers = ["おすすめ", "何食べ", "何飲む", "迷ってる", "今日のおすすめ"];
      const isRecommendation = triggers.some(word => userMessage.includes(word));

      let replyText = '';

      try {
        if (isRecommendation) {
          // GPTでおすすめ
          replyText = await recommendFromShowaya();
        } else {
          // 会話履歴にユーザー発話を追加
          history.push({ role: 'user', content: userMessage });

          // GPTに問い合わせ
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

          // 応答を会話履歴に追加
          history.push({ role: 'assistant', content: replyText });
        }

        // LINEへ返信
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
