// 引入需要的套件 (工具包)
const express = require('express');
const line = require('@line/bot-sdk');
require('dotenv').config();

const app = express();
// 設定伺服器的 Port 號
const port = process.env.PORT || 10000;

// 1. 從環境變數讀取 LINE 的鑰匙
const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(lineConfig);

// 首頁測試畫面
app.get('/', (req, res) => { res.send('🏡 蔡承宏-台灣房地產創富指南 AI 系統已啟動！'); });

// 接收 LINE 傳來的訊息的入口
app.post('/webhook', line.middleware(lineConfig), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// 處理訊息的詳細步驟
async function handleEvent(event) {
  // 如果不是文字訊息，就不處理
  if (event.type !== 'message' || event.message.type !== 'text') return Promise.resolve(null);
  
  const userMessage = event.message.text;
  const userId = event.source.userId;

  try {
    // 2. 呼叫 Dify 知識庫大腦 (代替 Coze)
    const response = await fetch('https://api.dify.ai/v1/chat-messages', {
        method: 'POST',
        headers: {
            // 使用環境變數裡的 Dify 鑰匙
            'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            inputs: {},
            query: userMessage, // 直接把客戶問的問題丟給 Dify
            response_mode: "blocking", // 等待 Dify 回答
            user: userId // 讓 Dify 記得這是哪個客人在問問題
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || '呼叫 Dify 發生錯誤');
    }

    // 取得 Dify 產生出來的專業回答
    const responseText = data.answer;
    
    // 3. 把回答傳回給 LINE 的使用者
    return client.replyMessage(event.replyToken, { 
        type: 'text', 
        text: responseText
    });
    
  } catch (error) { 
      console.error(error);
      return client.replyMessage(event.replyToken, { 
          type: 'text', 
          text: `不好意思，系統維護中，請稍後再試喔！` 
      });
  }
}

// 啟動伺服器
app.listen(port, () => { console.log(`🚀 伺服器已啟動`); });
