const express = require('express');
const line = require('@line/bot-sdk');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};
const client = new line.Client(lineConfig);

// 【新增】這顆超強心臟，專門處理 Agent 智能體的「跑馬燈串流 (streaming)」
async function askDifyAgent(queryText, userId) {
  const response = await fetch('https://api.dify.ai/v1/chat-messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      inputs: {},
      query: queryText,
      user: userId,
      response_mode: "streaming" // 【關鍵破關】：配合 Dify 智能體，強制改為串流模式！
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Dify 報錯: ${errText}`);
  }

  // 將 Dify 吐出來的碎片，拼湊成完整的文章
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let finalAnswer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.event === 'message' || data.event === 'agent_message') {
            finalAnswer += data.answer;
          }
        } catch (e) { /* 忽略格式不符的碎片 */ }
      }
    }
  }
  return finalAnswer;
}

app.get('/', (req, res) => {
  res.status(200).send('<h1>蔡承宏機器人運作中！伺服器狀態：健康 🟢</h1>');
});

// 2. 定時推播
app.post('/push-news', async (req, res) => {
  try {
    console.log('收到 cron-job 定時推播指令！');
    res.status(200).send('Push processing...');

    // 呼叫串流心臟去拿新聞
    const newsContent = await askDifyAgent("請幫我整理今天的房地產重要新聞，並加上蔡承宏的問候語。", "system-cron-job");
    
    console.log('新聞抓取成功，準備發送！');
    await client.broadcast({
      type: 'text',
      text: newsContent
    });
    console.log('🔥 LINE 推播發送成功！');

  } catch (error) {
    console.error('❌ 推播錯誤:', error.message);
  }
});

// 3. LINE 對話
app.post('/webhook', line.middleware(lineConfig), (req, res) => {
  Promise
    .all(req.body.events.map(async (event) => {
      if (event.type !== 'message' || event.message.type !== 'text') return null;

      try {
        // 呼叫串流心臟去思考回覆
        const answer = await askDifyAgent(event.message.text, event.source.userId);
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: answer
        });
      } catch (error) {
        console.error('❌ Dify 對話錯誤:', error.message);
        return client.replyMessage(event.replyToken, { type: 'text', text: '小編正在找資料，請稍後！' });
      }
    }))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`🚀 蔡承宏機器人正在 Port ${port} 運行中`);
});
