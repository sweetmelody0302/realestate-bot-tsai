const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};
const client = new line.Client(lineConfig);

app.get('/', (req, res) => {
  res.status(200).send('<h1>蔡承宏機器人運作中！伺服器狀態：健康 🟢</h1>');
});

// 2. 定時推播
app.post('/push-news', async (req, res) => {
  try {
    console.log('收到 cron-job 定時推播指令！');
    res.status(200).send('Push processing...');

    const difyResponse = await axios.post('https://api.dify.ai/v1/chat-messages', {
      inputs: {}, // 【關鍵修正】：保持空物件，Dify 最喜歡這樣，不會報錯
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
    console.log('🔥 LINE 推播發送成功！');

  } catch (error) {
    // 【照妖鏡】：把 Dify 罵人的話原封不動印出來
    if (error.response) {
      console.error('❌ Dify 拒絕推播原因:', JSON.stringify(error.response.data));
    } else {
      console.error('推播發生錯誤:', error.message);
    }
  }
});

// 3. LINE 對話
app.post('/webhook', line.middleware(lineConfig), (req, res) => {
  Promise
    .all(req.body.events.map(async (event) => {
      if (event.type !== 'message' || event.message.type !== 'text') return null;

      try {
        const difyResponse = await axios.post('https://api.dify.ai/v1/chat-messages', {
          inputs: {}, // 【關鍵修正】：這裡也保持空物件
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
        if (error.response) {
          console.error('❌ Dify 拒絕對話原因:', JSON.stringify(error.response.data));
        }
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
