const store = require('./utils/store')

App({
  globalData: {
    envId: 'home-order-d8gru5xigae87f189',
    user: null,
    cloudReady: false,
    bootError: ''
  },

  onLaunch() {
    this.initCloud()
    this.ready = this.bootstrap()
  },

  /**
   * 登录云开发：初始化云环境。
   */
  initCloud() {
    if (!wx.cloud) {
      console.warn('[cloud] 当前基础库不支持云开发')
      return
    }
    try {
      wx.cloud.init({
        env: 'home-order-d8gru5xigae87f189',
        traceUser: true
      })
      this.globalData.cloudReady = true
    } catch (err) {
      console.warn('[cloud] 初始化失败，请检查小程序 AppID 与云开发环境 ID', err)
    }
  },

  /**
   * 启动时：确保集合存在，并尝试恢复当前登录用户。
   */
  bootstrap() {
    if (!this.globalData.cloudReady) return Promise.resolve(null)
    return store.getCurrentUser(true).then(user => {
      this.globalData.user = user
      return user
    }).catch(err => {
      this.globalData.bootError = store.describeError(err)
      console.error('[cloud] 初始化数据失败', this.globalData.bootError, err)
      return null
    })
  }
})
