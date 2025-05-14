const { ChatGPTAPI } = require('chatgpt');
const fs = require('fs');
require('dotenv').config();


const api = new ChatGPTAPI({
  apiKey: process.env.OPENAI_API_KEY
});

function getCurrentDateStr() {
  return new Date().toLocaleDateString("ja-JP", {
    year: "numeric", month: "long", day: "numeric", weekday: "long"
  });
}

async function recommendFromShowaya() {
  const todayStr = getCurrentDateStr();
  const menuText = fs.readFileSync('./menu.txt', 'utf-8');

  const systemPrompt = `
あなたは昭和の雰囲気漂う居酒屋「笑わ家（しょうわや）」のマスターです。
お客様から「おすすめは？」と聞かれたら、
その日の曜日・季節・気分を考えて、料理1品とお酒1品をおすすめしてください。

口調は親しみやすく、昭和の大将らしくしてください（例：「〜だよ」「〜が合うんだよなぁ」など）

必ず、以下のメニューリストにある料理・酒からだけ選んでください。
リスト外の名前は絶対に使わないでください。

【笑わ家メニュー】
${menuText}

今日は ${todayStr} です。
`;

  const res = await api.sendMessage("おすすめは？", {
    systemMessage: systemPrompt
  });

  return res.text;
}

module.exports = { recommendFromShowaya };
