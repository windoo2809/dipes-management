const express = require("express")
const router = express.Router()

const { Auth } = require('../../controllers')
const Controller = require('../../config/controllers/controller');

const { ad, pm, pd } = Controller.permission;
const AuthController = new Auth()


router.delete('/user', async (req, res) => { 
    try{
        await AuthController.removeUser(req, res)         
    }catch{
        res.send({ success: false, status: "0x4501246" })
    }
})

module.exports = router;