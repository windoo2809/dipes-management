const express = require("express")
const router = express.Router()

const ApiControllerClass = require("../../controllers/APIController")

const ApiController = new ApiControllerClass()

router.get('/v/:version_id', async (req, res) => { 
    await ApiController.get( req, res )         
    try{
    }catch{
        res.send({ success: false, status: "0x4501246" })
    }
})

module.exports = router;