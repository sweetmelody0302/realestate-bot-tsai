// 1. 引入必要零件
const express = require('express');
const line = require('@line/bot-sdk');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 10000;

// 2. LINE 通訊設定
const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(lineConfig);

// 3. 測試首頁 (確定伺服器有活著)
app.get('/', (req, res) => { res.send('🏡 蔡承宏房地產 AI 系統已啟動！'); });

// 4. 接收 LINE 訊息的入口 (Webhook)
app.post('/webhook', line.middleware(lineConfig), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error('發生錯誤：', err);
      res.status(500).end();
    });
});

// 5. 處理每一條訊息的詳細步驟
async function handleEvent(event) {
  // 只處理文字訊息，其餘（貼圖、圖片等）直接跳過
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userMessage = event.message.text;

  try {
    // 🌟 幫大腦戴上手錶：計算現在的國曆與農曆時間
    const now = new Date();
    const solarTime = now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    const lunarTime = new Intl.DateTimeFormat('zh-TW-u-ca-chinese', { 
        dateStyle: 'long', 
        timeZone: 'Asia/Taipei' 
    }).format(now);

    // 🚀 向 Dify 大腦請求答案
    const response = await fetch('https://api.dify.ai/v1/chat-messages', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        inputs: {},
        // 將時間資訊塞入 query，讓 Dify 知道現在是幾號
        query: `[系統提示：現在是 ${solarTime}，農曆 ${lunarTime}]\n${userMessage}`,
        response_mode: "blocking",
        user: event.source.userId // 讓 Dify 記住這位客人的對話紀錄
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || '呼叫 Dify API 失敗');
    }

    // 取得 Dify 產出的專業房產回答
    const aiAnswer = data.answer;

    // 💬 將答案回傳給 LINE 客戶
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: aiAnswer
    });

  } catch (error) {
    console.error('Dify 連線失敗：', error);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '小助手正在整理最新的房產資料，請稍後再試，或直接聯絡蔡顧問！'
    });
  }
}

// 6. 啟動伺服器監聽
app.listen(port, () => {
  console.log(`🚀 蔡承宏機器人正在 Port ${port} 運行中`);
});
