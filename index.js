const express = require('express');
const line = require('@line/bot-sdk');
require('dotenv').config();

const app = express();
const port = 10000; 

const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(lineConfig);

// 🚨 關鍵修復：這裡已經把雞婆的 express.json() 拿掉了！
app.post('/webhook', line.middleware(lineConfig), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error('Webhook 處理錯誤:', err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return Promise.resolve(null);
  
  try {
    const response = await fetch('https://api.dify.ai/v1/chat-messages', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        inputs: {},
        query: event.message.text,
        response_mode: "streaming", 
        user: event.source.userId
      })
    });

    if (!response.ok) {
      throw new Error(`Dify 伺服器回應錯誤: ${response.status}`);
    }

    let fullAnswer = "";
    const decoder = new TextDecoder("utf-8");
    
    for await (const chunk of response.body) {
      const text = decoder.decode(chunk);
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            if (data.answer) {
              fullAnswer += data.answer;
            }
          } catch (e) {
            // 忽略解析錯誤
          }
        }
      }
    }

    if (!fullAnswer || fullAnswer.trim() === "") {
      fullAnswer = "搜尋完畢，但目前沒有找到合適的資料，請稍後再試。";
    }

    return client.replyMessage(event.replyToken, { type: 'text', text: fullAnswer });
    
  } catch (error) {
    console.error('Dify 連線失敗:', error);
    return client.replyMessage(event.replyToken, { 
      type: 'text', 
      text: '小助手正在整理最新的房產資料，請稍後再試，或直接聯絡蔡顧問！' 
    });
  }
}
// ====== 新增：每日自動推播新聞的入口 ======
app.post('/push-news', async (req, res) => {
  try {
    // 1. 叫大腦自己去查今天的新聞（因為不用打字給用戶看，所以用 blocking 模式即可）
    const difyResponse = await fetch('https://api.dify.ai/v1/chat-messages', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        inputs: {},
        query: "請搜尋今天台灣房地產的5則最新新聞，並加上摘要與連結，整理成專業推播文",
        response_mode: "blocking", 
        user: "system-auto-push"
      })
    });

    const data = await difyResponse.json();
    let newsMessage = data.answer;
    
    // 如果大腦偷懶沒回話的防呆機制
    if (!newsMessage) {
        newsMessage = "今日房產新聞整理中，請稍後再為您奉上！";
    }

    // 2. 把整理好的新聞廣播給所有加入蔡總好友的人
    await client.broadcast({ type: 'text', text: newsMessage });
    
    res.status(200).send('✅ 每日新聞推播成功！');
  } catch (error) {
    console.error('推播失敗:', error);
    res.status(500).send('❌ 推播失敗');
  }
});
// ====== 取代 n8n 的每日自動推播按鈕 ======
app.post('/push-news', async (req, res) => {
  try {
    // 1. 叫大腦自己去查今天的新聞（因為不用打字給用戶看，直接用 blocking 模式）
    const response = await fetch('https://api.dify.ai/v1/chat-messages', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        inputs: {},
        query: "請搜尋今天台灣房地產的5則最新新聞，並加上摘要與連結，整理成專業推播文",
        response_mode: "blocking", 
        user: "system-auto-push"
      })
    });

    const data = await response.json();
    let newsMessage = data.answer;
    
    // 防呆：如果大腦沒抓到資料
    if (!newsMessage || newsMessage.trim() === "") {
        newsMessage = "今日房產新聞整理中，請稍後再為您奉上！";
    }

    // 2. 把整理好的新聞，廣播給所有加入蔡總好友的人
    await client.broadcast({ type: 'text', text: newsMessage });
    
    res.status(200).send('✅ 每日新聞推播成功！');
  } catch (error) {
    console.error('推播失敗:', error);
    res.status(500).send('❌ 推播失敗');
  }
});
app.listen(port, () => console.log(`🚀 蔡承宏機器人正在 Port ${port} 運行中`));
