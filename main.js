const express = require("express");
const app = express();
const http = require("http");
const { Server } = require("socket.io");
const server = http.createServer(app);
const cors = require("cors");
const userModel = require("./db/mongoose");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const matchWithGemini = require("./ai.js");

const io = new Server(server , {
  cors : {
  origin: ['https://aivediochatapp.netlify.app' , 'http://localhost:5173'],
  methods: ['GET', 'POST'],
  credentials: true,
  }
});

var socketId = null;
let psId = null;
const activeUsers = new Map();

app.set('trust proxy', 1);
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.json());
app.use(cors({
  origin: ['https://aivediochatapp.netlify.app' , 'http://localhost:5173'],
  methods: ['GET', 'POST'],
  credentials: true,
}));

app.get("/",(req,res)=>{
  res.send("hello");
})

app.get("/ping", (req, res) => res.send("pong"));

app.post("/login",async(req,res)=>{

  const { email, interest } = req.body;
  const CurrentUser = await userModel.findOne({ email : email });

  if(CurrentUser){
    try {
      const user = await userModel.findOneAndUpdate(
        { email: email },                     
        { interest: interest },            
        { new: true }                      
      );
  
      if (!user) {
        console.log('User not found');
        return null;
      }

      const token = jwt.sign({ _id : user.id , email : user.email }, process.env.Secret , {
        expiresIn : "10d"
      })
       
      res.cookie("auth_token",token,{
        httpOnly: true,
        maxAge: 10 * 24 * 60 * 60, 
      })
  
      console.log('User found:', user);
      res.json({ message : "user updated", user , token});
      return user;
    } catch (error) {
      console.error('Error finding user:', error);
    }
  }else{

    const user = new userModel({
      email,
      interest
    })
  
    await user.save();
  
    const token = jwt.sign({ _id : user.id , email : user.email }, process.env.Secret , {
      expiresIn : "5d"
    })
  
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: false,
    });
  
    res.json({ message : "user created", user , token});

  }
})

io.use((socket, next) => {
  const cookie = socket.handshake.headers.cookie;
  console.log('🔍 Incoming headers:', socket.handshake.headers.cookie);
  if (!cookie) return next(new Error("No cookie found"));

  const token = cookie
    .split('; ')
    .find(row => row.startsWith('token='))
    ?.split('=')[1];

  if (!token) return next(new Error("No token found"));

  try {
    const decoded = jwt.verify(token, process.env.Secret);
    socket.userId = decoded._id;
    next();
  } catch (err) {
    console.log("error",err);
    return next(new Error("Invalid token"));
  }
});

io.on("connection", async(socket) => {
    console.log("A user connected: ", socket.id);
    const userId = socket.userId;

    if (userId) {
      try {
        await userModel.findByIdAndUpdate(userId, { socketId: socket.id });
        console.log(`Stored socket ID for user ${userId}: ${socket.id}`);
        const currentUser = await userModel.findOne({ socketId : socket.id});
        activeUsers.set(socket.id , { interest : currentUser.interest });
        const ps = await matchWithGemini(currentUser , io ,  activeUsers , socket);
        console.log("response from ai to backend", ps);
        if(ps === null || ps === undefined){
          console.log("no user to match");
          socket.emit("no user!","there is no current user");
        }else{
          const { partner , message } = ps;
          const [ socketId, userObject ] = partner;
          console.log("socket from ai",socketId);
          psId = socketId;
          console.log("peer id",psId);
          io.to(socketId).emit("user found!","user found with the interest",message , socket.id);
          socket.emit("user found!","user found with the interest",message,psId);
        }
      } catch (error) {
        console.error("Error updating socket ID:", error);
      }
    }

    socket.on("send-message" , (val) => {
      socket.emit("received-message" , val);
      io.to(val.sender).emit("received-message" , val);
    })

  socket.on("offer", ({ peerId , offer})=>{
    io.to(peerId).emit("offer", { offer });
  })

  socket.on("answer", ({ peerId , answer }) => {
    io.to(peerId).emit("answer", { answer });
  });

  socket.on("candidate", ({ peerId ,candidate }) => {
    io.to(peerId).emit("candidate", { candidate });
  });

  socket.on("user left to connect", (val)=> {
    io.emit("user left to reach",val);
    socket.emit("user left to reach",val);
  });

  socket.on("disconnect", () => {
    activeUsers.delete(socket.id);
    activeUsers.delete(psId);
    console.log("user disconnected",socket.id);
  });
})

server.listen(5000,()=>{
    console.log("server connected");
})
