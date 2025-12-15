const mongoose=require('mongoose')

const connectDB=async()=>{
    try {
        await mongoose.connect(`${process.env.DATABASE_URI}/StockTraderV2DB`)
    } catch (error) {
        console.log(error)
    }
}

module.exports=connectDB