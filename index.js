app.post('/webhook', async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userMessage = event.message.text;
      const replyToken = event.replyToken;
      const userId = event.source.userId;

      // 会話履歴がなければ初期化
      if (!conversationMap.has(userId)) {
        conversationMap.set(userId, []);
      }

      const history = conversationMap.get(userId);

      // 履歴が空ならsystemプロンプトを追加
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
          replyText = recommendFromShowaya();
        } else {
          if (priceAnswer) {
            history.push({
              role: 'assistant',
              content: priceAnswer
            });
          }

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
