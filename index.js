const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
require('dotenv').config();

const app = express();

// 【新增】：讓伺服器可以看懂一般傳進來的資料 (這行非常關鍵！)
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, // 這裡已經配對你的變數名稱
  channelSecret: process.env.CHANNEL_SECRET             // 這裡也是
};
const client = new line.Client(lineConfig);

// 1. 處理 LINE 的一般對話
app.post('/webhook', line.middleware(lineConfig), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error('Webhook 錯誤:', err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userMessage = event.message.text;
  const userId = event.source.userId;

  try {
    const difyResponse = await axios.post('https://api.dify.ai/v1/chat-messages', {
      inputs: { "query": userMessage },
      query: userMessage,
      user: userId,
      response_mode: "blocking"
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: difyResponse.data.answer
    });
  } catch (error) {
    console.error('Dify 連線失敗:', error.message);
    return client.replyMessage(event.replyToken, { type: 'text', text: '小編正在找資料，請稍後！' });
  }
}

// 2. 處理每天早上的「定時推播」 (cron-job 會打這個網址)
app.post('/push-news', async (req, res) => {
  try {
    console.log('收到 cron-job 推播指令！準備執行...');
    
    // 【新增】：先回覆 cron-job 說「我收到了」，避免它等太久判定 502
    res.status(200).send('Cron job received, processing...');

    const difyResponse = await axios.post('https://api.dify.ai/v1/chat-messages', {
      inputs: { "query": "請幫我整理今天的房地產重要新聞，並加上蔡承宏的問候語。" },
      query: "請幫我整理今天的房地產重要新聞，並加上蔡承宏的問候語。",
      user: "system-cron-job", 
      response_mode: "blocking"
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const newsContent = difyResponse.data.answer;
    console.log('新聞抓取成功，準備發送！');

    await client.broadcast({
      type: 'text',
      text: newsContent
    });
    console.log('LINE 推播完成！');

  } catch (error) {
    console.error('推播發生錯誤:', error.message);
  }
});

// 【新增】：加一個簡單的首頁測試，確認伺服器有活著
app.get('/', (req, res) => {
  res.send('蔡承宏機器人運作中！');
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`🚀 蔡承宏機器人正在 Port ${port} 運行中`);
});
