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

// 串流心臟 (強化抓字能力)
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
      response_mode: "streaming"
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Dify 報錯: ${errText}`);
  }

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
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;
        try {
          const data = JSON.parse(jsonStr);
          // 只要裡面有 answer 欄位，就把它拼起來
          if (data.answer) {
            finalAnswer += data.answer;
          }
        } catch (e) { /* 忽略無法解析的碎片 */ }
      }
    }
  }
  return finalAnswer.trim(); // 去除前後多餘的空白
}

app.get('/', (req, res) => {
  res.status(200).send('<h1>蔡承宏機器人運作中！伺服器狀態：健康 🟢</h1>');
});

// 2. 定時推播
app.post('/push-news', async (req, res) => {
  try {
    console.log('收到 cron-job 定時推播指令！');
    res.status(200).send('Push processing...');

    const newsContent = await askDifyAgent("請幫我整理今天的房地產重要新聞，並加上蔡承宏的問候語。", "system-cron-job");
    
    console.log(`新聞抓取成功！內容長度: ${newsContent.length} 個字`);

    // 【關鍵防呆】：如果 Dify 當機沒給新聞 (字數為0)，給一個預設文字，絕對不讓 LINE 報錯 400
    const textToSend = newsContent || "早安！蔡承宏總經理提醒您，今日的房地產新聞正在整理中，請稍後直接在對話框輸入您的問題喔！";

    await client.broadcast({
      type: 'text',
      text: textToSend
    });
    console.log('🔥 LINE 推播發送成功！');

  } catch (error) {
    // 強化報錯機制，如果是 LINE 報錯，直接印出原因
    if (error.originalError && error.originalError.response) {
      console.error('❌ LINE 拒絕推播:', JSON.stringify(error.originalError.response.data));
    } else {
      console.error('❌ 推播發生錯誤:', error.message);
    }
  }
});

// 3. LINE 對話
app.post('/webhook', line.middleware(lineConfig), (req, res) => {
  Promise
    .all(req.body.events.map(async (event) => {
      if (event.type !== 'message' || event.message.type !== 'text') return null;

      try {
        const answer = await askDifyAgent(event.message.text, event.source.userId);
        
        // 防呆：如果 Dify 沒給答案，給個預設值
        const replyText = answer || "小編目前腦袋有點卡卡的，請重新再問一次喔！";

        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: replyText
        });
      } catch (error) {
        console.error('❌ Dify 對話錯誤:', error.message);
        return client.replyMessage(event.replyToken, { type: 'text', text: '系統整理資料中，請稍後！' });
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
