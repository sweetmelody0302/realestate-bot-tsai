const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
require('dotenv').config();

const app = express();

const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};
const client = new line.Client(lineConfig);

// 1. 首頁測試 (測大門有沒有開)
app.get('/', (req, res) => {
  res.status(200).send('<h1>蔡承宏機器人運作中！伺服器狀態：健康 🟢</h1>');
});

// 2. 定時推播 (cron-job 會打這個網址，獨立解析)
app.post('/push-news', express.json(), async (req, res) => {
  try {
    console.log('收到 cron-job 定時推播指令！');
    // 先回報 200 給 cron-job，避免它等太久以為當機
    res.status(200).send('Push processing...'); 

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

    await client.broadcast({
      type: 'text',
      text: difyResponse.data.answer
    });
    console.log('推播完成！');
  } catch (error) {
    console.error('推播錯誤:', error.message);
  }
});

// 3. LINE 對話 (自帶 LINE 專屬防護罩，絕對不會衝突)
app.post('/webhook', line.middleware(lineConfig), (req, res) => {
  Promise
    .all(req.body.events.map(async (event) => {
      if (event.type !== 'message' || event.message.type !== 'text') return null;

      try {
        const difyResponse = await axios.post('https://api.dify.ai/v1/chat-messages', {
          inputs: { "query": event.message.text },
          query: event.message.text,
          user: event.source.userId,
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
        console.error('Dify 對話錯誤:', error.message);
        return client.replyMessage(event.replyToken, { type: 'text', text: '小編正在找資料，請稍後！' });
      }
    }))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// 讓 Zeabur 自動分配 Port
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`🚀 蔡承宏機器人正在 Port ${port} 運行中`);
});
