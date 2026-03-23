const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
require('dotenv').config();

const app = express();

const lineConfig = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
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
    // 【關鍵修正 1】：一般對話加入 inputs 以防 400 錯誤
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
    if (error.response) {
      console.error('Dify 對話拒絕原因:', JSON.stringify(error.response.data));
    } else {
      console.error('Dify 連線失敗:', error.message);
    }
    return client.replyMessage(event.replyToken, { type: 'text', text: '小編正在找資料，請稍後！' });
  }
}

// 2. 處理每天早上的「定時推播」 (cron-job 會打這個網址)
app.post('/push-news', async (req, res) => {
  try {
    console.log('收到定時推播指令，開始向 Dify 索取今日新聞...');
    
    // 【關鍵修正 2】：推播功能加入 inputs 以防 400 錯誤
    const difyResponse = await axios.post('https://api.dify.ai/v1/chat-messages', {
      inputs: { "query": "請幫我整理今天的房地產重要新聞，並加上蔡承宏的問候語。" },
      query: "請幫我整理今天的房地產重要新聞，並加上蔡承宏的問候語。",
      user: "system-cron-job", // 設定一個假的用戶 ID 代表系統發送
      response_mode: "blocking"
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const newsContent = difyResponse.data.answer;

    console.log('新聞抓取成功，準備發送給所有客戶...');

    // 將新聞廣播給所有加好友的人 (注意：此功能需 LINE 官方帳號有推播額度)
    await client.broadcast({
      type: 'text',
      text: newsContent
    });

    console.log('推播完成！');
    res.status(200).send('Push success');

  } catch (error) {
    if (error.response) {
      console.error('Dify 推播拒絕原因:', JSON.stringify(error.response.data));
    } else {
      console.error('推播發生錯誤:', error.message);
    }
    res.status(500).send('Push failed');
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`🚀 蔡承宏機器人正在 Port ${port} 運行中`);
});
