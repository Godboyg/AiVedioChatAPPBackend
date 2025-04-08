const { GoogleGenAI } = require("@google/genai");       

async function matchWithGemini(currentUser , io , activeUsers, socket) {

  const connectedSockets = await io.fetchSockets();
  let ids = connectedSockets.map(s => s.id);
  console.log('Connected socket IDs:', ids);
  let others = [];

  console.log("active users ai",activeUsers.entries());

  for (const [socketId, user] of activeUsers.entries()) {
    if(socketId === currentUser.socketId) continue;
    others.push([socketId, user]);
  }

  if (others.length === 0) {
    console.log("No other users to match with.");
    return null;
  }else{
    console.log("console.log others",others);
    console.log("ids length",ids.length);
  ids = ids.filter((id) => id !== currentUser.socketId);

  socket.emit("other user", others);

  socket.on("disconnect", () => {
    activeUsers.delete(currentUser.socketId);
    others = others.filter(([s , i]) => s.id !== currentUser.socketId);
    console.log("other users after disconnect",others);
  });

  const formattedList = others
    .map(([_, user], index) => `${index + 1}. ${user.interest}`)
    .join('\n');

    console.log("formatted users",formattedList);

    const prompt = `
You are a smart matcher.

Current user interest:
"${currentUser.interest}"

Other users:
${formattedList}

Which user is the best match based on similar or related interests?
 Respond only with the number like [number] and also respond with a comman line between them, dont give two response just give one and costomized.
`;

   const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

   async function main() {
      const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ text : prompt}],
   });
    let resultText = response.candidates?.[0]?.content?.parts?.[0]?.text;
    const part = resultText.split(",");
    if(part.length > 1){
        var message = response.candidates?.[0]?.content?.parts?.[0]?.text.split(',')[1].trim();
    }
    console.log("indexxxxxxx",resultText);
    console.log("message ",message);
    const matchIndex = parseInt(resultText?.match(/\[?(\d+)\]?/)?.[1]) - 1;
    console.log("match index",matchIndex);

    try {
      if(typeof message === "string"){
        const partner = others[matchIndex];
        console.log("khvjhv",others);
        console.log("partner socket......",partner);
        console.log("partner from ai called");
        const [ socketId , msg ] = partner;
        console.log("partner socketid from ai",socketId);
        others = others.filter(([id , _]) => id !== socketId && id !== currentUser.socketId);
        activeUsers.delete(currentUser.socketId);
        activeUsers.delete(socketId);
        socket.emit("list after connect", others);
        return { partner , message };
      }
    } catch (error) {
      console.log("error",error);
    }
  }

  const ps = await main();
  return ps;
  }
}

module.exports = matchWithGemini;