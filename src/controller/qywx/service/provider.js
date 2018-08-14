const Base = require('../../base.js')
const Config = think.config('qywx').provider
const APIBaseURI = 'https://qyapi.weixin.qq.com/cgi-bin/service'
const xml2js = require('xml2js')
const WXBizMsgCrypt = require('wechat-crypto')
const cryptor = new WXBizMsgCrypt(Config.token, Config.encoding_aeskey, Config.corpid)
const postJson = function(body) {
  return {
    method: 'POST',
    header: 'Content-Type:application/json',
    body: JSON.stringify(body)
  }
}
function parseXML(xml) {
  return new Promise((resolve, reject) => {
    xml2js.parseString(xml, { trim: true }, function(err, obj) {
      if (err) {
        return reject(err)
      }
      resolve(obj)
    })
  })
}
function formatMessage(result) {
  var message = {}
  if (typeof result === 'object') {
    for (var key in result) {
      if (!(result[key] instanceof Array) || result[key].length === 0) {
        continue
      }
      if (result[key].length === 1) {
        var val = result[key][0]
        if (typeof val === 'object') {
          message[key] = formatMessage(val)
        } else {
          message[key] = (val || '').trim()
        }
      } else {
        message[key] = result[key].map(function(item) {
          return formatMessage(item)
        })
      }
    }
  }
  return message
}
module.exports = class extends Base {
  indexAction() {
    // return this.display();
    return (this.body = 'success')
  }
  async getProviderAccessTokenAction() {
    const url = `${APIBaseURI}/get_provider_token`
    const postData = {
      corpid: Config.corpid,
      provider_secret: Config.secret
    }
    const res = await this.fetch(url, postJson(postData)).then((res) => res.json()).catch((err) => err)
    return this.success(res)
  }

  /**
   * 接受微信服务器推送事件的接口
   * https://www.jun1yun.com/qywx/service/provider/receiver
   */
  async receiverAction() {
    const signature = this.get('msg_signature')
    const timestamp = this.get('timestamp')
    const nonce = this.get('nonce')
    const echostr = this.get('echostr')
    if (this.isPost) {
      // 接受回调事件
      try {
        let cryptor_post = new WXBizMsgCrypt(Config.token, Config.encoding_aeskey, Config.corpid)
        // 取原始数据
        let xml = this.post()
        // console.log(xml);
        let result = await parseXML(xml)
        let formated = formatMessage(result.xml)
        // 解密
        let encryptMessage = formated.Encrypt
        if (query.msg_signature !== cryptor_post.getSignature(timestamp, nonce, encryptMessage)) {
          this.status = 401
          this.body = 'Invalid signature'
          return
        }
        let decryptedXML = cryptor_post.decrypt(encryptMessage)
        let messageWrapXml = decryptedXML.message
        if (messageWrapXml === '') {
          this.status = 401
          this.body = 'Invalid signature'
          return
        }
        // 再解码
        let decodedXML = await parseXML(messageWrapXml)
        formated = formatMessage(decodedXML.xml)
        // 处理业务
        await do_biz(formated)

        this.status = 200
        this.body = 'success' // 直接返回success通知微信服务器已经收到推送的内容
      } catch (error) {
        console.log(error)
        this.status = 500
        this.body = 'internal server error ' + error.message
      }
      // 业务逻辑处理
      // 注意不要在业务逻辑中操作 body、type
    } else {
      // 接入验证 GET
      const cryptor_get = new WXBizMsgCrypt(Config.token, Config.encoding_aeskey, Config.corpid)
      let valid = signature === cryptor_get.getSignature(timestamp, nonce, echostr)
      if (!valid) {
        this.status = 401
        this.body = 'Invalid signature'
      } else {
        let decrypted = cryptor_get.decrypt(echostr)
        this.body = decrypted.message
      }
    }
  }
}

const do_biz = async function(data) {
  console.log(data)
}
