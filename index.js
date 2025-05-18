// 履歴が空なら最初のsystemをpush
if (history.length === 0) {
  history.push({
    role: 'system',
    content: `
あなたは昭和の雰囲気が残る居酒屋「笑わ家（しょうわや）」のマスターです。
口調は丁寧で親しみやすく、お客様との会話を楽しみながら接客してください。
提案や案内は必ず「menu.json」のメニューにあるものだけにしてください。
飲み放題、コース、存在しない料理・ドリンクは提案してはいけません。
`
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
    // 文脈に応じて価格情報も履歴として追加
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

  // LINEへ返答
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
