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

// ==========================================
// 1. Webhook (被動接收訊息)
// ==========================================
app.post('/webhook', line.middleware(lineConfig), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error('Webhook Error:', err);
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
        response_mode: "streaming", // 乖乖用 streaming
        user: event.source.userId
      })
    });

    if (!response.ok) throw new Error(`Dify API 錯誤: ${response.status}`);

    let fullAnswer = "";
    const decoder = new TextDecoder("utf-8");
    let buffer = ""; // 🚨 終極修復：加入緩衝區黏合斷句

    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 把不完整的片段留到下一圈黏合

      for (const line of lines) {
        if (line.trim().startsWith('data:')) {
          try {
            const jsonStr = line.replace(/^data:\s*/, '').trim();
            if (jsonStr === '[DONE]') continue;
            const data = JSON.parse(jsonStr);
            if (data.answer) fullAnswer += data.answer;
          } catch (e) {} // 忽略解析雜訊
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

// ==========================================
// 2. 每日定時推播 (Push-news)
// ==========================================
app.post('/push-news', async (req, res) => {
  try {
    const response = await fetch('https://api.dify.ai/v1/chat-messages', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        inputs: {},
        query: "請搜尋今天台灣房地產的5則最新新聞，並加上摘要與連結，整理成專業推播文",
        response_mode: "streaming", // 乖乖用 streaming
        user: "system-auto-push"
      })
    });

    if (!response.ok) throw new Error(`Dify API 錯誤: ${response.status}`);

    let fullAnswer = "";
    const decoder = new TextDecoder("utf-8");
    let buffer = ""; // 🚨 終極修復：加入緩衝區黏合斷句

    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); 

      for (const line of lines) {
        if (line.trim().startsWith('data:')) {
          try {
            const jsonStr = line.replace(/^data:\s*/, '').trim();
            if (jsonStr === '[DONE]') continue;
            const data = JSON.parse(jsonStr);
            if (data.answer) fullAnswer += data.answer;
          } catch (e) {}
        }
      }
    }

    if (!fullAnswer || fullAnswer.trim() === "") {
        fullAnswer = "今日房產新聞整理中，請稍後再為您奉上！";
    }

    await client.broadcast({ type: 'text', text: fullAnswer });
    res.status(200).send('✅ 每日新聞推播成功！');
    
  } catch (error) {
    console.error('推播失敗:', error);
    res.status(500).send('❌ 推播失敗');
  }
});

app.listen(port, () => console.log(`🚀 蔡承宏機器人正在 Port ${port} 運行中`));
