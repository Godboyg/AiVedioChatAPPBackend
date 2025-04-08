const mongoose = require("mongoose");
require("dotenv").config();

mongoose.connect(process.env.DB_URL).then(()=>{
    console.log("db connected");
})

const userSchema = new mongoose.Schema({
    email : {
        type: String
    },
    interest : {
        type: String
    },
    socketId : {
        type: String
    }
})

module.exports = mongoose.model("user",userSchema);