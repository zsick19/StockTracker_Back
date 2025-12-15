const allowedOrigins=require('./allowedOrigins')

const corsConfigure={
    origin:(origin,callback)=>{
        if(allowedOrigins.indexOf(origin)!==-1||!origin){
            callback(null,true)
        }else{
            callback(new Error('Not allowed by CORS'))
        }
    },
    credentials:true,
    optionSuccessStatus:200,
    methods:["GET","POST","PUT","PATCH","DELETE"]
}

module.exports=corsConfigure